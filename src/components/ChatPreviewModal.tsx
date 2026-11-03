import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCardStore } from '../store/useCardStore';
import { useDialogStore } from '../store/useDialogStore';
import { useModalA11y } from '../hooks/useModalA11y';
import { CardAvatar } from './CardAvatar';
import { getCardCoverUrl } from './gallery/galleryUtils';
import type { StoredCard } from '../db';
import { countTokens, countTokensAsync } from '../utils/tokenizer';
import { shouldSendOnEnter } from '../utils/chatKeys';
import { fixChatMarkup, parseChatMarkup } from '../core/chatMarkup';
import {
  canRegenerate,
  dropLast,
  hasUserMessage,
  historyForRegenerate,
  replaceLastText,
} from '../utils/chatHistory';
import { scanLorebook, type LorebookScanDebugInfo } from '../utils/lorebookScan';
import {
  buildInitialGreetingMessages,
  executeConversationTurn,
  type ChatMessage,
  type SceneCharacter,
} from '../services/conversationEngine';
import {
  X,
  Send,
  RefreshCw,
  Pencil,
  Trash2,
  RotateCcw,
  User,
  MessageSquare,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Bot,
  Users,
  BookOpen,
  EllipsisVertical,
} from 'lucide-react';

export const ChatPreviewModal: React.FC = () => {
  const {
    isChatPreviewOpen,
    setChatPreviewOpen,
    chatPreviewGreetingIndex,
    activeCard,
    activeCardUuid,
    activeCardEmbeddedAssets,
    cards,
    profiles,
    activeProfileUuid,
    setActiveProfileUuid,
  } = useCardStore();
  const activeProfile = profiles.find((p) => p.uuid === activeProfileUuid);
  const provider = activeProfile?.provider;

  const [inputMsg, setInputMsg] = useState('');
  const [userName, setUserName] = useState('User');
  const [userNameDraft, setUserNameDraft] = useState('User');
  const [activeGreetingIdx, setActiveGreetingIdx] = useState<number>(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditingLastMessage, setIsEditingLastMessage] = useState(false);
  const [editMessageDraft, setEditMessageDraft] = useState('');
  const [typingSpeaker, setTypingSpeaker] = useState<string | null>(null);
  const [groupMemberUuids, setGroupMemberUuids] = useState<string[]>([]);
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [isLorebookDebugOpen, setIsLorebookDebugOpen] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const editMessageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const isTouchDevice =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches ?? false);

  const commitUserNameDraft = () => {
    const nextName = userNameDraft.trim() || 'User';
    setUserNameDraft(nextName);
    setUserName(nextName);
  };

  const lorebookDebug = useMemo(() => {
    if (!activeCard || !activeCard.data.character_book) return null;
    return scanLorebook(
      activeCard.data.character_book,
      messages,
      userName,
      activeCard.data.name || 'Character'
    );
  }, [activeCard, messages, userName]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Full cast for this preview session: the active card plus any characters
  // added to the "Group Preview" scene from the gallery.
  const primaryCoverUrl = useMemo(
    () =>
      activeCard
        ? getCardCoverUrl({
            cardData: activeCard,
            embeddedAssets: activeCardEmbeddedAssets,
          } as StoredCard) || activeCard.data.avatar
        : undefined,
    [activeCard, activeCardEmbeddedAssets]
  );

  const sceneCharacters: SceneCharacter[] = useMemo(() => {
    if (!activeCard) return [];
    const primary: SceneCharacter = {
      uuid: activeCardUuid || 'primary',
      name: activeCard.data.name || 'Character',
      avatar: primaryCoverUrl,
      data: activeCard.data,
    };
    const members = groupMemberUuids
      .map((uuid) => cards.find((c) => c.uuid === uuid))
      .filter((c): c is StoredCard => !!c)
      .map((c) => ({
        uuid: c.uuid,
        name: c.cardData.data.name || c.name || 'Character',
        avatar: getCardCoverUrl(c) || c.cardData.data.avatar,
        data: c.cardData.data,
      }));
    return [primary, ...members];
  }, [activeCard, activeCardUuid, primaryCoverUrl, groupMemberUuids, cards]);

  const isGroupMode = sceneCharacters.length > 1;

  useEffect(() => {
    if (!isChatMenuOpen) return;

    const handleClickOutside = (event: PointerEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setIsChatMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isChatMenuOpen]);

  useEffect(() => {
    if (!isChatMenuOpen) commitUserNameDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatMenuOpen]);

  useEffect(() => {
    if (!isChatPreviewOpen || !activeCard || sceneCharacters.length === 0) return;
    const nextIdx = chatPreviewGreetingIndex || 0;
    setActiveGreetingIdx(nextIdx);
    const initialMsgs = buildInitialGreetingMessages(sceneCharacters, userName, nextIdx);
    setMessages(initialMsgs);
    setIsEditingLastMessage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatPreviewOpen, chatPreviewGreetingIndex]);

  useEffect(() => {
    if (!activeCard || sceneCharacters.length === 0) return;
    const initialMsgs = buildInitialGreetingMessages(sceneCharacters, userName, activeGreetingIdx);
    setMessages(initialMsgs);
    setIsEditingLastMessage(false);
    // userName is handled separately so editing the name cannot reset an active conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCard, activeGreetingIdx, groupMemberUuids.join(',')]);

  useEffect(() => {
    if (!activeCard || sceneCharacters.length === 0) return;
    if (messages.some((message) => message.role === 'user')) return;

    setMessages(buildInitialGreetingMessages(sceneCharacters, userName, activeGreetingIdx));
    // Read the latest messages only when userName changes; do not rebuild after chat has started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  useEffect(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [inputMsg]);

  useEffect(() => {
    if (!isEditingLastMessage) return;
    const textarea = editMessageTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = String(textarea.scrollHeight) + 'px';
  }, [editMessageDraft, isEditingLastMessage]);

  const [exactChatTokens, setExactChatTokens] = useState<number | null>(null);

  const fallbackChatTokens = useMemo(() => {
    return messages.reduce((acc, m) => acc + countTokens(m.text, true, provider), 0);
  }, [messages, provider]);

  useEffect(() => {
    if (messages.length === 0) {
      setExactChatTokens(0);
      return;
    }
    let isCancelled = false;
    const fullText = messages.map((m) => m.text).join('\n\n');
    countTokensAsync(fullText, true, activeProfile).then((cnt) => {
      if (!isCancelled) {
        setExactChatTokens(cnt);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [messages, activeProfile]);

  const totalChatTokens = exactChatTokens !== null ? exactChatTokens : fallbackChatTokens;

  const modalRef = useModalA11y(isChatPreviewOpen, () => setChatPreviewOpen(false));

  if (!isChatPreviewOpen || !activeCard) return null;

  const d = activeCard.data;
  const allGreetings = [
    d.first_mes || 'Hello!',
    ...(d.alternate_greetings || []),
  ];

  const toggleGroupMember = (uuid: string) => {
    setGroupMemberUuids((prev) =>
      prev.includes(uuid) ? prev.filter((u) => u !== uuid) : [...prev, uuid]
    );
  };

  const handleResetChat = () => {
    const initialMsgs = buildInitialGreetingMessages(sceneCharacters, userName, activeGreetingIdx);
    setMessages(initialMsgs);
    setIsEditingLastMessage(false);
  };

  const showMissingProfileAlert = async () => {
    await useDialogStore.getState().showAlert(
      'Please configure a connection profile in Settings before starting a test chat.',
      'Missing Configuration',
      'warning'
    );
  };

  const generateConversationTurn = async (history: ChatMessage[], userText: string) => {
    if (!activeProfile) {
      await showMissingProfileAlert();
      return;
    }

    setIsEditingLastMessage(false);
    setIsGenerating(true);

    try {
      await executeConversationTurn({
        profile: activeProfile,
        sceneCharacters,
        history,
        userTurnInput: userText,
        userName,
        onSpeakerTyping: (speaker) => setTypingSpeaker(speaker),
        onStepMessage: (_newMsg, updatedHistory) => setMessages(updatedHistory),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `[Error generating response: ${message}]` },
      ]);
    } finally {
      setIsGenerating(false);
      setTypingSpeaker(null);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isGenerating) return;

    if (!activeProfile) {
      await showMissingProfileAlert();
      return;
    }

    const userText = inputMsg;
    setInputMsg('');
    await generateConversationTurn(messages, userText);
  };

  const handleRegenerate = async () => {
    if (isGenerating || !canRegenerate(messages)) return;

    if (!activeProfile) {
      await showMissingProfileAlert();
      return;
    }

    const history = historyForRegenerate(messages);
    setMessages(history);
    setIsEditingLastMessage(false);
    await generateConversationTurn(history, '');
  };

  // Render the small, safe chat-markup subset in display only.
  const renderRoleplayText = (text: string) => {
    const renderTokens = (tokens: ReturnType<typeof parseChatMarkup>): React.ReactNode[] =>
      tokens.map((token, idx) => {
        const children = token.children ? renderTokens(token.children) : token.text;
        switch (token.type) {
          case 'italic':
            return (
              <em key={idx} className="text-amber-300/90 not-italic italic font-serif opacity-90">
                {children}
              </em>
            );
          case 'bold':
            return <strong key={idx} className="font-semibold">{children}</strong>;
          case 'strike':
            return <s key={idx}>{children}</s>;
          case 'code':
            return (
              <code key={idx} className="rounded bg-black/20 px-1 font-mono text-[0.9em]">
                {token.text}
              </code>
            );
          case 'text':
            return <span key={idx}>{token.text}</span>;
        }
      });

    return renderTokens(parseChatMarkup(fixChatMarkup(text)));
  };

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label="Test Chat Preview"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-void-950 flex flex-col h-full w-full overflow-hidden animate-fadeIn"
    >
      <div className="bg-void-900 w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-knight-700/40 flex items-center justify-between gap-3 bg-void-950/90 backdrop-blur-md shrink-0">
          <div className="flex flex-1 items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              onClick={() => setChatPreviewOpen(false)}
              className="p-2 min-w-10 min-h-10 flex items-center justify-center text-knight-400 hover:text-mist-100 rounded-xl hover:bg-void-800 transition-colors touch-fast active:scale-95 shrink-0"
              title="Close Chat"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-void-800 border border-knight-700 shrink-0 overflow-hidden flex items-center justify-center">
              <CardAvatar
                src={primaryCoverUrl}
                name={d.name}
                alt="Avatar"
                className="w-full h-full object-cover"
                fallbackClassName="text-xs"
                fallbackIconClassName="w-5 h-5"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm sm:text-base text-mist-100 truncate">
                {isGroupMode ? sceneCharacters.map((sc) => sc.name).join(' + ') : d.name || 'Character'}
              </h3>
              <p className="text-[10px] sm:text-xs text-knight-400 font-mono flex items-center gap-1.5 sm:gap-2 truncate">
                <span className="text-maroon-400 font-semibold">{totalChatTokens} tokens</span>
                <span>•</span>
                <span className="truncate">Profile: {activeProfile ? activeProfile.name : 'None'}</span>
                {isGroupMode && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300">Group Preview</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="relative shrink-0" ref={chatMenuRef}>
              <button
                type="button"
                onClick={() => setIsChatMenuOpen((open) => !open)}
                className="p-2 min-w-10 min-h-10 flex items-center justify-center text-knight-400 hover:text-mist-100 rounded-xl hover:bg-void-800 transition-colors touch-fast active:scale-95"
                aria-label="Chat menu"
                aria-haspopup="true"
                aria-expanded={isChatMenuOpen}
                aria-controls="chat-header-menu"
              >
                <EllipsisVertical className="w-5 h-5" />
              </button>

              {isChatMenuOpen && (
                <div
                  id="chat-header-menu"
                  className="absolute right-0 top-full mt-2 z-30 w-72 max-w-[calc(100vw-1.5rem)] max-h-[70dvh] overflow-y-auto rounded-xl border border-knight-700/60 bg-void-900 shadow-2xl p-2"
                >
                  <div className="min-h-11 flex items-center gap-2 rounded-lg px-2">
                    <label htmlFor="chat-user-name" className="text-xs font-medium text-knight-300 shrink-0">Your name</label>
                    <input
                      id="chat-user-name"
                      type="text"
                      value={userNameDraft}
                      onChange={(event) => setUserNameDraft(event.target.value)}
                      onBlur={commitUserNameDraft}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitUserNameDraft();
                        }
                      }}
                      placeholder="User"
                      aria-label="Your name in the chat"
                      data-testid="chat-user-name"
                      className="min-w-0 flex-1 bg-transparent border border-knight-700/80 rounded-lg px-2 py-2 text-xs text-mist-100 focus:outline-none focus:ring-2 focus:ring-maroon-400/60"
                    />
                  </div>

                  <div className="min-h-11 px-2 py-2 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="chat-model-profile" className="text-xs font-medium text-knight-300">Model profile</label>
                      {profiles.length > 0 ? (
                        <select
                          id="chat-model-profile"
                          aria-label="Model profile"
                          value={activeProfileUuid ?? ''}
                          onChange={(event) => {
                            if (event.target.value) {
                              void setActiveProfileUuid(event.target.value);
                            }
                          }}
                          className="min-w-0 max-w-40 rounded-lg border border-knight-700/80 bg-void-950 px-2 py-2 text-xs text-mist-100 focus:outline-none focus:ring-2 focus:ring-maroon-400/60"
                        >
                          {!activeProfile && <option value="" disabled>Select profile...</option>}
                          {profiles.map((profile) => (
                            <option key={profile.uuid} value={profile.uuid}>{profile.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-knight-400">No profile. Add one in Settings.</span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-knight-400">Same profile as Settings.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsLorebookDebugOpen((open) => !open)}
                    className={`relative flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs transition-colors ${
                      isLorebookDebugOpen || (lorebookDebug?.activatedEntries.length ?? 0) > 0
                        ? 'text-indigo-300 bg-indigo-950/40 hover:bg-indigo-950/60'
                        : 'text-knight-300 hover:text-mist-100 hover:bg-void-800'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Lorebook Debug
                    </span>
                    {(lorebookDebug?.activatedEntries.length ?? 0) > 0 && (
                      <span className="rounded-full border border-indigo-500/20 bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-mono text-indigo-300">
                        {lorebookDebug?.activatedEntries.length}
                      </span>
                    )}
                  </button>

                  <div className="rounded-lg">
                    <button
                      type="button"
                      onClick={() => setIsGroupPickerOpen((open) => !open)}
                      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs transition-colors ${
                        isGroupMode
                          ? 'bg-amber-950/40 text-amber-300 hover:bg-amber-950/60'
                          : 'text-knight-300 hover:bg-void-800 hover:text-mist-100'
                      }`}
                      aria-expanded={isGroupPickerOpen}
                    >
                      <span className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Group Preview
                      </span>
                      {groupMemberUuids.length > 0 && (
                        <span className="rounded-full bg-maroon-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {groupMemberUuids.length}
                        </span>
                      )}
                    </button>

                    {isGroupPickerOpen && (
                      <div className="mt-1 border-l border-knight-700/60 pl-2">
                        <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-knight-500 font-mono">
                          Add characters to scene
                        </p>
                        {cards.filter((c) => c.uuid !== activeCardUuid).length === 0 ? (
                          <p className="px-2 py-2 text-[11px] text-knight-500">
                            No other cards in your gallery yet.
                          </p>
                        ) : (
                          cards
                            .filter((c) => c.uuid !== activeCardUuid)
                            .map((c) => {
                              const checked = groupMemberUuids.includes(c.uuid);
                              return (
                                <button
                                  key={c.uuid}
                                  type="button"
                                  onClick={() => toggleGroupMember(c.uuid)}
                                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                                    checked ? 'bg-maroon-500/15 text-maroon-200' : 'text-mist-100 hover:bg-void-800'
                                  }`}
                                >
                                  <span
                                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                      checked ? 'bg-maroon-500 border-maroon-400' : 'border-knight-600'
                                    }`}
                                  >
                                    {checked && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}
                                  </span>
                                  <span className="truncate">{c.name}</span>
                                </button>
                              );
                            })
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleResetChat();
                      setIsChatMenuOpen(false);
                    }}
                    className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-knight-300 transition-colors hover:bg-void-800 hover:text-amber-300"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset chat
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setChatPreviewOpen(false)}
              className="hidden sm:flex p-2 text-knight-400 hover:text-mist-100 rounded-xl hover:bg-void-800 transition-colors touch-fast active:scale-95"
              title="Close Chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Lorebook Debug Panel */}
        {isLorebookDebugOpen && (
          <div className="bg-void-950 border-b border-knight-700/40 p-4 shrink-0 overflow-y-auto max-h-64 shadow-inner text-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-mist-100 font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                Lorebook Activation Status
              </h4>
              <div className="text-xs text-knight-400">
                <span className="font-mono text-indigo-300">
                  {lorebookDebug?.totalTokensConsumed || 0}
                </span>{' '}
                / {lorebookDebug?.tokenBudget || 0} budget tokens used
              </div>
            </div>
            
            {(!lorebookDebug || lorebookDebug.activatedEntries.length === 0) ? (
              <div className="text-knight-400 text-xs italic bg-void-900 rounded-lg p-3 text-center border border-knight-800">
                No lorebook entries triggered for the current context.
              </div>
            ) : (
              <div className="space-y-2">
                {lorebookDebug.activatedEntries.map((res, i) => (
                  <div key={i} className="bg-void-900 border border-knight-700/60 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-start gap-4">
                      <div className="font-mono text-xs text-mist-200 break-all flex-1">
                        {res.entry.name ? (
                          <span className="font-bold text-mist-100 mr-2">{res.entry.name}:</span>
                        ) : null}
                        {res.entry.keys?.join(', ')}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {res.entry.constant && (
                          <span className="text-[9px] uppercase font-bold tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            Constant
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-indigo-300 bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-500/20">
                          {res.tokens}t
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-knight-300 line-clamp-2 italic opacity-80 pl-2 border-l border-knight-700">
                      {res.entry.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Greeting Switcher Bar (Swipe / Prev Next) */}
        {allGreetings.length > 1 && (
          <div className="px-4 py-2 bg-void-950 border-b border-knight-700/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-knight-400 text-[10px] uppercase font-mono tracking-wider">
                Greeting Variation:
              </span>
              <span className="text-xs font-semibold text-maroon-300">
                #{activeGreetingIdx + 1} of {allGreetings.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setActiveGreetingIdx((prev) => (prev > 0 ? prev - 1 : allGreetings.length - 1))
                }
                className="p-1 rounded-lg bg-void-800 hover:bg-knight-700 text-knight-300 touch-fast active:scale-90"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  setActiveGreetingIdx((prev) => (prev < allGreetings.length - 1 ? prev + 1 : 0))
                }
                className="p-1 rounded-lg bg-void-800 hover:bg-knight-700 text-knight-300 touch-fast active:scale-90"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 max-w-4xl w-full mx-auto">
          {messages.map((m, idx) => {
            const isLastMessage = idx === messages.length - 1;
            const isUser = m.role === 'user';
            const speaker = !isUser && isGroupMode
              ? sceneCharacters.find((sc) => sc.uuid === m.speakerUuid)
              : undefined;
            const displayName = isUser ? userName : speaker ? speaker.name : d.name;
            const displayAvatar = isUser ? undefined : speaker ? speaker.avatar : primaryCoverUrl;

            return (
              <div
                key={idx}
                className={`flex gap-2.5 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar Icon */}
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-void-800 border border-knight-700 shrink-0 overflow-hidden flex items-center justify-center mt-1 shadow-sm">
                  {isUser ? (
                    <User className="w-4 h-4 text-knight-300" />
                  ) : (
                    <CardAvatar
                      src={displayAvatar}
                      name={displayName}
                      alt="Char Avatar"
                      className="w-full h-full object-cover"
                      fallbackClassName="text-[10px]"
                      fallbackIconClassName="w-4 h-4"
                    />
                  )}
                </div>

                <div className={`space-y-1 max-w-[85%] sm:max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-semibold text-knight-400 font-mono">
                      {displayName}
                    </span>
                  </div>

                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap select-text shadow-md ${
                      isUser
                        ? 'bg-maroon-500 text-white rounded-tr-none'
                        : 'bg-void-800/90 border border-knight-700/80 text-mist-100 rounded-tl-none font-sans'
                    }`}
                  >
                    {isEditingLastMessage && isLastMessage ? (
                      <div className="w-full">
                        <textarea
                          ref={editMessageTextareaRef}
                          rows={1}
                          value={editMessageDraft}
                          onChange={(e) => {
                            const textarea = e.currentTarget;
                            setEditMessageDraft(textarea.value);
                            textarea.style.height = 'auto';
                            textarea.style.height = String(textarea.scrollHeight) + 'px';
                          }}
                          aria-label="Edit message"
                          className="w-full resize-none bg-transparent text-xs sm:text-sm leading-relaxed text-current focus:outline-none"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMessages((prev) => replaceLastText(prev, editMessageDraft));
                              setIsEditingLastMessage(false);
                            }}
                            disabled={!editMessageDraft.trim()}
                            className="min-h-10 rounded-lg border border-knight-700/60 px-3 text-xs font-semibold hover:bg-black/10 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingLastMessage(false)}
                            className="min-h-10 rounded-lg border border-knight-700/60 px-3 text-xs font-semibold hover:bg-black/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : renderRoleplayText(m.text)}
                  </div>
                  {isLastMessage && hasUserMessage(messages) && !isGenerating && !isEditingLastMessage && (
                    <div className="mt-1 flex items-center gap-2 px-1">
                      {canRegenerate(messages) && (
                        <button
                          type="button"
                          onClick={() => void handleRegenerate()}
                          aria-label="Regenerate reply"
                          className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-knight-700/60 text-knight-300 transition-colors hover:bg-void-800 hover:text-mist-100"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditMessageDraft(m.text);
                          setIsEditingLastMessage(true);
                        }}
                        aria-label="Edit message"
                        className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-knight-700/60 text-knight-300 transition-colors hover:bg-void-800 hover:text-mist-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMessages((prev) => dropLast(prev));
                          setIsEditingLastMessage(false);
                        }}
                        aria-label="Delete message"
                        className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-knight-700/60 text-knight-300 transition-colors hover:bg-void-800 hover:text-mist-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isGenerating && (
            <div className="flex items-center gap-2 px-2 text-xs text-maroon-400 animate-pulse font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{(typingSpeaker || d.name || 'Character')} is typing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-knight-700/40 bg-void-950/90 backdrop-blur-md shrink-0 pb-[max(0.75rem,calc(0.75rem+env(safe-area-inset-bottom,0px)))] sm:pb-4">
          <div className="max-w-4xl mx-auto flex items-end gap-2">
            <textarea
              ref={messageInputRef}
              rows={1}
              value={inputMsg}
              onChange={(e) => {
                const textarea = e.currentTarget;
                setInputMsg(textarea.value);
                textarea.style.height = 'auto';
                textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (shouldSendOnEnter(e, isTouchDevice)) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder={`Reply to ${d.name || 'character'}...`}
              aria-label="Message"
              className="flex-1 min-w-0 px-4 py-3 bg-void-900 border border-knight-700/40 rounded-xl text-mist-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-maroon-400/60 ring-offset-2 ring-offset-void-950/50 resize-none overflow-y-auto max-h-40"
            />
            <button
              onClick={handleSendMessage}
              disabled={isGenerating || !inputMsg.trim()}
              className="p-3 min-w-10 min-h-10 flex items-center justify-center bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 active:scale-95 text-white rounded-xl shadow-md disabled:opacity-50 transition-all touch-fast shrink-0"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

