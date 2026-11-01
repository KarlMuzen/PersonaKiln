import type { ConnectionProfile } from '../db';
import type { CharacterCardV3 } from '../schemas/cardSchema';
import { resolveMacros } from '../utils/macroParser';
import { scanLorebook, type LorebookScanDebugInfo } from '../utils/lorebookScan';
import { sendLLMRequest, type LLMMessage } from './llmAdapter';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  speakerUuid?: string;
  speakerName?: string;
}

export interface SceneCharacter {
  uuid: string;
  name: string;
  avatar?: string;
  data: CharacterCardV3['data'];
}

export type UserTurnSource =
  | string
  | ((historySoFar: ChatMessage[]) => Promise<string> | string);

export interface TurnInputOptions {
  profile: ConnectionProfile;
  sceneCharacters: SceneCharacter[];
  history: ChatMessage[];
  /**
   * Next turn input: either a string directly or an injectable function (historySoFar) => Promise<string>
   */
  userTurnInput: UserTurnSource;
  userName?: string;
  temperature?: number;
  maxTokens?: number;
  onSpeakerTyping?: (speakerName: string | null) => void;
  onStepMessage?: (newMessage: ChatMessage, updatedHistory: ChatMessage[]) => void;
}

/**
 * Builds system prompt for a scene character given current history and scene context.
 */
/**
 * Build the example-dialogue block for a card's mes_example. Splits on
 * <START> (case-insensitive), trims each piece and drops empty ones.
 * The literal <START> never appears in the result, and macros are not
 * resolved here: the whole system prompt goes through resolveMacros
 * later, so {{char}} and {{user}} resolve there.
 */
export function buildExampleDialogueBlock(mesExample?: string): string {
  if (!mesExample) return '';
  const pieces = mesExample
    .split(/<START>/i)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
  if (pieces.length === 0) return '';
  return (
    'Example dialogue (shows how the character speaks; these events are not part of this chat):\n' +
    pieces.map((piece) => `[Example]\n${piece}`).join('\n\n')
  );
}

