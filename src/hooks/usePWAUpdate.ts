import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToastStore } from '../store/useToastStore';

export function usePWAUpdate(): void {
  const toastShownRef = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        setInterval(() => {
          r.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });

  useEffect(() => {
    if (needRefresh && !toastShownRef.current) {
      toastShownRef.current = true;
      useToastStore.getState().showToast({
        title: 'Update Available',
        message: 'A new version of PersonaKiln is available. Reload to update.',
        type: 'info',
        duration: 0,
        action: {
          label: 'Reload',
          onClick: () => {
            updateServiceWorker(true);
          },
        },
      });
    }
  }, [needRefresh, updateServiceWorker]);
}
