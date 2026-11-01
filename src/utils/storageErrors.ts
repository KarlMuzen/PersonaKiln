/**
 * Turns a storage failure into one readable sentence naming the field and
 * its limit. Pure: it never throws, never touches the database, and never
 * renames errors it does not recognise (a storage-full error keeps its own
 * message). Built on the real Zod 4 issue shape, verified by running a
 * 2,001-character creator through CharacterCardV3StorageSchema and through
 * db.cards.add: Dexie rethrows the ZodError itself, whose issues look like
 * { origin: 'string', code: 'too_big', maximum: 2000, path: ['data',
 * 'creator'], message: 'Too big: expected string to have <=2000
 * characters' }.
 */

interface ZodIssueLike {
  code?: unknown;
  origin?: unknown;
  maximum?: unknown;
  path?: unknown;
  message?: unknown;
}

const FIELD_NAMES: Record<string, string> = {
  creator: 'Creator',
  character_version: 'Character version',
  description: 'Description',
  personality: 'Personality',
  scenario: 'Scenario',
  first_mes: 'First message',
  mes_example: 'Example dialogue',
  system_prompt: 'System prompt',
  post_history_instructions: 'Post-history instructions',
  creator_notes: 'Creator notes',
  name: 'Name',
  tags: 'Tags',
  alternate_greetings: 'Alternate greetings',
  extensions: 'Extensions',
};

const LOREBOOK_ENTRY_FIELD_NAMES: Record<string, string> = {
  content: 'content',
  keys: 'keys',
  name: 'name',
  comment: 'comment',
  extensions: 'extensions',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The first object with an `issues` array among err, err.inner, err.cause. */
function findZodIssues(err: unknown): ZodIssueLike[] | null {
  const candidates: unknown[] = [err];
  if (isRecord(err)) {
    candidates.push(err.inner, err.cause);
  }
  for (const candidate of candidates) {
    if (isRecord(candidate) && Array.isArray(candidate.issues)) {
      return candidate.issues as ZodIssueLike[];
    }
  }
  return null;
}

function pathSegments(issue: ZodIssueLike): string[] {
  if (!Array.isArray(issue.path)) return [];
  return issue.path.map((segment) => String(segment));
}

/** 'data' is stripped; a lorebook entry path reads 'Lorebook entry N, <field>'. */
function fieldNameFor(path: string[]): string {
  const segments = path[0] === 'data' ? path.slice(1) : path;
  if (
    segments[0] === 'character_book' &&
    segments[1] === 'entries' &&
    segments.length >= 3
  ) {
    const index = Number(segments[2]);
    const rest = segments.slice(3);
    const field =
      rest.length === 1
        ? (LOREBOOK_ENTRY_FIELD_NAMES[rest[0]] ?? rest[0])
        : rest.join(' > ');
    if (Number.isInteger(index) && index >= 0) {
      return `Lorebook entry ${index + 1}, ${field}`;
    }
  }
  if (segments.length === 1) {
    return FIELD_NAMES[segments[0]] ?? segments[0];
  }
  return segments.join(' > ');
}

function thousands(value: number): string {
  return value.toLocaleString('en-US');
}

function reasonFor(issue: ZodIssueLike): string {
  if (issue.code === 'too_big' && issue.origin === 'string' && typeof issue.maximum === 'number') {
    return `is too long (limit ${thousands(issue.maximum)} characters)`;
  }
  if (issue.code === 'too_big' && issue.origin === 'array' && typeof issue.maximum === 'number') {
    return `has too many items (limit ${issue.maximum})`;
  }
  if (typeof issue.message === 'string' && issue.message) {
    return issue.message;
  }
  return 'is invalid';
}

export function describeStorageError(err: unknown): string {
  try {
    const issues = findZodIssues(err);
    if (issues && issues.length > 0) {
      const shown = issues.slice(0, 3);
      const parts = shown.map(
        (issue) => `${fieldNameFor(pathSegments(issue))}: ${reasonFor(issue)}`,
      );
      if (issues.length > 3) {
        parts.push(`and ${issues.length - 3} more`);
      }
      return parts.join('; ');
    }
    if (isRecord(err) && typeof err.message === 'string' && err.message) {
      return err.message;
    }
    return 'Database error';
  } catch {
    return 'Database error';
  }
}
