import { createHmac } from 'node:crypto'

// What an authenticator app does (RFC 6238): HMAC-SHA1 of the 30-second step, 6 digits.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(text: string): Buffer {
  let buffer = 0
  let bits = 0
  const out: number[] = []
  for (const char of text.replace(/[\s=]/g, '').toUpperCase()) {
    buffer = (buffer << 5) | ALPHABET.indexOf(char)
    bits += 5
    if (bits >= 8) {
      out.push((buffer >> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** The code for the current 30-second step, or `stepsAhead` steps later. */
export function totp(secret: string, stepsAhead = 0): string {
  const step = Math.floor(Date.now() / 1000 / 30) + stepsAhead
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hash = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hash[hash.length - 1] & 0x0f
  const binary = hash.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 1_000_000).padStart(6, '0')
}
