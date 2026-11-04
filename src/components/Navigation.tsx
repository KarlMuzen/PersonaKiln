import React, { useState } from 'react';
import { useCardStore, type TabType } from '../store/useCardStore';
import { useTokenTracker } from '../store/useTokenTracker';
import {
  isWorkspaceSection,
  isLabSection,
} from '../constants/navigation';
import {
  LayoutGrid,
  Layers,
  GraduationCap,
  Settings,
  Plus,
  Moon,
  Sun,
  MessageSquare,
  FlaskConical,
  DownloadCloud,
  Coins,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { CardAvatar } from './CardAvatar';
import { getCardCoverUrl } from './gallery/galleryUtils';
import type { StoredCard } from '../db';


export const Navigation: React.FC = () => {
  const { isInstallable, promptInstall } = usePWAInstall();
  const {
    activeTab,
    setActiveTab,
    theme,
    setTheme,
    createNewCard,
    activeCard,
    activeCardEmbeddedAssets,
    setChatPreviewOpen,
    setIsOnboardingOpen,
    profiles,
  } = useCardStore();
  const { getTotalEstimatedCost } = useTokenTracker();
  const totalEstimatedCost = getTotalEstimatedCost(profiles);
  const coverUrl = activeCard
    ? getCardCoverUrl({ cardData: activeCard, embeddedAssets: activeCardEmbeddedAssets } as StoredCard)
    : null;

  const [lastWorkspaceTab, setLastWorkspaceTab] = useState<TabType>('editor');
  const [lastLabTab, setLastLabTab] = useState<TabType>('crucible');
  const [prevTab, setPrevTab] = useState(activeTab);
  if (activeTab !== prevTab) {
    setPrevTab(activeTab);
    if (isWorkspaceSection(activeTab)) {
      setLastWorkspaceTab(activeTab);
    }
    if (isLabSection(activeTab)) {
      setLastLabTab(activeTab);
    }
  }

  const activeSection =
    activeTab === 'gallery'
      ? 'library'
      : activeTab === 'settings'
      ? 'settings'
      : isLabSection(activeTab)
      ? 'lab'
      : 'workspace';

  const primaryItems = [
    {
      id: 'library' as const,
      label: 'Library',
      icon: <LayoutGrid className="w-5 h-5" />,
      onClick: () => {
        setActiveTab('gallery');
      },
    },
    {
      id: 'workspace' as const,
      label: 'Forge',
      icon: <Layers className="w-5 h-5" />,
      onClick: () => setActiveTab(lastWorkspaceTab),
    },
    {
      id: 'lab' as const,
      label: 'Test',
      icon: <FlaskConical className="w-5 h-5" />,
      onClick: () => setActiveTab(lastLabTab),
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
      onClick: () => {
        setActiveTab('settings');
      },
    },
  ];

  const handleCreate = async () => {
    await createNewCard('New Character');
    setActiveTab('editor');
  };

  return (
    <>
      {/* Desktop Sidebar (md:flex) */}
      <aside className="hidden md:flex flex-col w-64 bg-void-950/90 backdrop-blur-md border-r border-knight-700/30 shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)] text-knight-300 select-none shrink-0 h-screen sticky top-0 z-30">
        {/* Header */}
        <div className="p-4 border-b border-knight-700/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-void-800 p-0.5 border border-knight-700/50 overflow-hidden shrink-0">
              <img src="/forge-mark.svg" alt="PersonaKiln mark" className="w-full h-full object-cover rounded-[10px]" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h1 className="font-display text-mist-100 tracking-tight text-sm flex items-center gap-1.5">
                PERSONAKILN
                
              </h1>
              <p className="text-[10px] text-knight-400 tracking-wide">The AI roleplay workbench</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isInstallable && (
              <button
                onClick={promptInstall}
                className="p-2 rounded-xl bg-maroon-950/80 hover:bg-maroon-900 border border-maroon-800/60 text-maroon-300 transition-colors touch-fast active:scale-95"
                title="Install PersonaKiln App"
              >
                <DownloadCloud className="w-4 h-4 text-maroon-400" />
              </button>
            )}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl hover:bg-void-800 text-knight-400 hover:text-knight-300 transition-colors touch-fast active:scale-95"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-maroon-400" />}
            </button>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="p-3.5">
          <button
            onClick={handleCreate}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 active:scale-[0.98] text-white font-semibold rounded-xl shadow-lg shadow-maroon-950/50 transition-all touch-fast"
          >
            <Plus className="w-4 h-4" />
            New Character
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {primaryItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className={`w-full relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all touch-fast active:scale-[0.98] ${
                  isActive
                    ? 'bg-void-800 text-maroon-300 border border-maroon-500/40 shadow-sm shadow-maroon-950'
                    : 'text-knight-400 hover:text-knight-300 hover:bg-void-800/40'
                }`}
              >
                <span className={isActive ? 'text-maroon-400' : 'text-knight-400'}>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'workspace' && activeCard && !isActive && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-maroon-400" />
                )}
              </button>
            );
          })}

          <div className="pt-3 space-y-2">
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-maroon-400 hover:text-maroon-300 hover:bg-maroon-950/40 border border-maroon-900/40 transition-all touch-fast active:scale-[0.98]"
            >
              <GraduationCap className="w-4 h-4 text-maroon-400" />
              <span>Guide & Samples</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-amber-300 hover:bg-amber-950/30 border border-amber-800/40 bg-void-900/60 transition-all touch-fast active:scale-[0.98]"
              title="View Settings & Running Cost Breakdown. Pricing estimates may not reflect current provider rates — verify at provider."
            >
              <span className="flex items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-knight-300">Est. Cost:</span>
              </span>
              <span className="font-mono font-bold text-amber-400">${totalEstimatedCost.toFixed(4)}</span>
            </button>
          </div>
        </nav>

        {/* Active Character Quick Status & Test Chat */}
        {activeCard && (
          <div className="p-3.5 border-t border-knight-700/40 bg-void-900/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-void-800 border border-knight-700 shrink-0 overflow-hidden flex items-center justify-center">
                  <CardAvatar
                    src={coverUrl}
                    name={activeCard.data.name}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    fallbackClassName="text-[10px]"
                    fallbackIconClassName="w-4 h-4"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-knight-500 font-mono uppercase tracking-wider">Active</p>
                  <p className="text-xs text-mist-100 font-semibold truncate">
                    {activeCard.data.name || 'Untitled'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setChatPreviewOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-maroon-600/20 hover:bg-maroon-600/30 text-maroon-300 border border-maroon-500/30 rounded-lg text-xs font-semibold transition-all touch-fast active:scale-95 shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5 text-maroon-400" />
                <span>Test Chat</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Header Topbar (md:hidden) - Only shown when NOT in workspace or lab view */}
      {activeSection !== 'workspace' && activeSection !== 'lab' && (
        <header className="md:hidden flex items-center justify-between px-4 py-2.5 bg-void-950/90 backdrop-blur-md border-b border-knight-700/20 text-mist-100 sticky top-0 z-30 pt-[max(0.625rem,env(safe-area-inset-top,0px))]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-void-800 flex items-center justify-center text-maroon-400 font-bold text-xs shadow-inner border border-knight-700/40 overflow-hidden shrink-0">
              <img src="/forge-mark.svg" alt="PersonaKiln mark" className="w-full h-full object-cover rounded-md" referrerPolicy="no-referrer" />
            </div>
            <span className="font-semibold text-sm text-mist-100 tracking-tight">PERSONAKILN</span>
          </div>

          <div className="flex items-center gap-2">
            {isInstallable && (
              <button
                onClick={promptInstall}
                className="min-h-10 px-2.5 py-1.5 bg-maroon-950/90 text-maroon-300 border border-maroon-800/80 rounded-lg touch-fast active:scale-95 text-xs font-medium flex items-center gap-1.5"
                title="Install App"
              >
                <DownloadCloud className="w-4 h-4 text-maroon-400" />
                <span>Install</span>
              </button>
            )}
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="min-h-10 px-2.5 py-1.5 bg-void-800/80 text-knight-400 hover:text-mist-100 rounded-lg touch-fast active:scale-95 text-xs font-medium flex items-center gap-1.5 border border-knight-700/40"
              title="Onboarding Guide"
            >
              <GraduationCap className="w-4 h-4 text-maroon-400" />
              <span>Guide</span>
            </button>
          </div>
        </header>
      )}

      {/* Mobile Bottom Navigation Bar & Contextual Action Sheet (md:hidden) */}
      <div className="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-sm flex flex-col items-center">
        {/* Floating Bottom Navigation */}
        <div className="w-full bg-void-900/95 backdrop-blur-xl border border-knight-700/50 shadow-2xl rounded-[1.35rem] px-2 py-2 flex justify-around items-center select-none">
          {primaryItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                aria-label={item.label}
                className={`relative flex flex-col items-center justify-center gap-1 min-w-[3.75rem] min-h-12 px-2 py-1.5 rounded-xl transition-all touch-fast active:scale-95 ${
                  isActive ? 'text-maroon-400 bg-maroon-950/80' : 'text-knight-500 hover:text-mist-100 hover:bg-void-800/70'
                }`}
              >
                <span className="flex items-center justify-center">{item.icon}</span>
                <span className="text-xs leading-none font-medium">{item.label}</span>
                
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

 

