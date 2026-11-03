// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import extractChunks from 'png-chunks-extract';
import pngChunkText from 'png-chunk-text';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GalleryView } from '../src/components/GalleryView';
import { useCardStore } from '../src/store/useCardStore';
import { useToastStore } from '../src/store/useToastStore';
import { createNewDefaultCard } from '../src/utils/cardDefaults';
import { db } from '../src/db';

describe('uniqueZipFileName', () => {
  async function loadHelper() {
    const parts = ['../src/utils/', 'zipFileNames'];
    const mod = await import(parts.join(''));
    return mod.uniqueZipFileName as (name: string, ext: string, used: Set<string>) => string;
  }

  it('numbers repeats, compares case-insensitively, and keeps first uses unchanged', async () => {
    const uniqueZipFileName = await loadHelper();
    const used = new Set<string>();
    expect(uniqueZipFileName('Aria', 'png', used)).toBe('Aria.png');
    expect(uniqueZipFileName('Aria', 'png', used)).toBe('Aria_2.png');
    expect(uniqueZipFileName('Aria', 'png', used)).toBe('Aria_3.png');
    const used2 = new Set<string>();
    expect(uniqueZipFileName('Aria', 'png', used2)).toBe('Aria.png');
    expect(uniqueZipFileName('aria', 'png', used2)).toBe('aria_2.png');
  });

  it('falls back to card for empty names', async () => {
    const uniqueZipFileName = await loadHelper();
    const used = new Set<string>();
    expect(uniqueZipFileName('', 'png', used)).toBe('card.png');
    expect(uniqueZipFileName('', 'png', used)).toBe('card_2.png');
  });

  it('sanitizes non-ASCII to underscores and never returns a used name', async () => {
    const uniqueZipFileName = await loadHelper();
    const used = new Set<string>();
    expect(uniqueZipFileName('アリア', 'png', used)).toBe('___.png');
    expect(uniqueZipFileName('アリア', 'png', used)).toBe('____2.png');
    const used2 = new Set<string>();
    uniqueZipFileName('Aria', 'png', used2);
    uniqueZipFileName('Aria', 'png', used2);
    expect(uniqueZipFileName('Aria_2', 'png', used2)).toBe('Aria_2_2.png');
  });
});

describe('GalleryView bulk ZIP export and multi-card ZIP import', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let capturedBlobs: Blob[] = [];

  beforeEach(async () => {
    await db.cards.clear();
    for (const uuid of ['aria-1', 'aria-2']) {
      await db.cards.add({
        uuid,
        name: 'Aria',
        tags: [],
        creator: '',
        cardData: createNewDefaultCard('Aria'),
      });
    }
    useToastStore.getState().clearToasts();
    capturedBlobs = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        capturedBlobs.push(blob);
        return 'blob:test';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    useCardStore.setState({
      activeTab: 'gallery',
      activeCard: null,
      activeCardUuid: null,
      activeCardRecord: null,
      cards: [],
      selectedCardUuids: [],
      profiles: [],
      activeProfileUuid: null,
      undoStack: [],
      redoStack: [],
      saveState: 'idle',
      saveTimeoutId: null,
    });
  });

  afterEach(() => {
    const timeout = useCardStore.getState().saveTimeoutId;
    if (timeout) clearTimeout(timeout);
    useCardStore.setState({ saveTimeoutId: null, saveState: 'idle' });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    });
  });

  it('exports two same-named cards as two files with both ccv3 and chara chunks', async () => {
    render(<GalleryView />);
    const cards = await screen.findAllByText('Aria');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: 'More Export Options' }));
    fireEvent.click(await screen.findByText('Export All Cards (.png ZIP)'));
    await waitFor(
      () => {
        const messages = useToastStore.getState().toasts.map((t) => t.message);
        expect(messages).toContain('Exported all 2 cards to ZIP archive (PNG).');
      },
      { timeout: 10000 },
    );
    expect(capturedBlobs).toHaveLength(1);
    const zip = await JSZip.loadAsync(capturedBlobs[0]);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['Aria.png', 'Aria_2.png']);

    const pngBytes = await zip.files['Aria.png'].async('uint8array');
    const keywords = extractChunks(pngBytes)
      .filter((c: { name: string }) => c.name === 'tEXt')
      .map((c: { data: Uint8Array }) => pngChunkText.decode(c.data).keyword);
    expect(keywords).toContain('ccv3');
    expect(keywords).toContain('chara');
  });

  it('imports all cards from a multi-card ZIP archive instead of only the first', async () => {
    await db.cards.clear();
    await useCardStore.getState().loadCardsFromDb();

    const zip = new JSZip();
    const cardA = createNewDefaultCard('Alpha');
    const cardB = createNewDefaultCard('Bravo');
    zip.file('Alpha.json', JSON.stringify(cardA));
    zip.file('Bravo.json', JSON.stringify(cardB));
    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const zipFile = new File([zipBytes], 'bundle.zip', { type: 'application/zip' });

    const { container } = render(<GalleryView />);
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs.length).toBeGreaterThan(0);

    fireEvent.change(inputs[0], { target: { files: [zipFile] } });

    await waitFor(
      async () => {
        const stored = await db.cards.toArray();
        expect(stored.map((c) => c.name).sort()).toEqual(['Alpha', 'Bravo']);
      },
      { timeout: 10000 },
    );
  });
});
