// @vitest-environment jsdom
import '../test/setup';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EnhancerView } from '../src/components/EnhancerView';
import { useCardStore } from '../src/store/useCardStore';
import { createNewDefaultCard } from '../src/utils/cardDefaults';

afterEach(() => {
  const timeout = useCardStore.getState().saveTimeoutId;
  if (timeout) clearTimeout(timeout);
  useCardStore.setState({ saveTimeoutId: null, saveState: 'idle' });
});

function seed(activeProfileUuid: string | null) {
  const card = createNewDefaultCard('Enhancer test');
  card.data.description = 'A seasoned cartographer.';
  card.data.personality = 'Patient and precise.';
  card.data.first_mes = 'Welcome, traveller.';
  card.data.system_prompt = 'Stay in character.';
  const record = {
    uuid: 'enhancer-test',
    name: 'Enhancer test',
    tags: [],
    creator: '',
    cardData: card,
    scenarios: [
      {
        id: 'scen-1',
        name: 'Harbour Run',
        persona: 'Tester',
        lastRunResult: {
          'prof-1': {
            scores: {
              agendaHeld: true,
              tellConsistency: 8,
              openerQuality: 7,
              loreDelivery: 9,
              driftOnsetTurn: null,
              reasoning: 'Held the agenda throughout.',
            },
            transcript: [{ role: 'user', text: 'Hello' }],
            timestamp: 1,
          },
        },
      },
    ],
  };
  useCardStore.setState({
    activeTab: 'enhancer',
    activeCard: card,
    activeCardUuid: 'enhancer-test',
    activeCardRecord: record as never,
    cards: [],
    profiles: [
      {
        uuid: 'prof-1',
        name: 'TestProf',
        provider: 'openai',
        model: 'gpt-test',
      },
    ],
    activeProfileUuid,
    undoStack: [],
    redoStack: [],
    saveState: 'idle',
    saveTimeoutId: null,
  });
}

describe('EnhancerView Sent to line', () => {
  it('shows the profile and the sent fields for a selected run', async () => {
    seed('prof-1');
    render(<EnhancerView />);
    fireEvent.click(await screen.findByRole('button', { name: /Harbour Run/ }));
    expect(
      screen.getByText(
        'Sent to TestProf (openai, gpt-test): run scores, transcript, name, description, personality, first message, system prompt, lorebook entries.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the no-profile line when no profile is active', async () => {
    seed(null);
    render(<EnhancerView />);
    fireEvent.click(await screen.findByRole('button', { name: /Harbour Run/ }));
    expect(
      screen.getByText(
        'No active connection profile. Select one in Settings; nothing is sent until then.',
      ),
    ).toBeInTheDocument();
  });
});
