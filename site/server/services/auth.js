import crypto from 'node:crypto'
import argon2 from 'argon2'
import { createMailSender } from './mail.js'

const SESSION_AGE = 30 * 24 * 60 * 60 * 1000
const TOKEN_AGE = 30 * 60 * 1000
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }
const genericMail = { ok: true, message: '如果邮箱可用于此操作，验证邮件将发送到该邮箱，请检查收件箱。' }
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')
const randomToken = () => crypto.randomBytes(32).toString('base64url')
const failure = (status, message) => Object.assign(new Error(message), { status })
const tokenPattern = /^[A-Za-z0-9_-]{43}$/
let dummyHash

function normalizedEmail(value) {
  if (typeof value !== 'string') throw failure(400, '请输入有效邮箱。')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure(400, '请输入有效邮箱。')
  return email
}
function validPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw failure(400, '密码长度应为 12–128 个字符。')
  return value
}
function readCookies(req) {
  const result = {}
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const index = part.indexOf('='); if (index < 0) continue
    const key = part.slice(0, index).trim()
    if (Object.hasOwn(result, key)) { result[key] = ''; continue }
    result[key] = part.slice(index + 1).trim()
  }
  return result
}
function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || !left || !right) return false
  const a = Buffer.from(left); const b = Buffer.from(right)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, verifiedAt: row.verified_at }
}

