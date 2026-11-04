// @vitest-environment jsdom
import '../test/setup';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { GalleryView } from '../src/components/GalleryView';
import { useCardStore } from '../src/store/useCardStore';
import { db, type StoredCard } from '../src/db';

const createMockCard = (
  uuid: string,
  name: string,
  tags: string[] = [],
  description = ''
): StoredCard => ({
  uuid,
  name,
  creator: 'TestAuthor',
  tags,
  modification_date: Date.now(),
  cardData: {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name,
      description,
      tags,
      creator: 'TestAuthor',
      character_version: '1.0',
      mes_example: '',
      extensions: {},
      system_prompt: '',
      post_history_instructions: '',
      first_mes: 'Hello',
      personality: '',
      scenario: '',
      creator_notes: '',
      alternate_greetings: [],
      group_only_greetings: [],
      assets: [],
      character_book: null,
    },
  },
  embeddedAssets: {},
});

describe('GalleryView component', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.cards.clear();
    useCardStore.setState({
      cards: [],
      activeCardUuid: null,
      searchQuery: '',
      selectedTag: null,
      selectedCardUuids: [],
      isLoadingCards: false,
    });
  });

  it('renders empty state when no cards exist', async () => {
    render(<GalleryView />);
    await waitFor(() => {
      expect(screen.getByText(/No Character Cards/i)).toBeDefined();
    });
  });

  it('has no rating buttons and filters by tag picker', async () => {
    const sfwCard = createMockCard('sfw-1', 'SFW Hero', ['sfw']);
    const nsfwCard = createMockCard('nsfw-1', 'Dark Villian', ['Mature Themes']);
    const unratedCard = createMockCard('unrated-1', 'Mystery Wanderer', []);

    await db.cards.bulkAdd([sfwCard, nsfwCard, unratedCard]);
    await useCardStore.getState().loadCardsFromDb();

    render(<GalleryView />);

    await waitFor(() => {
      expect(screen.getAllByText('SFW Hero').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Dark Villian').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Mystery Wanderer').length).toBeGreaterThanOrEqual(1);
    });

    // No rating pills at all: the Library bar shows only the Tags button.
    for (const name of ['SFW', 'NSFW', 'Unrated', 'All Ratings']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }

    // Tag picker still works: filtering by #sfw shows only SFW Hero.
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    expect(screen.getByRole('dialog', { name: 'Choose tag filter' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '#sfw' }));

    await waitFor(() => {
      expect(screen.getAllByText('SFW Hero').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('Dark Villian')).toBeNull();
      expect(screen.queryByText('Mystery Wanderer')).toBeNull();
    });
  });
});
