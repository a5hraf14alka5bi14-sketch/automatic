import crypto from 'crypto'
import { SECRET } from './secret.js'

// Encryption for secrets stored at rest in the `settings` table.
// AES-256-GCM with a key derived from SESSION_SECRET. Values are stored as
// `enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`. Anything without that prefix
// (legacy plaintext rows, or env-provided values) is returned unchanged, so
// reads stay backward compatible.

const PREFIX = 'enc:v1:'

// 32-byte key derived deterministically from the app secret.
const KEY = crypto.createHash('sha256').update(String(SECRET)).digest()

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext
  if (isEncrypted(plaintext)) return plaintext
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
}

export function decryptSecret(value) {
  if (!isEncrypted(value)) return value
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':')
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const data = Buffer.from(dataB64, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key (e.g. SESSION_SECRET rotated) or corrupted value — fail closed.
    return ''
  }
}
