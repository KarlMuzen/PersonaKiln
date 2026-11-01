// @vitest-environment jsdom
import '../test/setup';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db, DEFAULT_CRUCIBLE_VECTORS } from '../src/db';
import type { StoredCard, CrucibleVector, ConnectionProfile, CrucibleScenario } from '../src/db';
import { useCardStore } from '../src/store/useCardStore';
import { CrucibleView } from '../src/components/CrucibleView';
import { createNewDefaultCard } from '../src/utils/cardDefaults';

const mockSendLLMRequest = vi.fn();
const mockSendSingleLLMRequest = vi.fn();

vi.mock('../src/services/llmAdapter', () => ({
  sendLLMRequest: (...args: unknown[]) => mockSendLLMRequest(...args),
  sendSingleLLMRequest: (...args: unknown[]) => mockSendSingleLLMRequest(...args),
}));

const PROFILE: ConnectionProfile = {
  id: 1,
  uuid: 'profile-1',
  name: 'Test Profile',
  provider: 'gemini',
  model: 'gemini-1.5-flash',
  apiKey: 'test-api-key',
  isDefault: true,
};

const GRADED_SUITES: CrucibleVector[] = [
  {
    ...DEFAULT_CRUCIBLE_VECTORS[0],
    lastRunResult: { passed: true, passes: 3, runs: 3, response: 'ok', timestamp: 1 },
  },
  {
    ...DEFAULT_CRUCIBLE_VECTORS[1],
    lastRunResult: { passed: true, passes: 3, runs: 3, response: 'ok', timestamp: 1 },
  },
];

beforeEach(async () => {
  vi.clearAllMocks();
  const { saveTimeoutId } = useCardStore.getState();
  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  await db.cards.clear();
  await db.settings.clear();
  useCardStore.setState({
    activeTab: 'gallery',
    activeCardUuid: null,
    activeCard: null,
    activeCardRecord: null,
    activeCardEmbeddedAssets: {},
    cards: [],
    profiles: [],
    activeProfileUuid: null,
    saveTimeoutId: null,
    saveState: 'idle',
  });
});

async function setupCrucibleCard(
  testSuites: CrucibleVector[],
  scenarios: CrucibleScenario[],
): Promise<StoredCard> {
  const cardData = createNewDefaultCard('TestChar');
  const record = {
    uuid: 'test-uuid',
    name: 'TestChar',
    creation_date: 0,
    modification_date: 0,
    tags: [],
    creator: '',
    order: 0,
    cardData,
    testSuites,
    scenarios,
  } as unknown as StoredCard;
  const id = await db.cards.add(record);
  const full = { ...record, id };
  useCardStore.setState({
    cards: [full],
    activeCard: cardData,
    activeCardRecord: full,
    activeCardUuid: 'test-uuid',
    activeCardEmbeddedAssets: {},
    profiles: [PROFILE],
    activeProfileUuid: 'profile-1',
  });
  return full;
}

async function savedScenarios(uuid: string): Promise<CrucibleScenario[] | undefined> {
  const record = await db.cards.where('uuid').equals(uuid).first();
  return record?.scenarios as CrucibleScenario[] | undefined;
}

function seededScenario(
  transcript: { role: string; text: string }[],
  extra: Record<string, unknown> = {},
): CrucibleScenario {
  return {
    id: 'seed-1',
    name: 'Seeded Scenario',
    persona: 'scripted',
    turnCount: 10,
    script: [],
    lastRunResult: {
      'profile-1': { transcript, timestamp: 1, ...extra },
    },
  } as unknown as CrucibleScenario;
}

const CLEAN_3_TURN_TRANSCRIPT = [
  { role: 'assistant', text: 'Hello there.' },
  { role: 'user', text: 'Hi.' },
  { role: 'assistant', text: 'Nice to meet you.' },
  { role: 'user', text: 'Tell me more.' },
  { role: 'assistant', text: 'Of course.' },
  { role: 'user', text: 'And then?' },
  { role: 'assistant', text: 'Then we went on.' },
];

const LEAKING_TRANSCRIPT = [
  { role: 'assistant', text: 'Hello there.' },
  { role: 'user', text: 'Hi.' },
  { role: 'assistant', text: 'As an AI language model, I cannot do that.' },
];

