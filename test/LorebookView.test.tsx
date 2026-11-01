// @vitest-environment jsdom
import '../test/setup';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LorebookView } from '../src/components/LorebookView';
import { useCardStore } from '../src/store/useCardStore';
import { createNewDefaultCard } from '../src/utils/cardDefaults';
import { db } from '../src/db';

beforeEach(async () => {
  await db.lorebooks.clear();
  await db.lorebooks.add({
    uuid: 'saved-world',
    name: 'World',
    lorebook: {
      name: 'World',
      description: '',
      scan_depth: 5,
      token_budget: 1000,
      recursive_scanning: true,
      extensions: {},
      entries: [],
    },
    updatedAt: Date.now(),
  });
  const card = createNewDefaultCard('Lorebook menu test');
  useCardStore.setState({
    activeTab: 'lorebook',
    activeCard: card,
    activeCardUuid: 'lorebook-menu-test',
    cards: [],
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
});

describe('LorebookView saved lorebook menu', () => {
  it('opens on tap, closes on Escape, on pick, and on an outside tap', async () => {
    render(<LorebookView />);
    fireEvent.click(await screen.findByRole('button', { name: /Multi-Lorebook Composer/ }));
    const toggle = await screen.findByRole('button', { name: '+ Saved Lorebook' });

    expect(screen.queryByText('World (0 entries)')).toBeNull();

    fireEvent.click(toggle);
    expect(await screen.findByText('World (0 entries)')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('World (0 entries)')).toBeNull();
    });

    fireEvent.click(toggle);
    await screen.findByText('World (0 entries)');
    fireEvent.click(screen.getByText('World (0 entries)'));
    await waitFor(() => {
      expect(screen.queryByText('World (0 entries)')).toBeNull();
    });
    expect(screen.getByText('[DB] World')).toBeInTheDocument();

    fireEvent.click(toggle);
    await screen.findByText('World (0 entries)');
    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByText('World (0 entries)')).toBeNull();
    });
  });
});
