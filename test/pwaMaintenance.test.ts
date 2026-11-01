// @vitest-environment jsdom
import '../test/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import type { StoredCard } from '../src/db';
import { createNewDefaultCard } from '../src/utils/cardDefaults';
import { checkForAppUpdate, clearAppCache } from '../src/utils/pwaMaintenance';

type RegistrationStub = {
  installing?: unknown;
  waiting?: unknown;
  update?: () => Promise<void>;
  unregister?: () => Promise<boolean>;
};

type ServiceWorkerStub = {
  getRegistration?: () => Promise<RegistrationStub | undefined>;
  getRegistrations?: () => Promise<RegistrationStub[]>;
};

type CachesStub = {
  keys: () => Promise<string[]>;
  delete: (name: string) => Promise<boolean>;
};

function setServiceWorker(stub: ServiceWorkerStub): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: stub,
    configurable: true,
  });
}

function removeServiceWorker(): void {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
}

function setCaches(stub: CachesStub): void {
  Object.defineProperty(globalThis, 'caches', { value: stub, configurable: true });
}

function removeCaches(): void {
  delete (globalThis as unknown as Record<string, unknown>).caches;
}

beforeEach(async () => {
  await db.cards.clear();
});

afterEach(() => {
  removeServiceWorker();
  removeCaches();
  vi.useRealTimers();
  localStorage.clear();
});

describe('checkForAppUpdate', () => {
  it("returns 'unsupported' when navigator.serviceWorker is missing", async () => {
    removeServiceWorker();
    await expect(checkForAppUpdate()).resolves.toBe('unsupported');
  });

  it("returns 'no-worker' when getRegistration resolves to nothing", async () => {
    setServiceWorker({ getRegistration: async () => undefined });
    await expect(checkForAppUpdate()).resolves.toBe('no-worker');
  });

  it("returns 'current' when update resolves and nothing is installing or waiting", async () => {
    setServiceWorker({
      getRegistration: async () => ({ update: async () => {} }),
    });
    await expect(checkForAppUpdate()).resolves.toBe('current');
  });

  it("returns 'found' when installing is set after update", async () => {
    setServiceWorker({
      getRegistration: async () => ({ installing: {}, update: async () => {} }),
    });
    await expect(checkForAppUpdate()).resolves.toBe('found');
  });

  it("returns 'found' when waiting is set after update", async () => {
    setServiceWorker({
      getRegistration: async () => ({ waiting: {}, update: async () => {} }),
    });
    await expect(checkForAppUpdate()).resolves.toBe('found');
  });

  it("returns 'failed' when update() rejects", async () => {
    setServiceWorker({
      getRegistration: async () => ({
        update: async () => {
          throw new Error('update boom');
        },
      }),
    });
    await expect(checkForAppUpdate()).resolves.toBe('failed');
  });

  it('returns \'failed\' when getRegistration() rejects', async () => {
    setServiceWorker({
      getRegistration: async () => {
        throw new Error('registration boom');
      },
    });
    await expect(checkForAppUpdate()).resolves.toBe('failed');
  });

  it('returns \'failed\' when update() never settles within 15 seconds', async () => {
    vi.useFakeTimers();
    setServiceWorker({
      getRegistration: async () => ({ update: () => new Promise<void>(() => {}) }),
    });
    const promise = checkForAppUpdate();
    await vi.advanceTimersByTimeAsync(15000);
    await expect(promise).resolves.toBe('failed');
  });
});

describe('clearAppCache', () => {
  it('unregisters every registration before deleting every cache and returns the counts', async () => {
    const order: string[] = [];
    setServiceWorker({
      getRegistrations: async () => [
        {
          unregister: async () => {
            order.push('unregister');
            return true;
          },
        },
        {
          unregister: async () => {
            order.push('unregister');
            return true;
          },
        },
      ],
    });
    setCaches({
      keys: async () => ['cache-a', 'cache-b', 'cache-c'],
      delete: async (name) => {
        order.push(`delete:${name}`);
        return true;
      },
    });
    await expect(clearAppCache()).resolves.toEqual({
      workersRemoved: 2,
      cachesDeleted: 3,
    });
    expect(order).toEqual([
      'unregister',
      'unregister',
      'delete:cache-a',
      'delete:cache-b',
      'delete:cache-c',
    ]);
  });

  it('removes only workers when caches is missing', async () => {
    setServiceWorker({
      getRegistrations: async () => [
        { unregister: async () => true },
        { unregister: async () => false },
      ],
    });
    removeCaches();
    await expect(clearAppCache()).resolves.toEqual({
      workersRemoved: 1,
      cachesDeleted: 0,
    });
  });

  it('deletes only caches when serviceWorker is missing', async () => {
    removeServiceWorker();
    setCaches({
      keys: async () => ['cache-a', 'cache-b'],
      delete: async () => true,
    });
    await expect(clearAppCache()).resolves.toEqual({
      workersRemoved: 0,
      cachesDeleted: 2,
    });
  });

  it('rejects when a caches.delete rejects', async () => {
    removeServiceWorker();
    setCaches({
      keys: async () => ['cache-a'],
      delete: async () => {
        throw new Error('delete boom');
      },
    });
    await expect(clearAppCache()).rejects.toThrow('delete boom');
  });

  it('leaves IndexedDB cards and localStorage untouched', async () => {
    const cardData = createNewDefaultCard('Cache safety');
    const record = {
      uuid: 'cache-safety',
      name: 'Cache safety',
      creation_date: 0,
      modification_date: 0,
      tags: [],
      creator: '',
      order: 0,
      cardData,
      testSuites: [],
      scenarios: [],
    } as unknown as StoredCard;
    await db.cards.add(record);
    localStorage.setItem('cache-safety-key', 'keep-me');
    setServiceWorker({ getRegistrations: async () => [] });
    setCaches({ keys: async () => [], delete: async () => true });
    await expect(clearAppCache()).resolves.toEqual({
      workersRemoved: 0,
      cachesDeleted: 0,
    });
    const saved = await db.cards.where('uuid').equals('cache-safety').first();
    expect(saved?.name).toBe('Cache safety');
    expect(localStorage.getItem('cache-safety-key')).toBe('keep-me');
  });
});
