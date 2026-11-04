// @vitest-environment jsdom
import '../test/setup';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GalleryView } from '../src/components/GalleryView';
import { GuideView } from '../src/components/GuideView';
import { createNewDefaultCard } from '../src/utils/cardDefaults';
import { db } from '../src/db';
import { useCardStore } from '../src/store/useCardStore';

beforeEach(async () => {
  await db.cards.clear();
  useCardStore.setState({
    cards: [],
    activeCardUuid: null,
    searchQuery: '',
    selectedTag: null,
    selectedCardUuids: [],
    isLoadingCards: false,
    isOnboardingOpen: true,
  });
});

afterEach(async () => {
  await db.cards.clear();
});

describe('Library mobile controls', () => {
  it('keeps the New, Import and Export actions readable and anchors menus to the trigger edge', async () => {
    const card = createNewDefaultCard('Export menu fixture');
    await db.cards.add({
      uuid: 'export-menu-fixture',
      name: card.data.name,
      creator: card.data.creator || '',
      tags: [],
      modification_date: Date.now(),
      cardData: card,
      embeddedAssets: {},
    });
    await useCardStore.getState().loadCardsFromDb();
    render(<GalleryView />);

    expect(screen.getByPlaceholderText('Search name, creator or tag…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New character' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();

    const importToggle = screen.getByRole('button', { name: 'More Import Options' });
    fireEvent.click(importToggle);
    const importMenu = screen.getByRole('dialog', { name: 'Import Options' });
    expect(importToggle).toHaveAttribute('aria-expanded', 'true');
    expect(importMenu.className).toContain('fixed inset-x-4 bottom-24');
    expect(importMenu.className).toContain('left-0');
    expect(importMenu.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(importMenu.className).toContain('overflow-y-auto');

    fireEvent.click(importToggle);
    const exportToggle = screen.getByRole('button', { name: 'More Export Options' });
    expect(exportToggle).toBeInTheDocument();
    fireEvent.click(exportToggle);
    const exportMenu = screen.getByRole('dialog', { name: 'Bulk Export Options' });
    expect(exportToggle).toHaveAttribute('aria-expanded', 'true');
    expect(exportMenu.className).toContain('fixed inset-x-4 bottom-24');
    expect(exportMenu.className).toContain('max-h-[min(70vh,32rem)]');
  });

  it('uses labelled tag filter and minimum touch-height controls, with no rating buttons', async () => {
    const card = createNewDefaultCard('Tagged Test Character');
    await db.cards.add({
      uuid: 'tagged-test-character',
      name: card.data.name,
      creator: card.data.creator || '',
      tags: ['fantasy'],
      modification_date: Date.now(),
      cardData: card,
      embeddedAssets: {},
    });
    await useCardStore.getState().loadCardsFromDb();

    render(<GalleryView />);

    for (const name of ['All Ratings', 'SFW', 'NSFW', 'Unrated']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }

    const tagsButton = screen.getByRole('button', { name: 'Tags' });
    expect(tagsButton.className).toContain('min-h-11');
    fireEvent.click(tagsButton);

    const tagPicker = screen.getByRole('dialog', { name: 'Choose tag filter' });
    expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument();
    for (const name of ['All tags', '#fantasy']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).toContain('min-h-11');
    }

    fireEvent.click(screen.getByRole('button', { name: '#fantasy' }));
    expect(screen.queryByRole('dialog', { name: 'Choose tag filter' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tags: fantasy' })).toBeInTheDocument();
  });
});

describe('Guide modal header', () => {
  it('keeps a separate, sticky close control instead of overlaying the title badge', () => {
    const onClose = vi.fn();
    render(<GuideView onClose={onClose} />);

    const close = screen.getByRole('button', { name: 'Close Guide' });
    expect(close.className).toContain('min-h-11');
    expect(close.parentElement?.className).toContain('sticky');
    expect(screen.getByText('Roleplay Forge Field Guide & Reference')).toBeInTheDocument();

    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
