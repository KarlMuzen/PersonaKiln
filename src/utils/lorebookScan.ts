import type { Lorebook, LorebookEntry } from '../schemas/cardSchema';
import { countTokens } from './tokenizer';
import type { ChatMessage } from '../services/conversationEngine';

export interface ScanResult {
  entry: LorebookEntry;
  tokens: number;
  cleanContent: string;
  depth: number;
  weight: number;
  order: number;
  isConstant: boolean;
  matchedPrimaryKeys: string[];
  matchedSecondaryKeys: string[];
}

export interface LorebookScanDebugInfo {
  activatedEntries: ScanResult[];
  totalTokensConsumed: number;
  tokenBudget: number;
}

function isUnsafeRegex(key: string): boolean {
  if (typeof key !== 'string') return true;
  if (key.length > 200) {
    console.warn(`[lorebookScan] Regex key exceeds 200 characters limit: "${key.slice(0, 30)}..."`);
    return true;
  }
  // Detect nested quantifier shapes like (a+)+ or (a*)+ or ([a-z]+)* or (\w+)+
  const nestedQuantifierRegex = /(\([^)]*[+*]\)[+*])|(\([^)]*\{\d+,?\d*\}\)[+*])/;
  if (nestedQuantifierRegex.test(key)) {
    console.warn(`[lorebookScan] Potentially unsafe nested-quantifier regex key detected: "${key}"`);
    return true;
  }
  return false;
}

function checkMatch(
  entry: LorebookEntry,
  searchTarget: string
): { matches: boolean; matchedPrimaryKeys: string[]; matchedSecondaryKeys: string[] } {
  if (entry.constant) {
    return { matches: true, matchedPrimaryKeys: [], matchedSecondaryKeys: [] };
  }

  const primaryKeys = entry.keys || [];
  if (!Array.isArray(primaryKeys) || primaryKeys.length === 0) {
    return { matches: false, matchedPrimaryKeys: [], matchedSecondaryKeys: [] };
  }

  const matchedPrimaryKeys: string[] = [];
  const matchedSecondaryKeys: string[] = [];

  for (const k of primaryKeys) {
    if (!k) continue;
    let isMatch = false;
    if (entry.use_regex) {
      if (!isUnsafeRegex(String(k))) {
        try {
          isMatch = new RegExp(String(k), entry.case_sensitive ? '' : 'i').test(searchTarget);
        } catch {
          isMatch = false;
        }
      }
    } else {
      const target = entry.case_sensitive ? searchTarget : searchTarget.toLowerCase();
      const searchKey = entry.case_sensitive ? String(k) : String(k).toLowerCase();
      isMatch = target.includes(searchKey);
    }
    if (isMatch) {
      matchedPrimaryKeys.push(String(k));
    }
  }

  if (matchedPrimaryKeys.length === 0) {
    return { matches: false, matchedPrimaryKeys: [], matchedSecondaryKeys: [] };
  }

  const secKeys = entry.secondary_keys || [];
  if (Array.isArray(secKeys) && secKeys.length > 0) {
    for (const k of secKeys) {
      if (!k) continue;
      let isMatch = false;
      if (entry.use_regex) {
        if (!isUnsafeRegex(String(k))) {
          try {
            isMatch = new RegExp(String(k), entry.case_sensitive ? '' : 'i').test(searchTarget);
          } catch {
            isMatch = false;
          }
        }
      } else {
        const target = entry.case_sensitive ? searchTarget : searchTarget.toLowerCase();
        const searchKey = entry.case_sensitive ? String(k) : String(k).toLowerCase();
        isMatch = target.includes(searchKey);
      }
      if (isMatch) {
        matchedSecondaryKeys.push(String(k));
      }
    }
  }

  let matches = true;
  if (entry.selective === true && secKeys.length > 0) {
    matches = matchedSecondaryKeys.length > 0;
  }

  return { matches, matchedPrimaryKeys, matchedSecondaryKeys };
}

