import React, { useEffect, Suspense, lazy } from 'react';
import { useCardStore } from './store/useCardStore';
import { useTokenTracker } from './store/useTokenTracker';
import { Navigation } from './components/Navigation';
import { DecryptionModal } from './components/DecryptionModal';
import { PassphraseSetupModal } from './components/PassphraseSetupModal';
import { GuideView } from './components/GuideView';
import { ChatPreviewModal } from './components/ChatPreviewModal';
import { AlertDialogModal } from './components/AlertDialogModal';
import { ContextBar } from './components/ContextBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PreFlightAuditModal } from './components/PreFlightAuditModal';
import { ToastContainer } from './components/ToastContainer';
import { WORKSPACE_TABS, LAB_TABS } from './constants/navigation';
import { usePWAUpdate } from './hooks/usePWAUpdate';
import { useHashRouting } from './routing/useHashRouting';
import { useModalA11y } from './hooks/useModalA11y';
import { seedStarterPersonas } from './utils/seedStarterPersonas';

const GalleryView = lazy(() => import('./components/GalleryView').then(module => ({ default: module.GalleryView })));
const EditorView = lazy(() => import('./components/EditorView').then(module => ({ default: module.EditorView })));
const LorebookView = lazy(() => import('./components/LorebookView').then(module => ({ default: module.LorebookView })));
const CrucibleView = lazy(() => import('./components/CrucibleView').then(module => ({ default: module.CrucibleView })));
const EnhancerView = lazy(() => import('./components/EnhancerView').then(module => ({ default: module.EnhancerView })));
const AssistantView = lazy(() => import('./components/AssistantView').then(module => ({ default: module.AssistantView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(module => ({ default: module.SettingsView })));
const PayloadView = lazy(() => import('./components/PayloadView').then(module => ({ default: module.PayloadView })));

export default function App() {
  usePWAUpdate();
  useHashRouting();

  const {
    activeTab,
    loadCardsFromDb,
    loadProfilesFromDb,
    checkPassphraseSetup,
    loadThemeFromDb,
    loadAssistantChatsFromDb,
    theme,
    isOnboardingOpen,
    setIsOnboardingOpen,
    isPreFlightAuditOpen,
    setPreFlightAuditOpen,
  } = useCardStore();

  useEffect(() => {
    loadThemeFromDb();
    // Seed the starter personas into a fresh database first, so the
    // Library never opens on an empty screen; failures are logged only.
    seedStarterPersonas()
      .catch((err) => console.error('Failed to seed starter personas:', err))
      .finally(() => loadCardsFromDb());
    loadProfilesFromDb();
    checkPassphraseSetup();
    loadAssistantChatsFromDb();
    useTokenTracker.getState().loadStats();
  }, [loadThemeFromDb, loadCardsFromDb, loadProfilesFromDb, checkPassphraseSetup, loadAssistantChatsFromDb]);

  // Each screen starts at the top instead of inheriting the previous scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // Guide overlay: Back button / Escape close it, and focus is trapped while open.
  const guideRef = useModalA11y(isOnboardingOpen, () => setIsOnboardingOpen(false));

  const isWorkspaceTab = WORKSPACE_TABS.includes(activeTab);
  const isLabTab = LAB_TABS.includes(activeTab);

  return (
    <div className="min-h-screen flex flex-col md:flex-row antialiased font-sans selection:bg-maroon-500/30 selection:text-maroon-200 bg-void-950 text-mist-100">
      <Navigation />

      <main className="flex-1 overflow-y-auto min-h-screen pb-28 md:pb-0">
        {(isWorkspaceTab || isLabTab) && <ContextBar />}
        <ErrorBoundary resetKey={activeTab}>
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center p-8 min-h-screen">
              <div className="text-knight-400 font-mono text-xs flex flex-col items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-knight-400 border-t-transparent animate-spin" />
                Loading...
              </div>
            </div>
          }>
            {activeTab === 'gallery' && <GalleryView />}
            {activeTab === 'editor' && <EditorView />}
            {activeTab === 'lorebook' && <LorebookView />}
            {activeTab === 'payload' && <PayloadView />}
            {activeTab === 'crucible' && <CrucibleView />}
            {activeTab === 'enhancer' && <EnhancerView />}
            {activeTab === 'assistant' && <AssistantView />}
            {activeTab === 'settings' && <SettingsView />}
          </Suspense>
        </ErrorBoundary>
      </main>

      {isOnboardingOpen && (
        <div
          ref={guideRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Roleplay Forge Guide and Onboarding"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md overflow-y-auto p-3 sm:p-6 md:p-10 flex justify-center items-start"
        >
          <div className="relative w-full max-w-5xl my-auto">
            <GuideView onClose={() => setIsOnboardingOpen(false)} />
          </div>
        </div>
      )}

      <ChatPreviewModal />
      <PreFlightAuditModal isOpen={isPreFlightAuditOpen} onClose={() => setPreFlightAuditOpen(false)} />
      <DecryptionModal />
      <PassphraseSetupModal />
      <AlertDialogModal />
      <ToastContainer />
    </div>
  );
}
