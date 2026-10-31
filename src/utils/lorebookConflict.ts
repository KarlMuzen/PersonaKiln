import type { Lorebook, LorebookEntry } from '../schemas/cardSchema';
import { countTokens } from './tokenizer';

export interface LorebookLayer {
  id: string;
  name: string;
  color?: string; // Tailwind color token or hex
  enabled: boolean;
  isPrimaryCardBook?: boolean;
  source?: 'imported' | 'standalone' | string;
  lorebook: Lorebook;
}

export interface KeyCollision {
  key: string;
  entries: {
    layerId: string;
    layerName: string;
    entryIndex: number;
    entry: LorebookEntry;
    depth: number;
    weight: number;
    order: number;
    useRegex: boolean;
  }[];
}

export interface ShadowedEntryInfo {
  layerId: string;
  layerName: string;
  entryIndex: number;
  entry: LorebookEntry;
  reason: 'budget_starvation' | 'priority_shadowed' | 'selective_lockout' | 'duplicate_content';
  details: string;
  conflictingWith?: {
    layerName: string;
    entryIndex: number;
    key?: string;
  };
}

export interface LorebookConflictAnalysis {
  layers: LorebookLayer[];
  collisions: KeyCollision[];
  shadowedEntries: ShadowedEntryInfo[];
  totalEntriesCount: number;
  duplicateEntriesCount: number;
  activeEntriesCount: number;
  totalTokensCount: number;
}

function cleanContentText(content: string): string {
  return (content || '')
    .replace(/@@depth\s+\d+/ig, '')
    .replace(/@@scan_depth\s+\d+/ig, '')
    .replace(/@@weight\s+\d+/ig, '')
    .trim();
}

/**
  Analyzes a set of lorebook layers to detect:
  1. Keyword Collisions: Identical keys or regex patterns across entries/layers.
  2. Priority Shadowing: Higher weight/lower depth entries overriding or displacing lower weight entries.
  3. Budget Starvation: Entries that will never fit within the token budget.
  4. Selective Lockouts: Entries requiring secondary keys that have no matching triggers.
  5. Duplicate Content: Repeated text entries across layered lorebooks.
 */
