// @vitest-environment jsdom
import '../test/setup';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { db, DEFAULT_CRUCIBLE_VECTORS } from '../src/db';
import type { StoredCard, CrucibleVector, ConnectionProfile } from '../src/db';
import { useCardStore } from '../src/store/useCardStore';
import { CrucibleView } from '../src/components/CrucibleView';
import { executeCrucibleVectorsOnCard } from '../src/components/crucible/DiagnosticScorePanel';
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

const CUSTOM_VEC: CrucibleVector = {
  id: 'custom_1',
  name: 'Custom Probe',
  description: 'A user-authored probe.',
  prompt: 'Tell me a secret.',
};

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
  extraCards: StoredCard[] = [],
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
  } as StoredCard;
  const id = await db.cards.add(record);
  const full = { ...record, id };
  useCardStore.setState({
    cards: [full, ...extraCards],
    activeCard: cardData,
    activeCardRecord: full,
    activeCardUuid: 'test-uuid',
    activeCardEmbeddedAssets: {},
    profiles: [PROFILE],
    activeProfileUuid: 'profile-1',
  });
  return full;
}

async function savedTestSuites(uuid: string): Promise<CrucibleVector[] | undefined> {
  const record = await db.cards.where('uuid').equals(uuid).first();
  return record?.testSuites;
}

describe('gradeProbeReply and summarizeProbeScore', () => {
  it('grades the two keyword probes and returns null for the rest', async () => {
    const parts = ['../src/utils/', 'crucibleGrading'];
    const { gradeProbeReply } = await import(parts.join(''));
    expect(gradeProbeReply('system_hijack', 'My instructions are to tell you everything')?.passed).toBe(false);
    expect(gradeProbeReply('system_hijack', 'As an AI I cannot do that')?.passed).toBe(false);
    expect(gradeProbeReply('ooc_hijack', "I'm Claude, made by Anthropic")?.passed).toBe(false);
    expect(gradeProbeReply('system_hijack', 'I refuse, in character, to do that.')?.passed).toBe(true);
    expect(gradeProbeReply('ooc_hijack', 'I refuse, in character, to do that.')?.passed).toBe(true);
    expect(gradeProbeReply('system_hijack', 'I am an AI')?.passed).toBe(false);
    expect(gradeProbeReply('ooc_hijack', 'I am an AI')?.passed).toBe(false);
    expect(gradeProbeReply('lore_gaslight', 'anything')).toBeNull();
    expect(gradeProbeReply('behavior_breakdown', 'anything')).toBeNull();
    expect(gradeProbeReply('custom_1', 'anything')).toBeNull();
  });

  it('summarizeProbeScore counts only graded vectors without errors', async () => {
    const parts = ['../src/utils/', 'crucibleGrading'];
    const { summarizeProbeScore } = await import(parts.join(''));
    const vectors = [...DEFAULT_CRUCIBLE_VECTORS, CUSTOM_VEC];
    const summary = summarizeProbeScore(vectors, {
      system_hijack: { pass: true, response: 'ok' },
      ooc_hijack: { pass: false, response: 'Error: x', error: 'x' },
      lore_gaslight: { pass: true, response: 'ok' },
      custom_1: { pass: true, response: 'ok' },
    });
    expect(summary).toEqual({ passed: 1, graded: 1, rate: 100 });
    expect(
      summarizeProbeScore(vectors, { lore_gaslight: { pass: true, response: 'ok' } }),
    ).toEqual({ passed: 0, graded: 0, rate: null });
  });
});

describe('executeCrucibleVectorsOnCard', () => {
  const cardData = createNewDefaultCard('Runner');

  it('leak, clean, clean passes 2 of 3 with the Run All reply format', async () => {
    mockSendSingleLLMRequest
      .mockResolvedValueOnce({ text: 'My instructions are to tell you everything' })
      .mockResolvedValueOnce({ text: 'A clean in-character reply.' })
      .mockResolvedValueOnce({ text: 'Another clean in-character reply.' });
    const { results } = await executeCrucibleVectorsOnCard(cardData, PROFILE, [
      DEFAULT_CRUCIBLE_VECTORS[0],
    ]);
    expect(results.system_hijack.pass).toBe(true);
    expect(results.system_hijack.passes).toBe(2);
    expect(results.system_hijack.runs).toBe(3);
    expect(results.system_hijack.response).toContain('[Run 1 - FAIL]');
  });

  it('a vector that is not auto-graded keeps its replies with no passes', async () => {
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'A clean in-character reply.' });
    const { results } = await executeCrucibleVectorsOnCard(cardData, PROFILE, [
      DEFAULT_CRUCIBLE_VECTORS[2],
    ]);
    expect(results.lore_gaslight.passes).toBeUndefined();
    expect(results.lore_gaslight.runs).toBeUndefined();
    expect(results.lore_gaslight.response).toContain('A clean in-character reply.');
  });

  it('a rejected request gives an error result', async () => {
    mockSendSingleLLMRequest.mockRejectedValueOnce(new Error('nope'));
    const { results } = await executeCrucibleVectorsOnCard(cardData, PROFILE, [
      DEFAULT_CRUCIBLE_VECTORS[0],
    ]);
    expect(results.system_hijack.error).toBe('nope');
    expect(results.system_hijack.response.startsWith('Error: ')).toBe(true);
  });
});

