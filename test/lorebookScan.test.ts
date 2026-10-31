import { describe, it, expect, vi } from 'vitest';
import { scanLorebook } from '../src/utils/lorebookScan';
import type { Lorebook, LorebookEntry } from '../src/schemas/cardSchema';

vi.mock('../src/utils/tokenizer', () => ({
  countTokens: vi.fn((text: string) => text.length), // simple mock: token count = char count
}));

describe('scanLorebook', () => {
  const createMockLorebook = (entries: Partial<LorebookEntry>[]): Lorebook => ({
    entries: entries.map(e => ({
      keys: [],
      content: '',
      enabled: true,
      case_sensitive: false,
      use_regex: false,
      constant: false,
      insertion_order: 100,
      ...e
    })) as LorebookEntry[],
    scan_depth: 5,
    token_budget: 4096,
    recursive_scanning: true,
    extensions: {}
  });

  const chatHistory = [
    { role: 'user' as const, text: 'Hello there' },
    { role: 'assistant' as const, text: 'How can I help?', speakerName: 'Char' },
    { role: 'user' as const, text: 'Tell me about the magic sword' },
    { role: 'assistant' as const, text: 'The sword is ancient.', speakerName: 'Char' },
  ];

  it('activates constant entries unconditionally', () => {
    const lb = createMockLorebook([{ content: 'Always active', constant: true }]);
    const result = scanLorebook(lb, chatHistory);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].entry.content).toBe('Always active');
  });

  it('matches primary keys', () => {
    const lb = createMockLorebook([
      { keys: ['magic sword'], content: 'Sword info' },
      { keys: ['dragon'], content: 'Dragon info' }
    ]);
    const result = scanLorebook(lb, chatHistory);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].entry.content).toBe('Sword info');
  });

  it('handles selective logic with secondary keys', () => {
    const lb = createMockLorebook([
      // Selective = false: requires primary to match first. Since primary doesn't match, it shouldn't activate even if secondary matches?
      // Wait, let's verify our implementation: if primary doesn't match, it returns false immediately.
      // So if selective = false, it behaves like secondary_keys are ignored if primary matched (or they act as nothing).
      // Wait, if primary matched and selective = true, secondary MUST match.
      { keys: ['magic'], secondary_keys: ['ancient'], selective: true, content: 'Match both' },
      { keys: ['magic'], secondary_keys: ['dragon'], selective: true, content: 'Missing secondary' }
    ]);
    const result = scanLorebook(lb, chatHistory);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].entry.content).toBe('Match both');
  });

  it('handles selective logic with empty secondary keys gracefully', () => {
    const lb = createMockLorebook([
      { keys: ['magic'], secondary_keys: [], selective: true, content: 'Selective but empty secondary' }
    ]);
    const result = scanLorebook(lb, chatHistory);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].entry.content).toBe('Selective but empty secondary');
  });

  it('falls back to entry.extensions for depth and weight when not present in text decorators', () => {
    const lb = createMockLorebook([
      {
        keys: ['magic'],
        content: 'Content without decorators',
        extensions: { depth: 4, weight: 250 }
      }
    ]);
    const result = scanLorebook(lb, chatHistory);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].depth).toBe(4);
    expect(result.activatedEntries[0].weight).toBe(250);
  });

  it('limits scanning to scan_depth', () => {
    const lb = createMockLorebook([
      { keys: ['Hello'], content: 'Too old' },
      { keys: ['ancient'], content: 'Recent' }
    ]);
    lb.scan_depth = 1; // Only look at the last message ("The sword is ancient.")
    
    const result = scanLorebook(lb, chatHistory);
    expect(result.activatedEntries).toHaveLength(1);
    expect(result.activatedEntries[0].entry.content).toBe('Recent');
  });

  it('respects token_budget with higher insertion_order surviving first', () => {
    // Our mock tokenizer counts tokens as string length.
    // Budget is 20. The higher order survives; the lower drops first.
    const lb = createMockLorebook([
      { keys: ['magic'], content: '123456789012345', insertion_order: 10 }, // 15 tokens. Dropped: it is reached last and would exceed the budget.
      { keys: ['ancient'], content: '1234567890', insertion_order: 20 },      // 10 tokens. Second: 5 + 10 = 15.
      { keys: ['sword'], content: '12345', insertion_order: 30 }              // 5 tokens. First: total 5.
    ]);
    lb.token_budget = 20;

    const result = scanLorebook(lb, chatHistory);
    // Entries 30 and 20 fit (5 + 10 = 15 tokens); the loop stops at the
    // first overflow, so the entry with order 10 drops.
    expect(result.activatedEntries).toHaveLength(2);
    expect(result.activatedEntries.map(e => e.entry.insertion_order)).toEqual([30, 20]);
    expect(result.totalTokensConsumed).toBe(15);
  });
});
