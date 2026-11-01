import { LorebookSchema, type Lorebook, type LorebookEntry } from '../schemas/cardSchema';

/**
 * Detects a standalone SillyTavern-style world-info object, without
 * confusing character cards that also contain an entries property.
 */
export function looksLikeStandaloneLorebook(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const record = value as Record<string, unknown>;
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(record, key);
  if (!hasOwn('entries')) return false;
  const entries = record.entries;
  if (!(Array.isArray(entries) || (entries !== null && typeof entries === 'object'))) return false;
  if (hasOwn('spec') && typeof record.spec === 'string' && record.spec.startsWith('chara_card')) return false;
  if (hasOwn('data') && record.data !== null && typeof record.data === 'object') return false;
  const cardFields = ['first_mes', 'mes_example', 'personality', 'scenario', 'char_greeting', 'char_name'];
  return !cardFields.some(hasOwn);
}

/**
 * Normalizes any raw lorebook or card object containing lorebook data
 * from CCv2, CCv3, SillyTavern, Chub, Agnai, or RisuAI formats.
 */
export function normalizeLorebook(raw: unknown): Lorebook | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  // 1. Locate lorebook object in card structures
  let bookObj = raw as Record<string, unknown>;
  if (bookObj.data && typeof bookObj.data === 'object') {
    const dataObj = bookObj.data as Record<string, unknown>;
    bookObj =
      (dataObj.character_book as Record<string, unknown>) ||
      ((dataObj.extensions as Record<string, unknown>)?.character_book as Record<string, unknown>) ||
      ((dataObj.extensions as Record<string, unknown>)?.world_info as Record<string, unknown>) ||
      (dataObj.world_info as Record<string, unknown>) ||
      (bookObj.character_book as Record<string, unknown>) ||
      (bookObj.world_info as Record<string, unknown>) ||
      bookObj;
  } else if (bookObj.character_book || bookObj.world_info) {
    bookObj = (bookObj.character_book as Record<string, unknown>) || (bookObj.world_info as Record<string, unknown>);
  }

  if (!bookObj || typeof bookObj !== 'object') return undefined;

  // 2. Extract entries container
  let rawEntries =
    bookObj.entries ||
    (bookObj.data as Record<string, unknown>)?.entries ||
    bookObj.world_info_entries ||
    (bookObj.character_book as Record<string, unknown>)?.entries;

  if (!rawEntries) {
    if (Array.isArray(bookObj)) {
      rawEntries = bookObj;
    } else if (typeof bookObj === 'object' && !bookObj.name && !bookObj.scan_depth) {
      // Check if bookObj is a map/dictionary of entries
      const values = Object.values(bookObj);
      if (values.length > 0 && typeof values[0] === 'object' && values[0] !== null) {
        rawEntries = values;
      }
    }
  }

  if (!rawEntries) {
    return undefined;
  }

  // Convert rawEntries map/dict to array
  let entriesArray: unknown[] = [];
  if (Array.isArray(rawEntries)) {
    entriesArray = rawEntries;
  } else if (typeof rawEntries === 'object') {
    entriesArray = Object.values(rawEntries);
  }

  if (entriesArray.length === 0) {
    return {
      name: typeof bookObj.name === 'string' ? bookObj.name : 'Lorebook',
      description: typeof bookObj.description === 'string' ? bookObj.description : '',
      scan_depth: typeof bookObj.scan_depth === 'number' ? bookObj.scan_depth : 5,
      token_budget: typeof bookObj.token_budget === 'number' ? bookObj.token_budget : 1000,
      recursive_scanning: typeof bookObj.recursive_scanning === 'boolean' ? bookObj.recursive_scanning : true,
      extensions: bookObj.extensions && typeof bookObj.extensions === 'object' ? (bookObj.extensions as Record<string, unknown>) : {},
      entries: [],
    };
  }

  // 3. Clean and normalize each entry
  const normalizedEntries = (entriesArray
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object'))
    .map((e, idx) => {
      // Extract keys
      let keys: string[] = [];
      const rawKeys = e.keys ?? e.key ?? e.keywords;
      if (Array.isArray(rawKeys)) {
        keys = rawKeys.map((k) => String(k).trim()).filter(Boolean);
      } else if (typeof rawKeys === 'string') {
        keys = rawKeys.split(',').map((k) => k.trim()).filter(Boolean);
      }

      // Extract secondary keys
      let secondary_keys: string[] | undefined = undefined;
      const rawSecKeys = e.secondary_keys ?? e.keysecondary;
      if (Array.isArray(rawSecKeys)) {
        secondary_keys = rawSecKeys.map((k) => String(k).trim()).filter(Boolean);
      } else if (typeof rawSecKeys === 'string') {
        secondary_keys = rawSecKeys.split(',').map((k) => k.trim()).filter(Boolean);
      }

      // Content
      const content = String(e.content ?? e.text ?? e.entry ?? '');

      // Enabled
      let enabled = true;
      if (e.enabled !== undefined) {
        enabled = e.enabled === true || e.enabled === 1 || e.enabled === 'true' || e.enabled === '1';
      } else if (e.disable !== undefined) {
        enabled = !(e.disable === true || e.disable === 1 || e.disable === 'true' || e.disable === '1');
      }

      // Order / Priority
      let insertion_order = 100;
      if (typeof e.insertion_order === 'number') {
        insertion_order = e.insertion_order;
      } else if (typeof e.order === 'number') {
        insertion_order = e.order;
      } else if (typeof e.priority === 'number') {
        insertion_order = e.priority;
      } else if (e.insertion_order || e.order || e.priority) {
        const parsed = parseInt(String(e.insertion_order || e.order || e.priority), 10);
        if (!isNaN(parsed)) insertion_order = parsed;
      } else {
        insertion_order = (idx + 1) * 10;
      }

      const entryExtensions: Record<string, unknown> = {
        ...(e.extensions && typeof e.extensions === 'object' ? (e.extensions as Record<string, unknown>) : {}),
      };

      const HANDLED_ENTRY_KEYS = new Set([
        'keys',
        'key',
        'keywords',
        'secondary_keys',
        'keysecondary',
        'content',
        'text',
        'entry',
        'enabled',
        'disable',
        'insertion_order',
        'order',
        'priority',
        'use_regex',
        'constant',
        'case_sensitive',
        'name',
        'comment',
        'id',
        'selective',
        'position',
        'extensions',
      ]);

      for (const [key, value] of Object.entries(e)) {
        if (!HANDLED_ENTRY_KEYS.has(key) && value !== undefined) {
          entryExtensions[key] = value;
        }
      }

      // A finite numeric position is kept in extensions.position (0 included:
      // an explicit check, not a truthiness test, which would drop 0). The
      // entry's own extensions.position, when already set, wins, as it does
      // in SillyTavern. The V2 string is not derived from the number.
      if (
        typeof e.position === 'number' && Number.isFinite(e.position) &&
        (entryExtensions.position === undefined || entryExtensions.position === null)
      ) {
        entryExtensions.position = e.position;
      }

      const entry: LorebookEntry = {
        keys,
        content,
        enabled,
        insertion_order,
        use_regex: Boolean(e.use_regex),
        extensions: entryExtensions,
      };

      if (e.constant !== undefined) entry.constant = Boolean(e.constant);
      if (e.case_sensitive !== undefined) entry.case_sensitive = Boolean(e.case_sensitive);
      if (e.name) entry.name = String(e.name);
      else if (e.comment) entry.name = String(e.comment);
      if (typeof e.priority === 'number') entry.priority = e.priority;
      if (e.id !== undefined) entry.id = e.id as number | string;
      if (e.comment) entry.comment = String(e.comment);
      if (e.selective !== undefined) entry.selective = Boolean(e.selective);
      if (secondary_keys) entry.secondary_keys = secondary_keys;
      if (e.position === 'before_char' || e.position === 'after_char') entry.position = e.position;

      return entry;
    });

  const HANDLED_BOOK_KEYS = new Set([
    'name',
    'description',
    'scan_depth',
    'token_budget',
    'recursive_scanning',
    'extensions',
    'entries',
    'data',
    'world_info_entries',
    'character_book',
  ]);

  const bookExtensions: Record<string, unknown> = {
    ...(bookObj.extensions && typeof bookObj.extensions === 'object' ? (bookObj.extensions as Record<string, unknown>) : {}),
  };

  for (const [key, value] of Object.entries(bookObj)) {
    if (!HANDLED_BOOK_KEYS.has(key) && value !== undefined) {
      bookExtensions[key] = value;
    }
  }

  const candidate: Lorebook = {
    name: typeof bookObj.name === 'string' ? bookObj.name : 'Lorebook',
    description: typeof bookObj.description === 'string' ? bookObj.description : '',
    scan_depth: typeof bookObj.scan_depth === 'number' ? bookObj.scan_depth : 5,
    token_budget: typeof bookObj.token_budget === 'number' ? bookObj.token_budget : 1000,
    recursive_scanning: typeof bookObj.recursive_scanning === 'boolean' ? bookObj.recursive_scanning : true,
    extensions: bookExtensions,
    entries: normalizedEntries,
  };

  const result = LorebookSchema.safeParse(candidate);
  if (result.success) {
    return result.data;
  } else {
    console.warn('Lorebook normalization failed Zod validation:', result.error);
    return undefined;
  }
}
