/**
 * File names for bulk ZIP exports. The sanitizing rule matches the one the
 * gallery used before: every character outside a-z, 0-9, `_` and `-`
 * becomes `_`, so non-ASCII letters stay `_`. Names are compared
 * case-insensitively, because Windows and macOS extract
 * case-insensitively, and a taken name gets a numeric suffix until one is
 * free. The chosen name's lowercase key is added to `used`.
 */
export function uniqueZipFileName(name: string, ext: string, used: Set<string>): string {
  const base = name.replace(/[^a-z0-9_-]/gi, '_') || 'card';
  let candidate = `${base}.${ext}`;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${n}.${ext}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
