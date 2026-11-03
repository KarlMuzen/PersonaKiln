import React, { useEffect, useRef, useState } from 'react';
import { useCardStore, type TabType } from '../store/useCardStore';
import {
  Edit3,
  BookOpen,
  FlaskConical,
  Bot,
  ShieldAlert,
  Sparkles,
  MessageSquare,
  AlertTriangle,
  Undo,
  Redo,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { validateCardCompleteness } from '../utils/validation';
import { WORKSPACE_TABS, LAB_TABS } from '../constants/navigation';
import { CardAvatar } from './CardAvatar';
import { getCardCoverUrl } from './gallery/galleryUtils';
import type { StoredCard } from '../db';
import { ContextMoreMenu } from './ContextMoreMenu';

const WORKSPACE_SUB_TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'editor', label: 'Details', icon: <Edit3 className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'lorebook', label: 'Lorebook', icon: <BookOpen className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'payload', label: 'Prompt', icon: <FlaskConical className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'assistant', label: 'Assist', icon: <Bot className="w-3.5 h-3.5 shrink-0" /> },
];

const LAB_SUB_TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'crucible', label: 'Stress tests', icon: <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'enhancer', label: 'Enhancer', icon: <Sparkles className="w-3.5 h-3.5 shrink-0" /> },
];

