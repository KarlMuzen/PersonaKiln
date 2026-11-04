import React, { useState, useEffect } from 'react';
import { RotateCcw, Smartphone, Lock } from 'lucide-react';
import { useDialogStore } from '../store/useDialogStore';
import { useModalA11y } from '../hooks/useModalA11y';

export const PortraitGuard: React.FC = () => {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const modalRef = useModalA11y(isLandscapeMobile && !dismissed, () => setDismissed(true));

  useEffect(() => {
    const checkOrientation = () => {
      // Use physical screen orientation or screen dimensions to avoid false triggers when soft keyboard resizes innerHeight
      const hasOrientationApi = typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.type === 'string';
      const isScreenLandscape = hasOrientationApi
        ? screen.orientation.type.includes('landscape')
        : (typeof window !== 'undefined' && (
            (window.orientation !== undefined && (window.orientation === 90 || window.orientation === -90)) ||
            (window.screen && window.screen.width > window.screen.height)
          ));

      const isMobileViewport = window.innerWidth < 900 || window.innerHeight < 600;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      // Only trigger guard if physically in landscape on a mobile-sized touch screen
      if (isScreenLandscape && isMobileViewport && isTouchDevice) {
        setIsLandscapeMobile(true);
        // Attempt lock automatically
        const orientation = screen.orientation as unknown as { lock?: (orientation: string) => Promise<void> };
        if (orientation && typeof orientation.lock === 'function') {
          orientation.lock('portrait-primary').catch(() => {
            orientation.lock?.('portrait').catch(() => {});
          });
        }
      } else {
        setIsLandscapeMobile(false);
        setDismissed(false); // Reset dismissal when rotated back to portrait
      }
    };

    checkOrientation();

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  const handleLockClick = () => {
    const orientation = screen.orientation as unknown as { lock?: (orientation: string) => Promise<void> };
    if (orientation && typeof orientation.lock === 'function') {
      orientation.lock('portrait-primary').catch(() => {
        orientation.lock?.('portrait').catch(() => {
          useDialogStore.getState().showAlert('Device hardware orientation lock is managed by your mobile system settings or fullscreen mode.', 'Orientation Lock', 'info');
        });
      });
    }
  };

  if (!isLandscapeMobile || dismissed) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-[100] bg-void-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center text-mist-100"
    >
      <div 
        ref={modalRef as React.RefObject<HTMLDivElement>}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="portrait-guard-title"
        className="max-w-md w-full bg-void-900 border border-knight-700/60 rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl shadow-maroon-950/50 flex flex-col items-center"
      >
        {/* Animated Phone Rotate Graphic */}
        <div className="relative w-20 h-20 flex items-center justify-center">

          <div className="w-16 h-16 bg-maroon-950 border border-maroon-700/80 rounded-2xl flex items-center justify-center text-maroon-400 shadow-lg">
            <Smartphone className="w-8 h-8" />
          </div>
          <RotateCcw className="w-6 h-6 text-mist-100 absolute -top-1 -right-1" />
        </div>

        <div className="space-y-2">
          <h2 id="portrait-guard-title" className="text-lg font-bold text-mist-100 flex items-center justify-center gap-2">
            <Lock className="w-4 h-4 text-maroon-400" />
            Portrait Mode Required
          </h2>
          <p className="text-xs text-knight-300 leading-relaxed max-w-sm">
            PersonaKiln studio controls are optimized for portrait orientation. Please rotate your device back to upright portrait mode.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 w-full pt-2">
          <button
            onClick={handleLockClick}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-maroon-600 to-maroon-800 hover:from-maroon-500 hover:to-maroon-700 text-white rounded-xl text-xs font-semibold shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Lock to Portrait
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="py-2.5 px-4 min-h-10 bg-void-800 hover:bg-void-700 text-knight-300 hover:text-mist-100 border border-knight-700/50 rounded-xl text-xs font-medium transition-colors touch-fast active:scale-95 flex items-center justify-center"
          >
            Use Landscape Anyway
          </button>
        </div>
      </div>
    </div>
  );
};
