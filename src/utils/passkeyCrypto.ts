/**
 * Pure WebAuthn PRF (Pseudo-Random Function) Passkey Crypto Utilities.
 *
 * Designed as a fast local unlock alternative for PersonaKiln.
 * The master passphrase remains the sole root of trust.
 * Passkey enrollment wraps the in-memory master key with a key derived from
 * WebAuthn PRF output via HKDF-SHA256.
 */

import { buf2b64, b642buf, buf2hex, hex2buf } from './binaryEncoding';

// Internal hand-off value used only between the setup dialog and the profile-save flow.
export const PASSKEY_ONLY_SETUP_SENTINEL = '__PERSONAKILN_PASSKEY_ONLY_SETUP__';

export { buf2b64, b642buf, buf2hex, hex2buf };

export interface PasskeyEnrollmentResult {
  credentialIdB64: string;
  wrappedKeyHex: string;
  prfSaltHex: string;
}

/**
 * Feature detect WebAuthn and PublicKeyCredential support in the current environment.
 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  );
}

/**
 * Derives an AES-GCM wrapping key from WebAuthn PRF output using HKDF-SHA256.
 */
async function deriveWrappingKeyFromPrf(prfOutput: BufferSource | ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const prfBytes = prfOutput instanceof Uint8Array
    ? prfOutput
    : ArrayBuffer.isView(prfOutput)
    ? new Uint8Array(prfOutput.buffer, prfOutput.byteOffset, prfOutput.byteLength)
    : new Uint8Array(prfOutput);
  const hkdfBaseKey = await crypto.subtle.importKey(
    'raw',
    prfBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  const enc = new TextEncoder();
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0), // empty salt
      // FROZEN: 'RoleplayForge-Passkey-Wrap-v1' must stay exactly — changing it would make existing passkey-wrapped keys undecryptable.
      info: enc.encode('RoleplayForge-Passkey-Wrap-v1'),
    },
    hkdfBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Enroll a new passkey credential and wrap the provided master key bytes.
 * Returns null if PRF extension is not supported by the authenticator or user cancels.
 */
export async function enrollPasskey(
  rawMasterKeyBytes: Uint8Array
): Promise<PasskeyEnrollmentResult | null> {
  if (!isPasskeySupported()) return null;

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const creationOptions: CredentialCreationOptions = {
      publicKey: {
        challenge,
        rp: {
          name: 'PersonaKiln',
          id: typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : undefined,
        },
        user: {
          id: userId,
          name: 'personakiln_user',
          displayName: 'PersonaKiln User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        timeout: 60000,
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        extensions: {
          // Request PRF extension support
          prf: {},
        } as unknown as AuthenticationExtensionsClientInputs,
      },
    };

    const credential = (await navigator.credentials.create(creationOptions)) as
      | (PublicKeyCredential & {
          getClientExtensionResults?: () => { prf?: { enabled?: boolean } };
        })
      | null;

    if (!credential || !credential.rawId) {
      return null;
    }

    const clientExts =
      typeof credential.getClientExtensionResults === 'function'
        ? credential.getClientExtensionResults()
        : {};

    if (!clientExts?.prf?.enabled) {
      return null;
    }

    // Immediately follow with credentials.get to retrieve actual PRF evaluation bytes
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [
          {
            id: credential.rawId,
            type: 'public-key',
          },
        ],
        timeout: 60000,
        userVerification: 'preferred',
        extensions: {
          prf: {
            eval: {
              first: prfSalt,
            },
          },
        } as unknown as AuthenticationExtensionsClientInputs,
      },
    };

    const assertion = (await navigator.credentials.get(getOptions)) as
      | (PublicKeyCredential & {
          getClientExtensionResults?: () => {
            prf?: { results?: { first?: ArrayBuffer } };
          };
        })
      | null;

    if (!assertion) return null;

    const assertionExts =
      typeof assertion.getClientExtensionResults === 'function'
        ? assertion.getClientExtensionResults()
        : {};

    const prfOutput = assertionExts?.prf?.results?.first;
    if (!prfOutput) {
      return null;
    }

    // Derive wrapping key & encrypt master key bytes
    const wrappingKey = await deriveWrappingKeyFromPrf(prfOutput);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      rawMasterKeyBytes
    );

    const wrappedKeyBytes = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    wrappedKeyBytes.set(iv, 0);
    wrappedKeyBytes.set(new Uint8Array(ciphertext), iv.byteLength);

    return {
      credentialIdB64: buf2b64(credential.rawId),
      wrappedKeyHex: buf2hex(wrappedKeyBytes),
      prfSaltHex: buf2hex(prfSalt),
    };
  } catch (_err) {
    return null;
  }
}

/**
 * Unlock session with an enrolled passkey.
 * Returns raw master key bytes on success, or null on cancellation / failure without throwing.
 */
export async function unlockWithPasskey(
  credentialIdB64: string,
  prfSaltHex: string,
  wrappedKeyHex: string
): Promise<Uint8Array | null> {
  if (!isPasskeySupported()) return null;

  try {
    const credId = b642buf(credentialIdB64);
    const prfSalt = hex2buf(prfSaltHex);
    const wrappedKeyBytes = hex2buf(wrappedKeyHex);

    // Must have at least 12-byte IV + 16-byte AES-GCM auth tag
    if (wrappedKeyBytes.length < 28) {
      return null;
    }

    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [
          {
            id: credId,
            type: 'public-key',
          },
        ],
        timeout: 60000,
        userVerification: 'preferred',
        extensions: {
          prf: {
            eval: {
              first: prfSalt,
            },
          },
        } as unknown as AuthenticationExtensionsClientInputs,
      },
    };

    const assertion = (await navigator.credentials.get(getOptions)) as
      | (PublicKeyCredential & {
          getClientExtensionResults?: () => {
            prf?: { results?: { first?: ArrayBuffer } };
          };
        })
      | null;

    if (!assertion) return null;

    const assertionExts =
      typeof assertion.getClientExtensionResults === 'function'
        ? assertion.getClientExtensionResults()
        : {};

    const prfOutput = assertionExts?.prf?.results?.first;
    if (!prfOutput) {
      return null;
    }

    const wrappingKey = await deriveWrappingKeyFromPrf(prfOutput);
    const iv = wrappedKeyBytes.slice(0, 12);
    const ciphertext = wrappedKeyBytes.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      ciphertext
    );

    return new Uint8Array(decrypted);
  } catch (_err) {
    return null;
  }
}
