// -----------------------------------------------------------------------------
// End-to-end encryption of the Pushbullet ephemerals (mirrored notifications).
//
// When the user turned on end-to-end encryption in the Pushbullet apps, the
// stream carries `{ encrypted: true, ciphertext }` instead of the
// notification. The key is derived from the password the user typed in every
// app (https://docs.pushbullet.com, "End-to-End Encryption"):
//   PBKDF2-HMAC-SHA256(password, salt = user iden, 30 000 iterations, 256 bits)
// and the message is AES-256-GCM, encoded as
//   base64("1" + tag (16 bytes) + iv (12 bytes) + ciphertext).
// Only decryption is needed: the integration never sends ephemerals.
// -----------------------------------------------------------------------------

import { pbkdf2Sync, createDecipheriv } from 'node:crypto';

const ITERATIONS = 30_000;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const IV_BYTES = 12;

/**
 * @description Derive the encryption key of an account.
 * @param {string} password - The encryption password of the Pushbullet apps.
 * @param {string} userIden - The iden of the user (the salt).
 * @returns {Buffer} The 256-bit key.
 * @example
 * deriveKey('hunter2', 'up0snaKOsn');
 */
function deriveKey(password, userIden) {
  return pbkdf2Sync(String(password), String(userIden), ITERATIONS, KEY_BYTES, 'sha256');
}

/**
 * @description Decrypt an encrypted ephemeral into its text.
 * @param {Buffer} key - deriveKey.
 * @param {string} ciphertext - The base64 `ciphertext` of the stream.
 * @returns {string} The decrypted text.
 * @throws {Error} When the version or the tag is wrong (wrong password).
 * @example
 * decryptText(key, 'MSfJxxY5YdjttlfUkCaKA57qU9SuCN8+ZhYg/xieI+lDnQ=='); // -> 'meow!'
 */
function decryptText(key, ciphertext) {
  const encoded = Buffer.from(String(ciphertext), 'base64');
  if (encoded.length < 1 + TAG_BYTES + IV_BYTES || encoded.subarray(0, 1).toString() !== '1') {
    throw new Error('Unknown encryption format');
  }
  const tag = encoded.subarray(1, 1 + TAG_BYTES);
  const iv = encoded.subarray(1 + TAG_BYTES, 1 + TAG_BYTES + IV_BYTES);
  const data = encoded.subarray(1 + TAG_BYTES + IV_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * @description Decrypt an encrypted ephemeral into its object.
 * @param {Buffer} key - deriveKey.
 * @param {string} ciphertext - The base64 `ciphertext` of the stream.
 * @returns {object} The decrypted push object.
 */
function decrypt(key, ciphertext) {
  const value = JSON.parse(decryptText(key, ciphertext));
  if (!value || typeof value !== 'object') {
    throw new Error('The decrypted message is not an object');
  }
  return value;
}

export { deriveKey, decrypt, decryptText };
