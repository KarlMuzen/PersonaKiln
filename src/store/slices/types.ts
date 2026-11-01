import type { StoredCard, StoredLorebook, ConnectionProfile, CrucibleVector, CrucibleScenario } from '../../db';
import type { CharacterCardV3 } from '../../schemas/cardSchema';
import type { LLMMessage } from '../../services/llmAdapter';

export type TabType = 'gallery' | 'editor' | 'lorebook' | 'crucible' | 'enhancer' | 'assistant' | 'settings' | 'payload';

export interface UndoState {
  cardData: CharacterCardV3;
}

export interface UISlice {
  // Navigation & UI
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => Promise<void>;
  loadThemeFromDb: () => Promise<void>;

  // Gallery Filter/Selection State
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  selectedCardUuids: string[];
  toggleSelectCardUuid: (uuid: string) => void;
  clearCardSelections: () => void;
  selectAllCards: () => void;

  // Chat Preview & Modals
  isChatPreviewOpen: boolean;
  setChatPreviewOpen: (open: boolean) => void;
  chatPreviewGreetingIndex: number;
  setChatPreviewGreetingIndex: (idx: number) => void;
  isOnboardingOpen: boolean;
  setIsOnboardingOpen: (open: boolean) => void;
  isPreFlightAuditOpen: boolean;
  setPreFlightAuditOpen: (open: boolean) => void;
}

export interface CardSlice {
  // Gallery & Storage State
  cards: StoredCard[];
  isLoadingCards: boolean;
  lorebooks: StoredLorebook[];

  // Active Selected Card for Editing / View
  activeCardUuid: string | null;
  activeCard: CharacterCardV3 | null;
  activeCardRecord: StoredCard | null;
  activeCardEmbeddedAssets: Record<string, Uint8Array>;
  isAssetsDirty: boolean;

  // Undo / Redo Stack for Active Editor
  undoStack: UndoState[];
  redoStack: UndoState[];

  // Autosave
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveTimeoutId: ReturnType<typeof setTimeout> | null;
  triggerAutosave: () => void;

  // Database Actions
  loadCardsFromDb: () => Promise<void>;
  loadLorebooksFromDb: () => Promise<void>;
  selectCardForEditing: (uuid: string) => Promise<void>;
  createNewCard: (name?: string) => Promise<string>;
  createVariant: (sourceUuid: string, label?: string) => Promise<string>;
  saveActiveCard: () => Promise<void>;
  saveActiveCardMetadata: () => Promise<void>;
  updateActiveCardData: (
    updater: (prev: CharacterCardV3) => CharacterCardV3,
    options?: { forceUndo?: boolean }
  ) => void;
  updateActiveCardTestSuites: (testSuites: CrucibleVector[]) => Promise<void>;
  updateActiveCardScenarios: (scenarios: CrucibleScenario[]) => Promise<void>;
  undo: () => void;
  redo: () => void;
  deleteCard: (uuid: string) => Promise<void>;
  bulkDeleteCards: () => Promise<void>;
  createSnapshot: (name: string) => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  deleteSnapshot: (snapshotId: string) => Promise<void>;
  reorderCards: (reorderedCards: StoredCard[]) => Promise<void>;
  importCardRecord: (
    card: CharacterCardV3,
    embeddedAssets?: Record<string, Uint8Array>,
    overwriteUuid?: string
  ) => Promise<string>;
  runDbCardWrite: <T>(write: () => Promise<T>) => Promise<T>;
  setCardCoverImage: (imageBytes: Uint8Array, mimeType?: string) => Promise<void>;
  removeCardCoverImage: () => Promise<void>;
}

export interface ProfileSlice {
  // Connection Profiles (BYOK)
  profiles: ConnectionProfile[];
  activeProfileUuid: string | null;
  loadProfilesFromDb: () => Promise<void>;
  saveProfile: (profile: ConnectionProfile) => Promise<void>;
  deleteProfile: (uuid: string) => Promise<void>;
  setActiveProfileUuid: (uuid: string | null) => Promise<void> | void;
}

export type PassphraseSetupChoice =
  | { kind: 'passphrase'; passphrase: string }
  | { kind: 'passkey-only' }
  | null;

export interface SessionSlice {
  // Crypto & Session State
  isPassphraseSet: boolean;
  isPasskeyOnly: boolean;
  hasRecoveryKey: boolean;
  pendingRecoveryCode: string | null;
  isUnlocked: boolean;
  cryptoKey: CryptoKey | null;
  isPasskeySupported: boolean;
  isPasskeyEnrolled: boolean;
  decryptionRequest: { resolve: (pass: string | null) => void } | null;
  decryptionError: string | null;
  passphraseSetupRequest: { resolve: (choice: PassphraseSetupChoice) => void } | null;
  passphraseSetupError: string | null;
  checkPassphraseSetup: () => Promise<void>;
  setupPassphrase: (passphrase: string) => Promise<void>;
  setupPasskeyProtection: () => Promise<string | null>;
  setupRecoveryKey: () => Promise<string | null>;
  confirmRecoveryKeySaved: () => Promise<void>;
  unlockSession: (passphrase: string) => Promise<boolean>;
  unlockWithRecoveryCode: (recoveryCode: string) => Promise<boolean>;
  requestSessionUnlock: () => Promise<boolean>;
  enrollPasskeyUnlock: () => Promise<boolean>;
  unlockWithPasskeyAction: () => Promise<boolean>;
  removePasskeyUnlock: () => Promise<void>;
  lockSession: () => void;
  clearPassphrase: () => Promise<void>;
  getDecryptedApiKey: (profile: ConnectionProfile, allowPrompt?: boolean) => Promise<string | undefined>;
}

export interface AssistantSlice {
  // Persistent Assistant Chat State (keyed by cardUuid or 'global')
  assistantChats: Record<string, LLMMessage[]>;
  loadAssistantChatsFromDb: () => Promise<void>;
  saveAssistantMessages: (cardUuid: string | null, messages: LLMMessage[]) => Promise<void>;
  clearAssistantChat: (cardUuid: string | null) => Promise<void>;
}

export type CardStore = UISlice & CardSlice & ProfileSlice & SessionSlice & AssistantSlice;
