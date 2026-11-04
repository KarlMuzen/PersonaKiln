/**
 * Consolidated binary, hex, and base64 encoding helpers.
 * Single source of truth for buffer and string conversions across PersonaKiln.
 */

/**
 * Convert BufferSource, ArrayBuffer, or Uint8Array to Hex string
 */
export function buf2hex(buf: BufferSource | ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array
    ? buf
    : ArrayBuffer.isView(buf)
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Convert Hex string to Uint8Array. Returns empty Uint8Array on invalid or odd-length hex.
 */
export function hex2buf(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    return new Uint8Array(0);
  }
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Convert BufferSource, ArrayBuffer, or Uint8Array to Base64 string
 */
export function buf2b64(buf: BufferSource | ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array
    ? buf
    : ArrayBuffer.isView(buf)
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function b642buf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode UTF-8 string to Base64 (browser & Node compatible)
 */
export function utf8ToBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    })
  );
}

/**
 * Decode Base64 string to UTF-8 (browser & Node compatible)
 */
export function base64ToUtf8(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString('utf-8');
  }
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), (c: string) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );
}
