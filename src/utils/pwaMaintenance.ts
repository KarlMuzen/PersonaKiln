// At 74177d3 only the generated service worker writes Cache Storage, so clearing it never touches app data.
export type UpdateCheckResult =
  | 'unsupported'
  | 'no-worker'
  | 'found'
  | 'current'
  | 'failed';

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker) return 'unsupported';
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await serviceWorker.getRegistration();
  } catch {
    return 'failed';
  }
  if (!registration) return 'no-worker';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<'timed-out'>((resolve) => {
      timer = setTimeout(() => resolve('timed-out'), 15000);
    });
    const settled = await Promise.race([
      registration.update().then((): 'updated' => 'updated'),
      timedOut,
    ]);
    if (settled === 'timed-out') return 'failed';
    return registration.installing || registration.waiting ? 'found' : 'current';
  } catch {
    return 'failed';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function clearAppCache(): Promise<{
  workersRemoved: number;
  cachesDeleted: number;
}> {
  let workersRemoved = 0;
  let cachesDeleted = 0;
  const serviceWorker = navigator.serviceWorker;
  if (serviceWorker?.getRegistrations) {
    const registrations = await serviceWorker.getRegistrations();
    for (const registration of registrations) {
      if (await registration.unregister()) workersRemoved += 1;
    }
  }
  const cacheStorage = globalThis.caches;
  if (cacheStorage) {
    const names = await cacheStorage.keys();
    for (const name of names) {
      if (await cacheStorage.delete(name)) cachesDeleted += 1;
    }
  }
  return { workersRemoved, cachesDeleted };
}
