import { describe, it, expect } from 'vitest';
import { analyzeLorebookConflicts, mergeLorebookLayers, type LorebookLayer } from '../src/utils/lorebookConflict';
import { countTokens } from '../src/utils/tokenizer';

describe('Lorebook Conflict Analyzer', () => {
  it('detects keyword collisions across multiple layers', () => {
    const layer1: LorebookLayer = {
      id: 'l1',
      name: 'Card Lore',
      enabled: true,
      lorebook: {
        extensions: {},
        entries: [
          { keys: ['Excalibur', 'Sword'], content: 'Excalibur is a holy sword.', enabled: true, insertion_order: 10, extensions: {}, use_regex: false },
        ],
      },
    };

    const layer2: LorebookLayer = {
      id: 'l2',
      name: 'World Codex',
      enabled: true,
      lorebook: {
        extensions: {},
        entries: [
          { keys: ['Excalibur', 'King Arthur'], content: 'Excalibur rests in Camelot.', enabled: true, insertion_order: 20, extensions: {}, use_regex: false },
        ],
      },
    };

    const result = analyzeLorebookConflicts([layer1, layer2]);
    expect(result.collisions.length).toBeGreaterThan(0);
    expect(result.collisions[0].key).toBe('excalibur');
    expect(result.collisions[0].entries.length).toBe(2);
    // Equal weight, so the higher insertion_order wins: the order 10 entry
    // is shadowed by the order 20 entry from "World Codex".
    const shadowed = result.shadowedEntries.filter((s) => s.reason === 'priority_shadowed');
    expect(shadowed).toHaveLength(1);
    expect(shadowed[0].entry.insertion_order).toBe(10);
    expect(shadowed[0].conflictingWith?.layerName).toBe('World Codex');
  });

  it('starves only the lower insertion_order entry under a tight budget', () => {
    const swordText = Array(40).fill('sword').join(' ');
    const castleText = Array(40).fill('castle').join(' ');
    const layer: LorebookLayer = {
      id: 'l1',
      name: 'Budget Book',
      enabled: true,
      lorebook: {
        extensions: {},
        entries: [
          { keys: ['swordkey'], content: swordText, enabled: true, insertion_order: 10, extensions: {}, use_regex: false },
          { keys: ['castlekey'], content: castleText, enabled: true, insertion_order: 20, extensions: {}, use_regex: false },
        ],
      },
    };

    const probe = analyzeLorebookConflicts([layer]);
    expect(probe.totalTokensCount).toBe(countTokens(swordText) + countTokens(castleText));
    // Budget between one entry's tokens and both entries' tokens: the order
    // 20 entry fits, the order 10 entry then overflows and starves.
    const budget = countTokens(castleText) + 1;
    const result = analyzeLorebookConflicts([layer], budget);
    const starved = result.shadowedEntries.filter((s) => s.reason === 'budget_starvation');
    expect(starved).toHaveLength(1);
    expect(starved[0].entry.insertion_order).toBe(10);
  });

  it('detects priority shadowing when weights differ', () => {
    const layer1: LorebookLayer = {
      id: 'l1',
      name: 'Card Lore',
      enabled: true,
      lorebook: {
        extensions: {},
        entries: [
          { keys: ['Eldoria'], content: '@@weight 100\nEldoria is a realm.', enabled: true, insertion_order: 10, extensions: {}, use_regex: false },
        ],
      },
    };

    const layer2: LorebookLayer = {
      id: 'l2',
      name: 'World Lore',
      enabled: true,
      lorebook: {
        extensions: {},
        entries: [
          { keys: ['Eldoria'], content: '@@weight 50\nEldoria description in world book.', enabled: true, insertion_order: 20, extensions: {}, use_regex: false },
        ],
      },
    };

    const result = analyzeLorebookConflicts([layer1, layer2]);
    expect(result.shadowedEntries.some((s) => s.reason === 'priority_shadowed')).toBe(true);
  });

  it('merges layers into a single lorebook cleanly', () => {
    const layer1: LorebookLayer = {
      id: 'l1',
      name: 'Layer A',
      enabled: true,
      lorebook: {
        extensions: {},
        entries: [{ keys: ['KeyA'], content: 'Content A', enabled: true, insertion_order: 10, extensions: {}, use_regex: false }],
      },
    };

    const layer2: LorebookLayer = {
      id: 'l2',
      name: 'Layer B',
      enabled: true,
      lorebook: {
        extensions: {},
        entries: [{ keys: ['KeyB'], content: 'Content B', enabled: true, insertion_order: 20, extensions: {}, use_regex: false }],
      },
    };

    const merged = mergeLorebookLayers([layer1, layer2], 'Test Combined');
    expect(merged.name).toBe('Test Combined');
    expect(merged.entries.length).toBe(2);
  });
});