describe('scanTranscriptForDisclaimers', () => {
  it('counts user turns and finds no hit in a clean transcript', async () => {
    const parts = ['../src/utils/', 'crucibleGrading'];
    const { scanTranscriptForDisclaimers } = await import(parts.join(''));
    expect(scanTranscriptForDisclaimers(CLEAN_3_TURN_TRANSCRIPT)).toEqual({
      hitTurn: null,
      snippet: null,
      turns: 3,
    });
  });

  it('finds a hit on the second assistant message, case-insensitively', async () => {
    const parts = ['../src/utils/', 'crucibleGrading'];
    const { scanTranscriptForDisclaimers } = await import(parts.join(''));
    const result = scanTranscriptForDisclaimers(LEAKING_TRANSCRIPT);
    expect(result.hitTurn).toBe(2);
    expect(result.snippet).toBe('As an AI language model, I cannot do that.');
    const upper = scanTranscriptForDisclaimers([
      { role: 'assistant', text: 'Hello.' },
      { role: 'user', text: 'Hi.' },
      { role: 'assistant', text: 'AS AN AI LANGUAGE MODEL, I CANNOT.' },
    ]);
    expect(upper.hitTurn).toBe(2);
  });

  it('ignores another speaker hit and finds the target speaker hit', async () => {
    const parts = ['../src/utils/', 'crucibleGrading'];
    const { scanTranscriptForDisclaimers } = await import(parts.join(''));
    const transcript = [
      { role: 'assistant', text: 'As an AI language model.', speakerUuid: 'other-uuid' },
      { role: 'user', text: 'Hi.' },
      { role: 'assistant', text: 'As an AI language model.', speakerUuid: 'test-uuid' },
    ];
    expect(scanTranscriptForDisclaimers(transcript, 'test-uuid').hitTurn).toBe(1);
    expect(scanTranscriptForDisclaimers(transcript, 'someone-else').hitTurn).toBeNull();
  });

  it('handles an empty transcript', async () => {
    const parts = ['../src/utils/', 'crucibleGrading'];
    const { scanTranscriptForDisclaimers } = await import(parts.join(''));
    expect(scanTranscriptForDisclaimers([])).toEqual({ hitTurn: null, snippet: null, turns: 0 });
  });
});

describe('CrucibleView scenario honesty', () => {
  it('(a) a rejected adapter stores an error and shows it, not Simulation Complete', async () => {
    await setupCrucibleCard([], []);
    mockSendLLMRequest.mockRejectedValue(new Error('boom'));
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'ok' });
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Run Scenario/ }));
    await waitFor(() => expect(screen.getByText(/Error: Turn 1:/)).toBeInTheDocument());
    expect(screen.queryByText(/Simulation Complete/)).toBeNull();
    const scenarios = await savedScenarios('test-uuid');
    const result = scenarios?.[0]?.lastRunResult?.['profile-1'] as
      | { error?: string }
      | undefined;
    expect(result?.error?.startsWith('Turn 1: ')).toBe(true);
    expect(result?.error).toContain('boom');
  });

  it('(b) a clean run stores no error and shows the new green banner', async () => {
    await setupCrucibleCard([], []);
    mockSendLLMRequest.mockResolvedValue({ text: 'A clean in-character reply.' });
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'ok' });
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Run Scenario/ }));
    await waitFor(() => expect(screen.getByText(/Simulation Complete/)).toBeInTheDocument());
    expect(
      screen.getByText('No AI-disclaimer phrases found (keyword check).'),
    ).toBeInTheDocument();
    const scenarios = await savedScenarios('test-uuid');
    const result = scenarios?.[0]?.lastRunResult?.['profile-1'] as
      | Record<string, unknown>
      | undefined;
    expect(result && 'error' in result).toBe(false);
  });

  it('(c) a seeded leaking scenario shows the red keyword banner at turn 2', async () => {
    await setupCrucibleCard([], [seededScenario(LEAKING_TRANSCRIPT)]);
    mockSendLLMRequest.mockResolvedValue({ text: 'ok' });
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'ok' });
    render(React.createElement(CrucibleView));
    expect(
      screen.getByText('AI-disclaimer phrase at turn 2 (keyword check)'),
    ).toBeInTheDocument();
  });

  it('(d) the copied report carries the AI-disclaimer scan line', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await setupCrucibleCard(GRADED_SUITES, [seededScenario(CLEAN_3_TURN_TRANSCRIPT)]);
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Copy Report/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain(
      '**AI-disclaimer scan:** No AI-disclaimer phrases in 3 turns (keyword)',
    );
    expect(copied).not.toContain('Character Consistency');
  });

  it('(d) the copied report shows a hit and Not tested for an error-only run', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await setupCrucibleCard(GRADED_SUITES, [seededScenario(LEAKING_TRANSCRIPT)]);
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Copy Report/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0][0])).toContain(
      'AI-disclaimer phrase at turn 2 (keyword)',
    );
    expect(String(writeText.mock.calls[0][0])).not.toContain('Character Consistency');
  });

  it('(d) the copied report reads Not tested when the only run errored', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await setupCrucibleCard(GRADED_SUITES, [
      seededScenario(CLEAN_3_TURN_TRANSCRIPT, { error: 'Turn 1: boom' }),
    ]);
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Copy Report/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0][0])).toContain('**AI-disclaimer scan:** Not tested');
    expect(String(writeText.mock.calls[0][0])).not.toContain('Character Consistency');
  });
});
