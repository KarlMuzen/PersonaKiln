import { useState, useEffect } from 'react';
import { useToastStore } from '../store/useToastStore';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const WELCOME_FLAG = 'personakiln-installed-welcome';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    !!(navigator as unknown as { standalone?: boolean }).standalone ||
    false
  );
}

// Several components call usePWAInstall(); module state keeps each toast to one.
let installedToastShown = false;
let welcomeChecked = false;

/** Shown in the browser tab right after the install completes. */
export function announceInstalled(): void {
  if (installedToastShown) return;
  installedToastShown = true;
  useToastStore.getState().showToast({
    title: 'PersonaKiln installed',
    message: 'Open it from your home screen or app drawer. Your library works offline.',
    type: 'success',
    duration: 6000,
  });
}

/** Shown once, the first time the installed app opens in standalone mode. */
export function announceFirstStandaloneLaunch(): void {
  if (welcomeChecked) return;
  welcomeChecked = true;
  if (!isStandalone()) return;
  try {
    if (localStorage.getItem(WELCOME_FLAG)) return;
    localStorage.setItem(WELCOME_FLAG, '1');
  } catch {
    return; // storage blocked: skip rather than toast on every launch
  }
  useToastStore.getState().showToast({
    title: 'PersonaKiln is installed',
    message: 'Your library and settings stay on this device and work offline.',
    type: 'success',
    duration: 6000,
  });
}

/** Test hook: reset module state. */
export function __resetInstallToastsForTests(): void {
  installedToastShown = false;
  welcomeChecked = false;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  useEffect(() => {
    announceFirstStandaloneLaunch();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      announceInstalled();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
      announceInstalled();
    }
    setDeferredPrompt(null);
  };

  return {
    isInstallable: !!deferredPrompt && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
