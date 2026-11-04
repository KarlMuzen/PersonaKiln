import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { hashKey } from '../src/utils/crypto';
import { enrollPasskey } from '../src/utils/passkeyCrypto';

function hexToBytes(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

function hexOf(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('rebrand', () => {
  it('hashKey signs the new verifier label', async () => {
    const raw = new Uint8Array(32).map((_, i) => i * 7 + 3);
    const key = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const actual = await hashKey(key);

    const hmacKey = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      hmacKey,
      new TextEncoder().encode('RoleplayForgeVerifier'),
    );
    expect(actual).toBe(hexOf(signature));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enrollPasskey wraps with the new HKDF info and the new passkey labels', async () => {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      vi.stubGlobal('crypto', webcrypto);
    }
    const prfOutput = new Uint8Array(32).map((_, i) => i + 1);
    let capturedCreateOptions: {
      publicKey?: {
        rp?: { name?: string };
        user?: { name?: string; displayName?: string };
      };
    } = {};
    vi.stubGlobal('window', {
      PublicKeyCredential: class {},
      location: { hostname: 'localhost' },
    });
    vi.stubGlobal('navigator', {
      credentials: {
        create: vi.fn(async (options: typeof capturedCreateOptions) => {
          capturedCreateOptions = options;
          return {
            rawId: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
            getClientExtensionResults: () => ({ prf: { enabled: true } }),
          };
        }),
        get: vi.fn(async () => ({
          getClientExtensionResults: () => ({
            prf: { results: { first: prfOutput.buffer } },
          }),
        })),
      },
    });

    const masterKey = new Uint8Array(32).map((_, i) => 255 - i);
    const result = await enrollPasskey(masterKey);
    expect(result).not.toBeNull();

    const wrapped = hexToBytes(result!.wrappedKeyHex);
    const iv = wrapped.slice(0, 12);
    const ciphertext = wrapped.slice(12);
    const wrapKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: new TextEncoder().encode('RoleplayForge-Passkey-Wrap-v1'),
      },
      await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']),
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      wrapKey,
      ciphertext,
    );
    expect(new Uint8Array(decrypted)).toEqual(masterKey);

    expect(capturedCreateOptions.publicKey?.rp?.name).toBe('PersonaKiln');
    expect(capturedCreateOptions.publicKey?.user?.name).toBe('personakiln_user');
    expect(capturedCreateOptions.publicKey?.user?.displayName).toBe(
      'PersonaKiln User',
    );
  });

  it('the old brand name is gone from code, tests, public files and config', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    // Built from two pieces so this file does not itself contain the name.
    const pattern = new RegExp('card' + '[ _-]?crucible', 'i');
    const binaryExtensions = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'avif',
      'woff', 'woff2', 'ttf', 'otf', 'eot',
      'mp3', 'mp4', 'zip', 'gz', 'pdf', 'wasm', 'bin', 'dat',
    ]);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
          if (binaryExtensions.has(ext)) continue;
          if (entry.name === 'rebrand.test.ts') continue;
          const text = readFileSync(full, 'utf8');
          if (pattern.test(text)) hits.push(full);
        }
      }
    };
    for (const dir of ['src', 'test', 'public', 'scripts']) {
      const full = join(root, dir);
      if (existsSync(full) && statSync(full).isDirectory()) walk(full);
    }
    for (const file of ['index.html', 'package.json', 'vite.config.ts']) {
      const full = join(root, file);
      if (existsSync(full) && pattern.test(readFileSync(full, 'utf8'))) {
        hits.push(full);
      }
    }
    expect(hits).toEqual([]);
  });

  it('the old brand name is gone except for the three frozen strings', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    // Built from two pieces so this file does not itself match the pattern.
    const pattern = new RegExp('roleplay' + '[ _-]?forge', 'i');
    // Exactly three frozen strings are allowed, each in its own file, plus
    // the tests that reference them. They are stripped before scanning, so
    // any other occurrence in any scanned file is a failure.
    const frozen = [
      'RoleplayForgeDB',
      'RoleplayForgeVerifier',
      'RoleplayForge-Passkey-Wrap-v1',
    ];
    const binaryExtensions = new Set([
      'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'avif',
      'woff', 'woff2', 'ttf', 'otf', 'eot',
      'mp3', 'mp4', 'zip', 'gz', 'pdf', 'wasm', 'bin', 'dat',
    ]);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
          if (binaryExtensions.has(ext)) continue;
          let text = readFileSync(full, 'utf8');
          for (const allowed of frozen) text = text.split(allowed).join('');
          if (pattern.test(text)) hits.push(full);
        }
      }
    };
    for (const dir of ['src', 'test', 'public', 'scripts']) {
      const full = join(root, dir);
      if (existsSync(full) && statSync(full).isDirectory()) walk(full);
    }
    // package.json and package-lock.json are intentionally not scanned here:
    // their repository URL still names the repository, not the visible
    // brand, and their package name fields are already the new brand.
    for (const file of ['index.html', 'vite.config.ts', 'metadata.json']) {
      const full = join(root, file);
      if (!existsSync(full)) continue;
      let text = readFileSync(full, 'utf8');
      for (const allowed of frozen) text = text.split(allowed).join('');
      if (pattern.test(text)) hits.push(full);
    }
    expect(hits).toEqual([]);
  });
});
