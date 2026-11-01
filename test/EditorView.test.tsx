// @vitest-environment jsdom
import '../test/setup';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorView } from '../src/components/EditorView';
import { useCardStore } from '../src/store/useCardStore';
import { createNewDefaultCard } from '../src/utils/cardDefaults';

function setupCard(dataOverrides: Record<string, string>) {
  const card = createNewDefaultCard('Details total test');
  Object.assign(card.data, dataOverrides);
  useCardStore.setState({
    activeTab: 'editor',
    activeCard: card,
    activeCardUuid: 'details-total-test',
    cards: [],
    profiles: [],
    activeProfileUuid: null,
    undoStack: [],
    redoStack: [],
    saveState: 'idle',
    saveTimeoutId: null,
  });
  return card;
}

afterEach(() => {
  const timeout = useCardStore.getState().saveTimeoutId;
  if (timeout) clearTimeout(timeout);
  useCardStore.setState({ saveTimeoutId: null, saveState: 'idle' });
});

function readHeadline(container: HTMLElement): number {
  const el = screen.getByTitle('Estimated tokens');
  const match = (el.textContent || '').match(/^(\d+)\//);
  if (!match) throw new Error(`headline not in expected form: ${el.textContent}`);
  return Number(match[1]);
}

function readChip(container: HTMLElement, label: string): number {
  const span = Array.from(container.querySelectorAll('span')).find((s) =>
    (s.textContent || '').startsWith(`${label}:`),
  );
  if (!span) return 0;
  const match = (span.textContent || '').match(/:\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

function chipPresent(container: HTMLElement, label: string): boolean {
  return Array.from(container.querySelectorAll('span')).some((s) =>
    (s.textContent || '').startsWith(`${label}:`),
  );
}

async function waitForSettledHeadline(container: HTMLElement): Promise<number> {
  let last = -1;
  let stable = 0;
  await waitFor(
    () => {
      const current = readHeadline(container);
      if (current === last) {
        stable += 1;
      } else {
        last = current;
        stable = 0;
      }
      expect(stable).toBeGreaterThanOrEqual(2);
    },
    { timeout: 5000 },
  );
  return last;
}

const FULL_FIELDS = {
  description:
    'A seasoned cartographer who has mapped every coastline of the northern continent over twenty long years of travel. She speaks slowly and precisely, and she never forgets a landmark she has seen.',
  first_mes:
    'Welcome, traveller. You have arrived at the edge of the mapped world, and I have been expecting you for some time. Please, sit down and tell me where you intend to go next.',
  personality:
    'Patient, observant, and quietly stubborn. She distrusts shortcuts, double-checks every measurement, and keeps her promises even when keeping them is inconvenient for everyone involved.',
  scenario:
    'The expedition sets out at dawn from the harbour town, following the old coastal road north until the cliffs give way to open marshland. Supplies are limited and the weather is turning.',
  system_prompt:
    'You are the cartographer. Stay in character at all times, describe places with concrete sensory detail, and never break the fourth wall or mention that you are an artificial intelligence.',
  post_history_instructions:
    'After each exchange, remember the places the traveller has visited and the promises that were made. Refer back to earlier stops on the journey whenever the route comes up again.',
  mes_example:
    'Traveller: Which way to the lighthouse?\nCartographer: Follow the cliff path north until the gulls grow loud, then turn inland at the broken wall.',
  creator_notes:
    'Drafted during the winter revision pass. The northern coastline sections were rewritten twice, and the marshland encounter still needs a second draft before this card is final.',
};

describe('EditorView details token total', () => {
  it('the headline equals the sum of the visible chips', async () => {
    setupCard(FULL_FIELDS);
    const { container } = render(<EditorView />);
    const headline = await waitForSettledHeadline(container);
    const labels = ['Desc', 'Greeting', 'Personality', 'Scenario', 'System', 'Post-history', 'Examples'];
    const sum = labels.reduce((acc, label) => acc + readChip(container, label), 0);
    expect(headline).toBe(sum);
  });

  it('the Post-history chip is absent when empty and present with a number when filled', async () => {
    const card = setupCard({ ...FULL_FIELDS, post_history_instructions: '' });
    const { container } = render(<EditorView />);
    await waitForSettledHeadline(container);
    expect(chipPresent(container, 'Post-history')).toBe(false);

    const updated = { ...card, data: { ...card.data, post_history_instructions: FULL_FIELDS.post_history_instructions } };
    act(() => {
      useCardStore.setState({ activeCard: updated });
    });
    await waitFor(() => {
      expect(chipPresent(container, 'Post-history')).toBe(true);
    });
    expect(readChip(container, 'Post-history')).toBeGreaterThan(0);
  });
});

describe('EditorView export menu and personality note', () => {
  it('the Export Card As... placeholder option is hidden', async () => {
    setupCard(FULL_FIELDS);
    render(<EditorView />);
    const option = await screen.findByText('Export Card As...');
    expect(option).toHaveAttribute('hidden');
  });

  it('a card whose only gap is Personality shows the OK pill, no alerts pill, and the note', async () => {
    setupCard({
      description: 'A seasoned cartographer who has mapped every coastline of the northern continent.',
      first_mes: 'Welcome, traveller.',
      personality: '',
    });
    render(<EditorView />);
    await screen.findByText('OK');
    expect(screen.queryByText(/\d+ alerts/)).toBeNull();
    expect(
      screen.getByText('Personality is empty. It is optional; many cards put it in Description.'),
    ).toBeInTheDocument();
  });

  it('a card with a real gap still shows 1 alerts and still shows the note', async () => {
    setupCard({
      description: '',
      first_mes: 'Welcome, traveller.',
      personality: '',
    });
    render(<EditorView />);
    await screen.findByText('1 alerts');
    expect(
      screen.getByText('Personality is empty. It is optional; many cards put it in Description.'),
    ).toBeInTheDocument();
  });
});
