import { buf2hex, hex2buf } from './binaryEncoding';

export { buf2hex, hex2buf };

export async function generateSalt(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = 600000
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable for hashing
    ['encrypt', 'decrypt']
  );
}

export async function hashKey(key: CryptoKey): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', key);
  
  // Use HMAC instead of plain SHA-256 hash of the raw key to prevent key-recovery 
  // if the hash is leaked along with the ciphertext.
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const enc = new TextEncoder();
  // FROZEN: 'RoleplayForgeVerifier' must stay exactly — it is the verifier label for existing passphrase vaults.
  const signatureBuffer = await crypto.subtle.sign('HMAC', hmacKey, enc.encode('RoleplayForgeVerifier'));
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(text)
  );

  const ivHex = Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join('');
  const ctHex = Array.from(new Uint8Array(ciphertext)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return `enc.v1.${ivHex}.${ctHex}`;
}

export async function decryptText(encryptedText: string, key: CryptoKey): Promise<string> {
  if (!encryptedText.startsWith('enc.v1.')) {
    throw new Error('Invalid encryption format');
  }

  const parts = encryptedText.split('.');
  if (parts.length !== 4) throw new Error('Invalid encryption parts');

  const ivHex = parts[2];
  const ctHex = parts[3];

  if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(ctHex)) {
    throw new TypeError('Malformed encryption hex strings');
  }

  const ivMatch = ivHex.match(/.{1,2}/g);
  const ctMatch = ctHex.match(/.{1,2}/g);

  if (!ivMatch || !ctMatch) {
    throw new TypeError('Malformed encryption hex strings length');
  }

  const iv = new Uint8Array(ivMatch.map((byte) => parseInt(byte, 16)));
  const ct = new Uint8Array(ctMatch.map((byte) => parseInt(byte, 16)));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}