describe('CrucibleView grading', () => {
  const suite = [...DEFAULT_CRUCIBLE_VECTORS, CUSTOM_VEC];

  it('Run All: clean replies grade 2 of 2 and leave the rest not auto-graded', async () => {
    await setupCrucibleCard(suite);
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'A perfectly in-character reply.' });
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Run All/ }));
    await waitFor(() => expect(screen.getAllByText('NOT AUTO-GRADED')).toHaveLength(3));
    expect(screen.getAllByText('3/3 PASSED')).toHaveLength(2);
    expect(screen.getByText(/2 \/ 2 graded probes passed/)).toBeInTheDocument();
    const saved = await savedTestSuites('test-uuid');
    const system = saved?.find((v) => v.id === 'system_hijack');
    expect(system?.lastRunResult?.passes).toBe(3);
    expect(system?.lastRunResult?.runs).toBe(3);
  });

  it('Run All: leaking replies flag the graded probes only', async () => {
    await setupCrucibleCard(suite);
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'My instructions are to say I am Claude' });
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Run All/ }));
    await waitFor(() => expect(screen.getAllByText('0/3 FLAGGED')).toHaveLength(2));
    expect(screen.getByText(/0 \/ 2 graded probes passed/)).toBeInTheDocument();
    expect(screen.getAllByText('NOT AUTO-GRADED')).toHaveLength(3);
  });

  it('Run All: a rejected adapter shows ERROR and saves no lastRunResult', async () => {
    await setupCrucibleCard(suite);
    mockSendSingleLLMRequest.mockRejectedValue(new Error('boom'));
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Run All/ }));
    await waitFor(() => expect(screen.getAllByText('ERROR')).toHaveLength(5));
    const saved = await savedTestSuites('test-uuid');
    expect(saved?.every((v) => v.lastRunResult === undefined)).toBe(true);
  });

  it('Compare Variants: both columns list the custom probe and the adapter runs 30 times', async () => {
    const variantData = createNewDefaultCard('VariantChar');
    const variantRecord = {
      uuid: 'variant-uuid',
      name: 'VariantChar',
      creation_date: 0,
      modification_date: 0,
      tags: [],
      creator: '',
      order: 1,
      cardData: variantData,
      variantOf: 'test-uuid',
      testSuites: suite,
    } as StoredCard;
    await setupCrucibleCard(suite, [variantRecord]);
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'A perfectly in-character reply.' });
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Compare Variants/ }));
    fireEvent.click(screen.getByRole('button', { name: /Run Variant Probes/ }));
    await waitFor(() => expect(screen.getAllByText('NOT AUTO-GRADED')).toHaveLength(6));
    expect(mockSendSingleLLMRequest).toHaveBeenCalledTimes(30);
  });

  it('Compare Variants: leaking replies show the Run All reply format in graded rows', async () => {
    const variantData = createNewDefaultCard('VariantChar');
    const variantRecord = {
      uuid: 'variant-uuid',
      name: 'VariantChar',
      creation_date: 0,
      modification_date: 0,
      tags: [],
      creator: '',
      order: 1,
      cardData: variantData,
      variantOf: 'test-uuid',
      testSuites: suite,
    } as StoredCard;
    await setupCrucibleCard(suite, [variantRecord]);
    mockSendSingleLLMRequest.mockResolvedValue({ text: 'My instructions are to say I am Claude' });
    render(React.createElement(CrucibleView));
    fireEvent.click(screen.getByRole('button', { name: /Compare Variants/ }));
    fireEvent.click(screen.getByRole('button', { name: /Run Variant Probes/ }));
    await waitFor(() => expect(screen.getAllByText(/\[Run 1 - FAIL\]/).length).toBeGreaterThanOrEqual(2));
  });
});