export function analyzeLorebookConflicts(
  layers: LorebookLayer[],
  tokenBudgetOverride?: number,
  sampleText: string = ''
): LorebookConflictAnalysis {
  const activeLayers = layers.filter((l) => l.enabled);
  const collisionsMap = new Map<string, KeyCollision['entries']>();
  const shadowedEntries: ShadowedEntryInfo[] = [];

  interface FlatEntryItem {
    layerId: string;
    layerName: string;
    entryIndex: number;
    entry: LorebookEntry;
    depth: number;
    weight: number;
    cleanText: string;
    tokens: number;
    order: number;
  }

  const allFlatEntries: FlatEntryItem[] = [];

  activeLayers.forEach((layer) => {
    const entries = layer.lorebook?.entries || [];
    entries.forEach((entry, idx) => {
      if (entry.enabled === false) return;

      const content = entry.content || '';
      const depthMatch = content.match(/@@depth\s+(\d+)/i);
      let depth = depthMatch ? parseInt(depthMatch[1], 10) : -1;
      if (depth === -1 && entry.extensions && typeof entry.extensions.depth === 'number') {
        depth = entry.extensions.depth;
      }

      const weightMatch = content.match(/@@weight\s+(\d+)/i);
      let weight = weightMatch ? parseInt(weightMatch[1], 10) : 100;
      if (!weightMatch) {
        if (entry.extensions && typeof entry.extensions.weight === 'number') {
          weight = entry.extensions.weight;
        } else if (typeof (entry as unknown as Record<string, unknown>).priority === 'number') {
          weight = (entry as unknown as Record<string, unknown>).priority as number;
        }
      }

      const cleanText = cleanContentText(content);
      const tokens = countTokens(cleanText);
      const order = typeof entry.insertion_order === 'number' ? entry.insertion_order : 100;

      allFlatEntries.push({
        layerId: layer.id,
        layerName: layer.name,
        entryIndex: idx,
        entry,
        depth,
        weight,
        cleanText,
        tokens,
        order,
      });

      // Track primary keys for collisions
      const keys = entry.keys || [];
      keys.forEach((k) => {
        if (!k || typeof k !== 'string') return;
        const normalizedKey = k.trim().toLowerCase();
        if (!normalizedKey) return;

        if (!collisionsMap.has(normalizedKey)) {
          collisionsMap.set(normalizedKey, []);
        }

        collisionsMap.get(normalizedKey)!.push({
          layerId: layer.id,
          layerName: layer.name,
          entryIndex: idx,
          entry,
          depth,
          weight,
          order,
          useRegex: !!entry.use_regex,
        });
      });
    });
  });

  // Filter collisions to keys that appear in > 1 entry
  const collisions: KeyCollision[] = [];
  collisionsMap.forEach((matchedList, key) => {
    if (matchedList.length > 1) {
      collisions.push({
        key,
        entries: matchedList,
      });
    }
  });

  // 1. Detect Priority / Depth Shadowing among colliding entries
  collisions.forEach((col) => {
    // Sort colliding entries by weight desc, then order desc (higher order wins, as in SillyTavern)
    const sorted = [...col.entries].sort((a, b) => {
      if (a.weight !== b.weight) return b.weight - a.weight;
      return b.order - a.order;
    });

    const winner = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const loser = sorted[i];
      // Check if loser entry isn't already reported for this collision
      const existing = shadowedEntries.find(
        (s) => s.layerId === loser.layerId && s.entryIndex === loser.entryIndex && s.reason === 'priority_shadowed'
      );
      if (!existing) {
        shadowedEntries.push({
          layerId: loser.layerId,
          layerName: loser.layerName,
          entryIndex: loser.entryIndex,
          entry: loser.entry,
          reason: 'priority_shadowed',
          details: `Shadowed by entry in layer '${winner.layerName}' with higher weight (${winner.weight} vs ${loser.weight}).`,
          conflictingWith: {
            layerName: winner.layerName,
            entryIndex: winner.entryIndex,
            key: col.key,
          },
        });
      }
    }
  });

  // 2. Detect Duplicate Content across layers
  for (let i = 0; i < allFlatEntries.length; i++) {
    for (let j = i + 1; j < allFlatEntries.length; j++) {
      const itemA = allFlatEntries[i];
      const itemB = allFlatEntries[j];
      if (itemA.cleanText && itemA.cleanText === itemB.cleanText) {
        shadowedEntries.push({
          layerId: itemB.layerId,
          layerName: itemB.layerName,
          entryIndex: itemB.entryIndex,
          entry: itemB.entry,
          reason: 'duplicate_content',
          details: `Exact duplicate content of entry in layer '${itemA.layerName}'.`,
          conflictingWith: {
            layerName: itemA.layerName,
            entryIndex: itemA.entryIndex,
          },
        });
      }
    }
  }

  // 3. Detect Selective Lockouts (selective: true with secondary keys that never match)
  const allKnownKeys = new Set<string>();
  allFlatEntries.forEach((item) => {
    (item.entry.keys || []).forEach((k) => allKnownKeys.add(String(k).toLowerCase()));
    (item.entry.secondary_keys || []).forEach((k) => allKnownKeys.add(String(k).toLowerCase()));
  });

  allFlatEntries.forEach((item) => {
    if (item.entry.selective && Array.isArray(item.entry.secondary_keys) && item.entry.secondary_keys.length > 0) {
      const secKeys = item.entry.secondary_keys.filter(Boolean).map((k) => String(k).toLowerCase());
      const hasPossibleTrigger = secKeys.some(
        (sk) => allKnownKeys.has(sk) || (sampleText && sampleText.toLowerCase().includes(sk))
      );
      if (!hasPossibleTrigger) {
        shadowedEntries.push({
          layerId: item.layerId,
          layerName: item.layerName,
          entryIndex: item.entryIndex,
          entry: item.entry,
          reason: 'selective_lockout',
          details: `Selective entry requires secondary keys [${secKeys.join(', ')}], which do not exist in active keys or test prompt.`,
        });
      }
    }
  });

  // 4. Token Budget Starvation
  const effectiveBudget =
    tokenBudgetOverride ||
    Math.max(
      1000,
      ...activeLayers.map((l) => (typeof l.lorebook.token_budget === 'number' ? l.lorebook.token_budget : 1000))
    );

  const sortedForBudget = [...allFlatEntries].sort((a, b) => {
    if (a.weight !== b.weight) return b.weight - a.weight;
    return b.order - a.order;
  });

  let runningTokens = 0;
  sortedForBudget.forEach((item) => {
    if (runningTokens + item.tokens > effectiveBudget) {
      const existing = shadowedEntries.find(
        (s) => s.layerId === item.layerId && s.entryIndex === item.entryIndex && s.reason === 'budget_starvation'
      );
      if (!existing) {
        shadowedEntries.push({
          layerId: item.layerId,
          layerName: item.layerName,
          entryIndex: item.entryIndex,
          entry: item.entry,
          reason: 'budget_starvation',
          details: `Exceeds combined token budget of ${effectiveBudget} tokens (would push total from ${runningTokens} to ${
            runningTokens + item.tokens
          } tokens).`,
        });
      }
    } else {
      runningTokens += item.tokens;
    }
  });

  const totalEntriesCount = allFlatEntries.length;
  const duplicateEntriesCount = shadowedEntries.filter((s) => s.reason === 'duplicate_content').length;
  const activeEntriesCount = totalEntriesCount - shadowedEntries.length;
  const totalTokensCount = allFlatEntries.reduce((sum, item) => sum + item.tokens, 0);

  return {
    layers,
    collisions,
    shadowedEntries,
    totalEntriesCount,
    duplicateEntriesCount,
    activeEntriesCount: Math.max(0, activeEntriesCount),
    totalTokensCount,
  };
}

/**
  Merges multiple lorebook layers into a single combined Lorebook object.
 */
export function mergeLorebookLayers(layers: LorebookLayer[], nameOverride?: string): Lorebook {
  const activeLayers = layers.filter((l) => l.enabled);
  const combinedEntries: LorebookEntry[] = [];

  activeLayers.forEach((layer) => {
    const entries = layer.lorebook?.entries || [];
    entries.forEach((entry, _idx) => {
      const copy: LorebookEntry = JSON.parse(JSON.stringify(entry));
      // Tag entry with layer origin if not already set
      if (!copy.comment && layer.name) {
        copy.comment = `[From Layer: ${layer.name}]`;
      }
      copy.insertion_order = (combinedEntries.length + 1) * 10;
      combinedEntries.push(copy);
    });
  });

  const maxBudget = Math.max(
    1000,
    ...activeLayers.map((l) => (typeof l.lorebook.token_budget === 'number' ? l.lorebook.token_budget : 1000))
  );

  return {
    name: nameOverride || `Composed Lorebook (${activeLayers.length} Layers)`,
    description: `Composed from layers: ${activeLayers.map((l) => l.name).join(', ')}`,
    scan_depth: activeLayers[0]?.lorebook.scan_depth || 5,
    token_budget: maxBudget,
    recursive_scanning: activeLayers.some((l) => l.lorebook.recursive_scanning !== false),
    extensions: {},
    entries: combinedEntries,
  };
}
