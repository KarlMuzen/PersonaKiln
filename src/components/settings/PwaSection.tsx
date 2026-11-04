import React, { useState } from 'react';
import { CheckCircle2, DownloadCloud, Eraser, Globe, RefreshCw, Smartphone } from 'lucide-react';
import { checkForAppUpdate, clearAppCache } from '../../utils/pwaMaintenance';
import type { UpdateCheckResult } from '../../utils/pwaMaintenance';

export interface PwaSectionProps {
  isInstallable: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
  reloadPage?: () => void;
}

const CHECK_TEXTS: Record<UpdateCheckResult, string> = {
  current: 'You are on the latest version.',
  found: 'A new version was found. Tap Reload in the Update Available message to install it.',
  failed: 'Could not check for updates. Check your connection and try again.',
  'no-worker':
    'No offline app copy is installed in this browser yet. Reload the page once, then try again.',
  unsupported:
    'This browser does not support offline app copies, so there is nothing to update.',
};

const CLEAR_CONFIRM_TEXT =
  'This removes the offline copy of the app stored in this browser, then reloads the page. Your cards, lorebooks, connection profiles and settings are not changed. You need an internet connection to start the app again; it downloads a fresh copy.';
const OFFLINE_TEXT =
  'You are offline. Clearing the cache now would stop the app from starting. Connect to the internet first.';

export const PwaSection: React.FC<PwaSectionProps> = ({
  isInstallable,
  isInstalled,
  promptInstall,
  reloadPage = () => window.location.reload(),
}) => {
  const [status, setStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    const result = await checkForAppUpdate();
    setChecking(false);
    setStatus(CHECK_TEXTS[result]);
  };

  const handleClearFirstTap = () => {
    if (navigator.onLine === false) {
      setStatus(OFFLINE_TEXT);
      return;
    }
    setConfirmingClear(true);
  };

  const handleClearConfirm = async () => {
    setClearing(true);
    try {
      await clearAppCache();
      setConfirmingClear(false);
      setClearing(false);
      reloadPage();
    } catch (error) {
      setConfirmingClear(false);
      setClearing(false);
      setStatus(
        `Could not clear the app cache: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  };
  return (
    <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm min-w-0">
      <div className="flex flex-wrap items-center justify-between border-b border-knight-700/40 pb-3 gap-2">
        <h3 className="text-sm font-semibold text-mist-100 flex items-center gap-2">
          <img
            src="/forge-mark.svg"
            alt="PersonaKiln logo"
            className="w-5 h-5 rounded-md object-cover border border-maroon-500/40"
            referrerPolicy="no-referrer"
          />
          Progressive Web App (PWA) & Offline Access
        </h3>
        {isInstalled ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 rounded-lg text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            App Installed
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-maroon-950/80 border border-maroon-800/80 text-maroon-300 rounded-lg text-xs font-medium">
            <DownloadCloud className="w-3.5 h-3.5 text-maroon-400" />
            Offline Ready
          </span>
        )}
      </div>

      <p className="text-xs text-knight-400 leading-relaxed">
        PersonaKiln can be installed directly onto your desktop, Android, or iOS device for full offline access, standalone window mode, and faster load times without requiring an app store download.
      </p>

      {isInstallable && (
        <div className="pt-1">
          <button
            onClick={promptInstall}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-maroon-600 to-maroon-800 hover:from-maroon-500 hover:to-maroon-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-maroon-950 transition-all active:scale-95"
          >
            <DownloadCloud className="w-4 h-4" />
            Install PersonaKiln
          </button>
        </div>
      )}

      <div className="pt-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="min-h-[44px] px-4 flex items-center gap-2 border border-knight-800/60 bg-void-950/60 hover:bg-void-900/60 text-mist-100 rounded-xl text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 text-maroon-400" />
            {checking ? 'Checking...' : 'Check for updates'}
          </button>
          <button
            type="button"
            onClick={handleClearFirstTap}
            className="min-h-[44px] px-4 flex items-center gap-2 border border-knight-800/60 bg-void-950/60 hover:bg-void-900/60 text-mist-100 rounded-xl text-xs font-medium transition-all active:scale-95"
          >
            <Eraser className="w-4 h-4 text-maroon-400" />
            Clear app cache
          </button>
        </div>
        <p role="status" aria-live="polite" className="text-xs text-knight-400">
          {status}
        </p>
        {confirmingClear && (
          <div className="p-3 bg-void-950/60 border border-knight-800/60 rounded-xl space-y-2">
            <p className="text-xs text-knight-400 leading-relaxed">{CLEAR_CONFIRM_TEXT}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleClearConfirm}
                disabled={clearing}
                className="min-h-[44px] px-4 flex items-center gap-2 border border-knight-800/60 bg-void-950/60 hover:bg-void-900/60 text-mist-100 rounded-xl text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
              >
                Clear and reload
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                disabled={clearing}
                className="min-h-[44px] px-4 flex items-center gap-2 border border-knight-800/60 bg-void-950/60 hover:bg-void-900/60 text-mist-100 rounded-xl text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        <div className="p-3 bg-void-950/60 border border-knight-800/60 rounded-xl space-y-1">
          <h4 className="text-xs font-medium text-mist-100 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-maroon-400" /> Chrome / Edge / Desktop
          </h4>
          <p className="text-[11px] text-knight-400">
            Click the install icon in your browser URL address bar or click the button above to install as a native desktop application.
          </p>
        </div>

        <div className="p-3 bg-void-950/60 border border-knight-800/60 rounded-xl space-y-1">
          <h4 className="text-xs font-medium text-mist-100 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-maroon-400" /> iOS / Safari / Mobile
          </h4>
          <p className="text-[11px] text-knight-400">
            Tap the <span className="font-semibold text-mist-200">Share</span> button in Safari, then scroll down and select <span className="font-semibold text-mist-200">"Add to Home Screen"</span>.
          </p>
        </div>
      </div>
    </div>
  );
};