export function scanLorebook(
  lorebook: Lorebook | undefined,
  chatHistory: ChatMessage[] | string[] | string,
  userName: string = 'User',
  characterName: string = 'Character'
): LorebookScanDebugInfo {
  if (!lorebook || !lorebook.entries || !Array.isArray(lorebook.entries)) {
    return {
      activatedEntries: [],
      totalTokensConsumed: 0,
      tokenBudget: typeof lorebook?.token_budget === 'number' ? lorebook.token_budget : 0,
    };
  }

  const globalScanDepth = typeof lorebook.scan_depth === 'number' ? lorebook.scan_depth : 5;
  const recursiveScanning = typeof lorebook.recursive_scanning === 'boolean' ? lorebook.recursive_scanning : true;
  const tokenBudget = typeof lorebook.token_budget === 'number' ? lorebook.token_budget : 4096;

  const getTargetText = (entryScanDepth?: number) => {
    if (typeof chatHistory === 'string') {
      return chatHistory;
    }
    const depth = entryScanDepth ?? globalScanDepth;
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
      return '';
    }
    let messages: string[];
    if (typeof chatHistory[0] === 'string') {
      messages = chatHistory as string[];
    } else {
      messages = (chatHistory as ChatMessage[]).map(
        (m) => `${m.role === 'user' ? userName : m.speakerName || characterName}: ${m.text}`
      );
    }
    const recent = depth > 0 ? messages.slice(-depth) : messages;
    return recent.join('\n');
  };

  const parsedEntries = lorebook.entries
    .map((entry, index) => {
      if (entry.enabled === false) return null;

      const content = entry.content || '';

      const depthMatch = content.match(/@@depth\s+(\d+)/i);
      let depth = depthMatch ? parseInt(depthMatch[1], 10) : -1;
      if (depth === -1 && entry.extensions && typeof entry.extensions.depth === 'number') {
        depth = entry.extensions.depth;
      }

      const scanDepthMatch = content.match(/@@scan_depth\s+(\d+)/i);
      const scanDepth = scanDepthMatch ? parseInt(scanDepthMatch[1], 10) : globalScanDepth;

      const weightMatch = content.match(/@@weight\s+(\d+)/i);
      let weight = weightMatch ? parseInt(weightMatch[1], 10) : 100;
      if (!weightMatch) {
        if (entry.extensions && typeof entry.extensions.weight === 'number') {
          weight = entry.extensions.weight;
        } else if (typeof (entry as unknown as Record<string, unknown>).priority === 'number') {
          weight = (entry as unknown as Record<string, unknown>).priority as number;
        }
      }

      const cleanContent = content
        .replace(/@@depth\s+\d+/ig, '')
        .replace(/@@scan_depth\s+\d+/ig, '')
        .replace(/@@weight\s+\d+/ig, '')
        .trim();

      return {
        index,
        entry,
        depth,
        scanDepth,
        weight,
        cleanContent,
        order: typeof entry.insertion_order === 'number' ? entry.insertion_order : 100,
      };
    })
    .filter(Boolean) as {
    index: number;
    entry: LorebookEntry;
    depth: number;
    scanDepth: number;
    weight: number;
    cleanContent: string;
    order: number;
  }[];

  const activeResultsMap = new Map<number, ScanResult>();
  const inactiveEntries = new Map<number, LorebookEntry>();

  for (const item of parsedEntries) {
    const targetText = getTargetText(item.scanDepth);
    const { matches, matchedPrimaryKeys, matchedSecondaryKeys } = checkMatch(item.entry, targetText);

    if (matches && item.cleanContent) {
      const tokens = countTokens(item.cleanContent);
      activeResultsMap.set(item.index, {
        entry: item.entry,
        tokens,
        cleanContent: item.cleanContent,
        depth: item.depth,
        weight: item.weight,
        order: item.order,
        isConstant: !!item.entry.constant,
        matchedPrimaryKeys,
        matchedSecondaryKeys,
      });
    } else {
      inactiveEntries.set(item.index, item.entry);
    }
  }

  if (recursiveScanning) {
    let changed = true;
    while (changed) {
      changed = false;
      const activatedContent = Array.from(activeResultsMap.values())
        .map((r) => r.cleanContent)
        .join('\n');

      if (!activatedContent) break;

      for (const [idx, entry] of inactiveEntries.entries()) {
        const item = parsedEntries.find((p) => p.index === idx)!;
        const { matches, matchedPrimaryKeys, matchedSecondaryKeys } = checkMatch(entry, activatedContent);

        if (matches && item.cleanContent) {
          const tokens = countTokens(item.cleanContent);
          activeResultsMap.set(idx, {
            entry: item.entry,
            tokens,
            cleanContent: item.cleanContent,
            depth: item.depth,
            weight: item.weight,
            order: item.order,
            isConstant: !!item.entry.constant,
            matchedPrimaryKeys,
            matchedSecondaryKeys,
          });
          inactiveEntries.delete(idx);
          changed = true;
        }
      }
    }
  }

  const activated = Array.from(activeResultsMap.values());
  activated.sort((a, b) => {
    if (a.weight !== b.weight) {
      return b.weight - a.weight;
    }
    return b.order - a.order;
  });

  const finalResults: ScanResult[] = [];
  let totalTokensConsumed = 0;

  for (const res of activated) {
    if (totalTokensConsumed + res.tokens <= tokenBudget) {
      finalResults.push(res);
      totalTokensConsumed += res.tokens;
    } else {
      break;
    }
  }

  return {
    activatedEntries: finalResults,
    totalTokensConsumed,
    tokenBudget,
  };
}

