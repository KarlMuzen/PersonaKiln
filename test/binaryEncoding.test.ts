import { describe, it, expect } from 'vitest';
import {
  buf2hex,
  hex2buf,
  buf2b64,
  b642buf,
  utf8ToBase64,
  base64ToUtf8,
} from '../src/utils/binaryEncoding';

describe('binaryEncoding utilities', () => {
  describe('buf2hex & hex2buf', () => {
    it('converts Uint8Array to hex and back', () => {
      const data = new Uint8Array([0x00, 0x0f, 0x10, 0xff, 0xaa, 0x55]);
      const hex = buf2hex(data);
      expect(hex).toBe('000f10ffaa55');
      const buf = hex2buf(hex);
      expect(Array.from(buf)).toEqual(Array.from(data));
    });

    it('converts ArrayBuffer to hex and back', () => {
      const data = new Uint8Array([1, 2, 3, 4]).buffer;
      const hex = buf2hex(data);
      expect(hex).toBe('01020304');
    });

    it('handles empty buffers and empty hex strings', () => {
      expect(buf2hex(new Uint8Array(0))).toBe('');
      expect(hex2buf('').length).toBe(0);
    });

    it('safely handles malformed or odd-length hex strings', () => {
      expect(hex2buf('abc').length).toBe(0); // odd length
      expect(hex2buf('zz').length).toBe(0); // non-hex characters
    });
  });

  describe('buf2b64 & b642buf', () => {
    it('converts binary to base64 and back', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"
      const b64 = buf2b64(data);
      expect(b64).toBe('SGVsbG8gV29ybGQ=');
      const buf = b642buf(b64);
      expect(Array.from(buf)).toEqual(Array.from(data));
    });

    it('handles empty buffers', () => {
      expect(buf2b64(new Uint8Array(0))).toBe('');
      expect(b642buf('').length).toBe(0);
    });
  });

  describe('utf8ToBase64 & base64ToUtf8', () => {
    it('converts UTF-8 strings with special characters and emojis to Base64 and back', () => {
      const original = 'PersonaKiln 🧙‍♂️ ✨ — 日本語 / Español / Русский';
      const b64 = utf8ToBase64(original);
      const decoded = base64ToUtf8(b64);
      expect(decoded).toBe(original);
    });

    it('handles standard ASCII strings', () => {
      const original = 'Simple plain text';
      const b64 = utf8ToBase64(original);
      expect(base64ToUtf8(b64)).toBe(original);
    });
  });
});
