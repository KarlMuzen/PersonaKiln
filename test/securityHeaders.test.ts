import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

function vercelCsp(): string {
  const cfg = JSON.parse(read('vercel.json'));
  const all = cfg.headers.flatMap((h: { headers: { key: string; value: string }[] }) => h.headers);
  return all.find((h: { key: string }) => h.key === 'Content-Security-Policy').value;
}

describe('security headers', () => {
  it('Vercel and _headers carry the same CSP', () => {
    const line = read('public/_headers').split('\n').find((l) => l.includes('Content-Security-Policy'))!;
    expect(line.replace(/^\s*Content-Security-Policy:\s*/, '').trim()).toBe(vercelCsp());
  });

  it('index.html has no inline scripts (script-src is self only)', () => {
    const scripts = [...read('index.html').matchAll(/<script([^>]*)>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(s[1]).toContain('src=');
    expect(vercelCsp()).toContain("script-src 'self';");
  });

  it('allows local model servers such as Ollama', () => {
    const csp = vercelCsp();
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('http://127.0.0.1:*');
  });

  it('theme bootstrap keeps the persisted theme key', () => {
    expect(read('public/theme-init.js')).toContain('personakiln-theme');
  });
});