export function createAuthService(db, { sendMail = createMailSender(), baseUrl = process.env.BASE_URL || 'http://localhost:5173', now = Date.now } = {}) {
  const base = new URL(baseUrl)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('BASE_URL 必须为有效网站地址。')
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') throw new Error('生产环境 BASE_URL 必须使用 HTTPS。')
  const secure = base.protocol === 'https:'
  const iso = () => new Date(now()).toISOString()
  const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`
  const clearSessionCookie = () => cookie('ch_session', '', 0)
  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE')
    try { const value = callback(); db.exec('COMMIT'); return value } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  function addToken(userId, purpose, credentials = {}) {
    const token = randomToken(); const id = crypto.randomUUID()
    db.prepare('INSERT INTO auth_tokens(id,user_id,token_digest,purpose,expires_at,created_at,pending_password_hash,pending_display_name) VALUES (?,?,?,?,?,?,?,?)').run(id, userId, digest(token), purpose, new Date(now() + TOKEN_AGE).toISOString(), iso(), credentials.passwordHash || null, credentials.displayName ?? null)
    return { id, token }
  }
  async function sendToken(email, token, purpose) {
    const link = new URL('/', base); link.hash = `${purpose}=${token}`
    try { await sendMail({ to: email, subject: purpose === 'verify' ? '验证课程讲义工坊邮箱' : '重置课程讲义工坊密码', text: `请打开以下链接完成操作。链接 30 分钟内有效，只能使用一次。\n${link.href}\n如果不是你发起的请求，请忽略此邮件。` }) }
    catch { throw failure(503, '邮件发送失败，请联系管理员检查邮件服务配置，稍后重试。') }
  }
  function findToken(token, purpose) {
    if (typeof token !== 'string' || !tokenPattern.test(token)) throw failure(400, '链接无效、已使用或已过期。')
    const row = db.prepare('SELECT * FROM auth_tokens WHERE token_digest=? AND purpose=? AND used_at IS NULL AND expires_at > ?').get(digest(token), purpose, iso())
    if (!row) throw failure(400, '链接无效、已使用或已过期。')
    return row
  }
  function getSession(req) {
    const token = readCookies(req).ch_session
    if (!tokenPattern.test(token || '')) return null
    const row = db.prepare('SELECT s.id AS session_id,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_digest=? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.verified_at IS NOT NULL').get(digest(token), iso())
    return row ? { user: publicUser(row), csrfToken: digest(`csrf:${token}`), sessionId: row.session_id } : null
  }
  function assertCsrf(req, session = getSession(req)) {
    if (req.headers?.origin !== base.origin) throw failure(403, '请求来源无效，请刷新页面后重试。')
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')) throw failure(415, '请求必须使用 application/json。')
    const expected = session?.csrfToken || readCookies(req).ch_csrf
    if (!equalSecret(req.headers?.['x-csrf-token'], expected) || !expected || expected.length < 40) throw failure(403, '安全凭据已失效，请刷新页面后重试。')
  }
  const attempts = new Map()
  function rateLimit(key, max = 10, windowMs = 15 * 60 * 1000) {
    const time = now()
    for (const [entry, bucket] of attempts) if (bucket.until <= time) attempts.delete(entry)
    let bucket = attempts.get(key)
    if (!bucket) { bucket = { count: 0, until: time + windowMs }; attempts.set(key, bucket) }
    if (bucket.count >= max) throw failure(429, '尝试过于频繁，请稍后再试。')
    bucket.count++
  }
  async function register({ email: value, password, displayName = '' }) {
    const email = normalizedEmail(value); validPassword(password)
    if (typeof displayName !== 'string' || displayName.trim().length > 60) throw failure(400, '展示名称最多 60 个字符。')
    sendMail.assertReady?.()
    // Hash even for existing addresses so the response cost does not trivially reveal registration.
    const passwordHash = await argon2.hash(password, HASH_OPTIONS)
    const existing = db.prepare('SELECT * FROM users WHERE email=?').get(email)
    if (existing?.verified_at) return { ...genericMail }
    let userId = existing?.id; let created = false
    if (!userId) {
      userId = crypto.randomUUID()
      const inserted = db.prepare('INSERT OR IGNORE INTO users(id,email,password_hash,display_name,created_at) VALUES (?,?,?,?,?)').run(userId, email, passwordHash, displayName.trim(), iso())
      if (!inserted.changes) return { ...genericMail }
      created = true
    }
    const token = addToken(userId, 'verify', { passwordHash, displayName: displayName.trim() })
    try { await sendToken(email, token.token, 'verify') }
    catch (error) {
      db.prepare('DELETE FROM auth_tokens WHERE id=?').run(token.id)
      if (created) db.prepare('DELETE FROM users WHERE id=? AND verified_at IS NULL').run(userId)
      throw error
    }
    return { ...genericMail }
  }
  async function verify({ token }) {
    transaction(() => {
      const row = findToken(token, 'verify')
      if (!row.pending_password_hash) throw failure(400, '链接无效，请重新注册以获取验证邮件。')
      // Activating the credentials tied to this specific email prevents an earlier
      // unverified registration from retaining an attacker's password.
      const updated = db.prepare('UPDATE users SET verified_at=?,password_hash=?,display_name=? WHERE id=? AND verified_at IS NULL').run(iso(), row.pending_password_hash, row.pending_display_name || '', row.user_id)
      if (!updated.changes) throw failure(400, '链接无效、已使用或已过期。')
      db.prepare("UPDATE auth_tokens SET used_at=? WHERE user_id=? AND purpose='verify' AND used_at IS NULL").run(iso(), row.user_id)
    })
    return { ok: true, message: '邮箱验证成功，请登录。' }
  }
  async function login({ email: value, password }, req) {
    let email
    try { email = normalizedEmail(value); validPassword(password) } catch { throw failure(401, '邮箱、密码或验证状态不正确。') }
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email)
    dummyHash ||= argon2.hash(randomToken(), HASH_OPTIONS)
    const hash = row?.password_hash || await dummyHash
    const matches = await argon2.verify(hash, password).catch(() => false)
    if (!matches || !row?.verified_at) throw failure(401, '邮箱、密码或验证状态不正确。')
    // Recheck after asynchronous hashing: a concurrent password reset must invalidate this login attempt.
    const fresh = db.prepare('SELECT * FROM users WHERE id=? AND password_hash=?').get(row.id, row.password_hash)
    if (!fresh) throw failure(401, '邮箱、密码或验证状态不正确。')
    const token = randomToken(); const sessionId = crypto.randomUUID()
    transaction(() => {
      if (req) logout(req)
      db.prepare('INSERT INTO sessions(id,token_digest,user_id,expires_at,created_at) VALUES (?,?,?,?,?)').run(sessionId, digest(token), row.id, new Date(now() + SESSION_AGE).toISOString(), iso())
    })
    return { user: publicUser(fresh), csrfToken: digest(`csrf:${token}`), cookie: cookie('ch_session', token, SESSION_AGE / 1000) }
  }
  function logout(req) {
    const token = readCookies(req).ch_session
    if (tokenPattern.test(token || '')) db.prepare('UPDATE sessions SET revoked_at=? WHERE token_digest=? AND revoked_at IS NULL').run(iso(), digest(token))
    return { ok: true, cookie: clearSessionCookie() }
  }
  async function requestReset({ email: value }) {
    const email = normalizedEmail(value); sendMail.assertReady?.()
    const row = db.prepare('SELECT * FROM users WHERE email=? AND verified_at IS NOT NULL').get(email)
    if (row) {
      const token = addToken(row.id, 'reset')
      try { await sendToken(email, token.token, 'reset') } catch (error) { db.prepare('DELETE FROM auth_tokens WHERE id=?').run(token.id); throw error }
    }
    return { ...genericMail }
  }
  async function reset({ token, password }) {
    validPassword(password); findToken(token, 'reset')
    const hash = await argon2.hash(password, HASH_OPTIONS)
    transaction(() => {
      const row = findToken(token, 'reset')
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.user_id)
      db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(iso(), row.user_id)
      db.prepare("UPDATE auth_tokens SET used_at=? WHERE user_id=? AND purpose='reset' AND used_at IS NULL").run(iso(), row.user_id)
    })
    return { ok: true, message: '密码已重置，请重新登录。', cookie: clearSessionCookie() }
  }
  function guestCsrf() {
    const csrfToken = randomToken()
    return { csrfToken, cookie: cookie('ch_csrf', csrfToken, 3600) }
  }
  return { register, verify, login, logout, requestReset, reset, getSession, assertCsrf, guestCsrf, rateLimit }
}