export const ContextBar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeCard,
    activeCardEmbeddedAssets,
    setChatPreviewOpen,
    setPreFlightAuditOpen,
    setIsOnboardingOpen,
    undo,
    redo,
    undoStack,
    redoStack,
    saveState,
  } = useCardStore();
  const [showWarnings, setShowWarnings] = useState(false);
  const checklistRef = useRef<HTMLDivElement | null>(null);
  const checklistTriggerRef = useRef<HTMLButtonElement | null>(null);

  const isWorkspaceTab = WORKSPACE_TABS.includes(activeTab);
  const isLabTab = LAB_TABS.includes(activeTab);
  const mode = isWorkspaceTab ? 'Forge' : 'Test';
  const tabs = isWorkspaceTab ? WORKSPACE_SUB_TABS : isLabTab ? LAB_SUB_TABS : [];
  const coverUrl = activeCard
    ? getCardCoverUrl({ cardData: activeCard, embeddedAssets: activeCardEmbeddedAssets } as StoredCard)
    : null;
  const cardWarnings = validateCardCompleteness(activeCard);
  const isInvalid = cardWarnings.length > 0;

  useEffect(() => {
    if (!showWarnings) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowWarnings(false);
        checklistTriggerRef.current?.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!checklistRef.current?.contains(event.target as Node)) {
        setShowWarnings(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [showWarnings]);

  return (
    <div className="sticky top-0 z-20 bg-void-950/95 backdrop-blur-md border-b border-knight-700/40 px-3 sm:px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
      <div className="max-w-7xl mx-auto flex flex-col gap-1.5">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-void-800 border border-knight-700/60 overflow-hidden flex items-center justify-center shrink-0">
              {activeCard ? (
                <CardAvatar
                  src={coverUrl}
                  name={activeCard.data.name}
                  alt=""
                  className="w-full h-full object-cover"
                  fallbackClassName="text-[9px]"
                  fallbackIconClassName="w-3.5 h-3.5"
                />
              ) : (
                <span className="text-[9px] font-bold text-maroon-400">RF</span>
              )}
            </div>
            <div className="min-w-0 overflow-hidden flex items-center gap-1.5">
              <span className="hidden sm:inline text-[10px] uppercase font-mono font-bold text-maroon-400/90 tracking-wider shrink-0">
                {mode}
              </span>
              <span className="hidden sm:inline text-knight-600 text-xs shrink-0" aria-hidden="true">•</span>
              <p className="text-xs font-semibold text-mist-100 truncate">
                {activeCard ? activeCard.data.name || 'Untitled' : 'No character selected'}
              </p>
            </div>
            {activeCard && isInvalid && (
              <div ref={checklistRef} className="relative shrink-0">
                <button
                  ref={checklistTriggerRef}
                  type="button"
                  aria-label={`Incomplete card: ${cardWarnings.length} issues. Show checklist`}
                  aria-expanded={showWarnings}
                  aria-controls="card-completeness-checklist"
                  onClick={() => setShowWarnings((open) => !open)}
                  className="flex min-w-11 min-h-11 items-center justify-center rounded-lg text-amber-400 hover:bg-void-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 touch-fast"
                >
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                </button>
                {showWarnings && (
                  <section
                    id="card-completeness-checklist"
                    aria-labelledby="card-completeness-title"
                    className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-knight-700 bg-void-950 p-3 shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 id="card-completeness-title" className="text-xs font-semibold text-mist-100">
                        Incomplete card · {cardWarnings.length} {cardWarnings.length === 1 ? 'issue' : 'issues'}
                      </h3>
                      <button
                        type="button"
                        aria-label="Close card completeness checklist"
                        onClick={() => setShowWarnings(false)}
                        className="flex min-w-11 min-h-11 shrink-0 items-center justify-center rounded-lg text-knight-300 hover:bg-void-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    <ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-relaxed text-knight-200">
                      {cardWarnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isWorkspaceTab && activeCard && (
              <>
                <button
                  type="button"
                  onClick={() => undo()}
                  disabled={undoStack.length === 0}
                  aria-label="Undo"
                  title="Undo"
                  className="flex min-w-11 min-h-11 items-center justify-center rounded-lg border border-knight-700/50 bg-void-900/60 text-knight-400 transition-colors hover:bg-void-800 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-40 touch-fast"
                >
                  <Undo className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => redo()}
                  disabled={redoStack.length === 0}
                  aria-label="Redo"
                  title="Redo"
                  className="flex min-w-11 min-h-11 items-center justify-center rounded-lg border border-knight-700/50 bg-void-900/60 text-knight-400 transition-colors hover:bg-void-800 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-40 touch-fast"
                >
                  <Redo className="w-4 h-4" aria-hidden="true" />
                </button>
                <span
                  aria-live="polite"
                  className="sr-only sm:not-sr-only whitespace-nowrap px-1 text-[10px] font-medium text-knight-300"
                >
                  {saveState === 'saving'
                    ? 'Saving…'
                    : saveState === 'saved' || saveState === 'idle'
                      ? 'Saved'
                      : saveState === 'error'
                        ? 'Save failed'
                        : 'Saved'}
                </span>
                <span
                  aria-hidden="true"
                  className={`sm:hidden h-2 w-2 shrink-0 rounded-full ${
                    saveState === 'saving'
                      ? 'bg-cyan-400'
                      : saveState === 'saved' || saveState === 'idle'
                        ? 'bg-emerald-400'
                        : saveState === 'error'
                          ? 'bg-red-400'
                          : 'bg-emerald-400'
                  }`}
                />
              </>
            )}
            {isWorkspaceTab && activeCard && (
              <button
                type="button"
                onClick={() => setPreFlightAuditOpen(true)}
                className="hidden sm:flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-maroon-800/60 bg-void-950/90 px-2.5 py-1 text-[11px] font-semibold text-maroon-300 shadow-sm transition-all hover:bg-void-950 hover:text-mist-100 touch-fast active:scale-95"
                title="Run Zero-Cost Pre-Flight Writing Audit"
              >
                <Zap className="w-3 h-3 text-maroon-400" />
                <span className="hidden sm:inline">Pre-Flight Audit</span>
                <span className="rounded border border-emerald-800 bg-emerald-950 px-1 py-0.2 font-mono text-[9px] text-emerald-400">Free</span>
              </button>
            )}
            {activeCard && (
              <button
                type="button"
                onClick={() => setChatPreviewOpen(true)}
                className="sm:hidden flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-maroon-800/60 bg-maroon-950/80 px-2.5 py-1 text-[11px] font-semibold text-maroon-300 transition-all hover:bg-maroon-900 touch-fast active:scale-95"
                title="Test Chat"
              >
                <MessageSquare className="w-3 h-3 text-maroon-400" />
                <span>Chat</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOnboardingOpen(true)}
              aria-label="Help and documentation"
              title="Help and documentation"
              className="hidden sm:flex min-w-11 min-h-11 items-center justify-center rounded-lg text-knight-400 transition-colors hover:bg-void-800 hover:text-mist-100 touch-fast"
            >
              <HelpCircle className="w-4 h-4" aria-hidden="true" />
            </button>
            <ContextMoreMenu
              showPreFlight={isWorkspaceTab && Boolean(activeCard)}
              onPreFlightAudit={() => setPreFlightAuditOpen(true)}
              onHelp={() => setIsOnboardingOpen(true)}
            />
          </div>
        </div>

        <nav
          aria-label={`${mode} sections`}
          className="flex w-full max-w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-xl border border-knight-700/30 bg-void-900/80 p-1 sm:w-auto"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const showDetailWarning = isWorkspaceTab && tab.id === 'editor' && isInvalid;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[11px] font-semibold transition-colors sm:text-xs touch-fast ${
                  isActive
                    ? 'border-maroon-500/50 bg-gradient-to-r from-maroon-600/30 to-maroon-500/20 text-mist-100 shadow-sm'
                    : 'border-transparent text-knight-400 hover:text-mist-200'
                }`}
              >
                <span className={showDetailWarning ? 'text-amber-400' : isActive ? 'text-maroon-400' : 'text-knight-500'}>
                  {showDetailWarning ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
