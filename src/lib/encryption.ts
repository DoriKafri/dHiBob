/**
 * Field-level AES-256-GCM encryption for PII fields.
 * Key is loaded from FIELD_ENCRYPTION_KEY env var (32-byte hex string).
 * Format: "iv:authTag:ciphertext" (all base64).
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex) throw new Error('FIELD_ENCRYPTION_KEY env var is not set');
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  return buf;
}

export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptField(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
  try {
    const key = getKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) return ciphertext; // not encrypted, return as-is
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return ciphertext; // decryption failed — likely unencrypted legacy data
  }
}

/** Fields that should be encrypted before storage */
export const ENCRYPTED_FIELDS = ['nationalId', 'passportNumber', 'bankAccount'];

/** Encrypt specific fields in a personalInfo object */
export function encryptPersonalInfo(data: Record<string, any>): Record<string, any> {
  if (!process.env.FIELD_ENCRYPTION_KEY) return data; // graceful skip if no key
  const result = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = encryptField(result[field]);
    }
  }
  return result;
}

/** Decrypt specific fields in a personalInfo object */
export function decryptPersonalInfo(data: Record<string, any>): Record<string, any> {
  if (!process.env.FIELD_ENCRYPTION_KEY) return data; // graceful skip if no key
  const result = { ...data };
  for (const field of ENCRYPTED_FIELDS) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = decryptField(result[field]);
    }
  }
  return result;
}