export function buildSystemPrompt(
  sc: SceneCharacter,
  chatHistory: ChatMessage[],
  sceneCharacters: SceneCharacter[],
  userName: string = 'User'
): { systemPrompt: string; depthInjections: { depth: number; content: string }[]; lorebookDebug?: LorebookScanDebugInfo } {
  const cd = sc.data;
  const isGroupMode = sceneCharacters.length > 1;
  const otherNames = sceneCharacters.filter((o) => o.uuid !== sc.uuid).map((o) => o.name);

  let lorebookSystemText = '';
  const depthInjections: { depth: number; content: string }[] = [];
  let lorebookDebug: LorebookScanDebugInfo | undefined = undefined;

  if (cd.character_book) {
    lorebookDebug = scanLorebook(cd.character_book, chatHistory, userName, cd.name || 'Character');
    const activeResults = lorebookDebug.activatedEntries;
    if (activeResults.length > 0) {
      const systemEntries: string[] = [];
      for (const r of activeResults) {
        if (r.depth < 0) {
          systemEntries.push(r.cleanContent);
        } else {
          depthInjections.push({ depth: r.depth, content: r.cleanContent });
        }
      }
      if (systemEntries.length > 0) {
        lorebookSystemText = systemEntries.join('\n\n');
      }
    }
  }

  let relationshipText = '';
  if (isGroupMode && cd.extensions?.character_relationships && Array.isArray(cd.extensions.character_relationships)) {
    const activeRels = cd.extensions.character_relationships.filter(
      (rel: Record<string, unknown>) =>
        typeof rel.targetName === 'string' && otherNames.includes(rel.targetName)
    );
    if (activeRels.length > 0) {
      relationshipText =
        `[Relationships]\n` +
        activeRels
          .map(
            (rel: Record<string, unknown>) =>
              `${String(rel.targetName)} is your ${String(rel.relationType || 'companion')}.`
          )
          .join('\n');
    }
  }

  const systemPrompt = resolveMacros(
    [
      cd.system_prompt || '',
      cd.description ? `Description: ${cd.description}` : '',
      cd.personality ? `Personality: ${cd.personality}` : '',
      cd.scenario ? `Scenario: ${cd.scenario}` : '',
      lorebookSystemText ? `[Lorebook Information]\n${lorebookSystemText}` : '',
      buildExampleDialogueBlock(cd.mes_example),
      relationshipText,
      isGroupMode && otherNames.length > 0
        ? `You are ${cd.name}, one of several characters together in a shared group scene, alongside: ${otherNames.join(
            ', '
          )}. Stay strictly in character as ${cd.name} only — never speak or act for the other characters. React naturally to what they and the user say.`
        : '',
      cd.post_history_instructions || '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    { charName: cd.name, userName }
  );

  return { systemPrompt, depthInjections };
}

/**
 * Creates initial greeting messages for a scene.
 */
export function buildInitialGreetingMessages(
  sceneCharacters: SceneCharacter[],
  userName: string = 'User',
  activeGreetingIdx: number = 0
): ChatMessage[] {
  if (sceneCharacters.length === 0) return [];

  if (sceneCharacters.length > 1) {
    return sceneCharacters.map((sc) => {
      const groupGreetings = sc.data.group_only_greetings;
      const greetText =
        groupGreetings && groupGreetings.length > 0
          ? groupGreetings[0]
          : sc.data.first_mes || `${sc.name} joins the scene.`;
      return {
        role: 'assistant',
        text: resolveMacros(greetText, { charName: sc.name, userName }),
        speakerUuid: sc.uuid,
        speakerName: sc.name,
      };
    });
  }

  const primary = sceneCharacters[0];
  const allGreetings = [
    primary.data.first_mes || 'Hello!',
    ...(primary.data.alternate_greetings || []),
  ];
  const initialGreet = allGreetings[activeGreetingIdx] || allGreetings[0];
  const resolvedGreet = resolveMacros(initialGreet, {
    charName: primary.data.name,
    userName,
  });
  return [{
    role: 'assistant',
    text: resolvedGreet,
    speakerUuid: primary.uuid,
    speakerName: primary.name,
  }];
}

/**
 * Runs a turn in the conversation.
 * Resolves user message from `userTurnInput` (string or function), appends to history,
 * then generates assistant responses for each scene character sequentially.
 */
export async function executeConversationTurn(
  options: TurnInputOptions
): Promise<ChatMessage[]> {
  const {
    profile,
    sceneCharacters,
    history: initialHistory,
    userTurnInput,
    userName = 'User',
    temperature: temperatureOpt,
    maxTokens: maxTokensOpt,
    onSpeakerTyping,
    onStepMessage,
  } = options;

  // The option wins when the caller passed one; otherwise the profile's
  // value when usable (a finite number, and for max tokens also > 0 and
  // rounded); otherwise the fallback. Settings shows 2048 for a profile
  // without a value, so the code agrees with the screen.
  const temperature =
    temperatureOpt !== undefined
      ? temperatureOpt
      : typeof profile.temperature === 'number' && Number.isFinite(profile.temperature)
      ? profile.temperature
      : 0.7;
  const maxTokens =
    maxTokensOpt !== undefined
      ? maxTokensOpt
      : typeof profile.maxTokens === 'number' &&
        Number.isFinite(profile.maxTokens) &&
        profile.maxTokens > 0
      ? Math.round(profile.maxTokens)
      : 2048;

  let currentHistory = [...initialHistory];

  // 1. Obtain user message text
  let userText = '';
  if (typeof userTurnInput === 'function') {
    userText = await userTurnInput(currentHistory);
  } else {
    userText = userTurnInput;
  }

  if (userText && userText.trim()) {
    const userMsg: ChatMessage = { role: 'user', text: userText };
    currentHistory = [...currentHistory, userMsg];
    onStepMessage?.(userMsg, currentHistory);
  }

  const isGroupMode = sceneCharacters.length > 1;

  // 2. Generate assistant response for each character in scene
  for (const sc of sceneCharacters) {
    onSpeakerTyping?.(sc.name);

    const { systemPrompt, depthInjections } = buildSystemPrompt(sc, currentHistory, sceneCharacters, userName);

    const llmMessages: LLMMessage[] = currentHistory.map((m) => {
      if (m.role === 'user') {
        return { role: 'user', content: isGroupMode ? `${userName}: ${m.text}` : m.text };
      }
      if (!isGroupMode || m.speakerUuid === sc.uuid) {
        return { role: 'assistant', content: m.text };
      }
      return { role: 'user', content: `${m.speakerName || 'Character'}: ${m.text}` };
    });

    for (const inj of depthInjections) {
      const targetIdx = Math.max(0, llmMessages.length - 1 - inj.depth);
      if (llmMessages[targetIdx]) {
        llmMessages[targetIdx].content += `\n\n[Lorebook Information]\n${inj.content}`;
      }
    }

    const response = await sendLLMRequest(profile, {
      systemPrompt,
      messages: llmMessages,
      temperature,
      maxTokens,
    });

    const newMsg: ChatMessage = {
      role: 'assistant',
      text: response.text,
      speakerUuid: sc.uuid,
      speakerName: sc.name,
    };
    currentHistory = [...currentHistory, newMsg];
    onStepMessage?.(newMsg, currentHistory);
  }

  onSpeakerTyping?.(null);
  return currentHistory;
}
