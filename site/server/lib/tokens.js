import crypto from 'node:crypto'

export function createManageToken() {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, digest: digestToken(token) }
}

export function digestToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

export function matchesManageToken(token, digest) {
  const actual = Buffer.from(digestToken(token), 'hex')
  const expected = Buffer.from(String(digest || ''), 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
