// @vitest-environment node
import { afterEach, describe, expect, test } from 'vitest'
import { createCommunityDb } from '../server/db/index.js'
import { createAuthService } from '../server/services/auth.js'
import { createMailSender } from '../server/services/mail.js'
import { handleAuthRoute } from '../server/routes/auth.js'

const handles = []
afterEach(() => { for (const handle of handles.splice(0)) handle.close() })
function setup() {
  const handle = createCommunityDb(':memory:'); handles.push(handle)
  const letters = []; let time = Date.now()
  const auth = createAuthService(handle.db, { sendMail: async (mail) => letters.push(mail), baseUrl: 'http://localhost:4173', now: () => time })
  return { db: handle.db, auth, letters, advance: (ms) => { time += ms } }
}
const password = 'Good password 123!'
const token = (letter) => new URL(letter.text.match(/https?:\/\/\S+/)[0]).hash.split('=')[1]
const reqFor = (cookie) => ({ headers: { cookie, origin: 'http://localhost:4173', 'content-type': 'application/json' } })
async function verified(context, email = 'person@example.com') {
  await context.auth.register({ email, password, displayName: '学习者' })
  await context.auth.verify({ token: token(context.letters.at(-1)) })
}

describe('authentication lifecycle', () => {
  test('verification uses credentials from that registration and invalidates competing registration links', async () => {
    const ctx = setup(); const attackerPassword = 'Attacker initial password!'
    await ctx.auth.register({ email: 'person@example.com', password: attackerPassword, displayName: 'attacker' })
    const attackerToken = token(ctx.letters.at(-1))
    await ctx.auth.register({ email: 'person@example.com', password, displayName: '邮箱所有者' })
    const ownerToken = token(ctx.letters.at(-1))
    await ctx.auth.verify({ token: ownerToken })
    const signed = await ctx.auth.login({ email: 'person@example.com', password })
    expect(signed.user.displayName).toBe('邮箱所有者')
    await expect(ctx.auth.login({ email: 'person@example.com', password: attackerPassword })).rejects.toMatchObject({ status: 401 })
    await expect(ctx.auth.verify({ token: attackerToken })).rejects.toMatchObject({ status: 400 })
  })

  test('later unverified registration cannot replace credentials attached to an earlier owner verification link', async () => {
    const ctx = setup()
    await ctx.auth.register({ email: 'person@example.com', password })
    const ownerToken = token(ctx.letters.at(-1))
    await ctx.auth.register({ email: 'person@example.com', password: 'Attacker later password!' })
    const competingToken = token(ctx.letters.at(-1))
    await ctx.auth.verify({ token: ownerToken })
    expect((await ctx.auth.login({ email: 'person@example.com', password })).user.email).toBe('person@example.com')
    await expect(ctx.auth.verify({ token: competingToken })).rejects.toMatchObject({ status: 400 })
    await expect(ctx.auth.login({ email: 'person@example.com', password: 'Attacker later password!' })).rejects.toMatchObject({ status: 401 })
  })

  test('requires email verification, hashes password, supports separate device sessions and logout', async () => {
    const ctx = setup()
    await ctx.auth.register({ email: 'Person@EXAMPLE.COM', password, displayName: '学习者' })
    const stored = ctx.db.prepare('SELECT * FROM users').get()
    expect(stored.email).toBe('person@example.com')
    expect(stored.password_hash).toMatch(/^\$argon2id\$/)
    expect(stored.password_hash).not.toContain(password)
    await expect(ctx.auth.login({ email: 'person@example.com', password })).rejects.toMatchObject({ status: 401 })
    const verificationToken = token(ctx.letters[0])
    await ctx.auth.verify({ token: verificationToken })
    await expect(ctx.auth.verify({ token: verificationToken })).rejects.toMatchObject({ status: 400 })
    const first = await ctx.auth.login({ email: 'person@example.com', password })
    const second = await ctx.auth.login({ email: 'person@example.com', password })
    expect(first.cookie).not.toBe(second.cookie)
    expect(first.cookie).toContain('HttpOnly')
    const request = reqFor(first.cookie)
    expect(ctx.auth.getSession(request).user.id).toBe(stored.id)
    ctx.auth.logout(request)
    expect(ctx.auth.getSession(request)).toBeNull()
    expect(ctx.auth.getSession(reqFor(second.cookie))).not.toBeNull()
  })

  test('reset tokens expire, are single use, revoke every prior session and replace password', async () => {
    const ctx = setup(); await verified(ctx)
    const oldSession = await ctx.auth.login({ email: 'person@example.com', password })
    await ctx.auth.requestReset({ email: 'person@example.com' })
    const expiredToken = token(ctx.letters.at(-1)); ctx.advance(31 * 60 * 1000)
    await expect(ctx.auth.reset({ token: expiredToken, password: 'Another password 456!' })).rejects.toMatchObject({ status: 400 })
    await ctx.auth.requestReset({ email: 'person@example.com' })
    const resetToken = token(ctx.letters.at(-1))
    await ctx.auth.reset({ token: resetToken, password: 'Another password 456!' })
    expect(ctx.auth.getSession(reqFor(oldSession.cookie))).toBeNull()
    await expect(ctx.auth.reset({ token: resetToken, password })).rejects.toMatchObject({ status: 400 })
    await expect(ctx.auth.login({ email: 'person@example.com', password })).rejects.toMatchObject({ status: 401 })
    expect((await ctx.auth.login({ email: 'person@example.com', password: 'Another password 456!' })).user.email).toBe('person@example.com')
  })

  test('does not reveal known email on registration/reset and cannot replace an existing password', async () => {
    const ctx = setup(); await verified(ctx)
    const result = await ctx.auth.register({ email: 'person@example.com', password: 'Different password 456!' })
    const unknown = await ctx.auth.register({ email: 'unknown@example.com', password })
    expect(result).toEqual(unknown)
    expect(await ctx.auth.requestReset({ email: 'person@example.com' })).toEqual(await ctx.auth.requestReset({ email: 'absent@example.com' }))
    expect((await ctx.auth.login({ email: 'person@example.com', password })).user.email).toBe('person@example.com')
  })

  test('validates CSRF, origin and content type for guest and authenticated requests', async () => {
    const ctx = setup(); const guest = ctx.auth.guestCsrf()
    const req = reqFor(guest.cookie)
    req.headers['x-csrf-token'] = guest.csrfToken
    expect(() => ctx.auth.assertCsrf(req, null)).not.toThrow()
    expect(() => ctx.auth.assertCsrf({ headers: { ...req.headers, origin: 'https://evil.example' } }, null)).toThrow()
    expect(() => ctx.auth.assertCsrf({ headers: { ...req.headers, 'x-csrf-token': 'wrong' } }, null)).toThrow()
    expect(() => ctx.auth.assertCsrf({ headers: { ...req.headers, 'content-type': 'text/plain' } }, null)).toThrow()
    await verified(ctx); const login = await ctx.auth.login({ email: 'person@example.com', password })
    const signed = reqFor(login.cookie); signed.headers['x-csrf-token'] = login.csrfToken
    expect(() => ctx.auth.assertCsrf(signed, ctx.auth.getSession(signed))).not.toThrow()
    ctx.advance(31 * 24 * 60 * 60 * 1000)
    expect(ctx.auth.getSession(signed)).toBeNull()
  })

  test('mail configuration failure leaves no account and returns actionable service error', async () => {
    const handle = createCommunityDb(':memory:'); handles.push(handle)
    const auth = createAuthService(handle.db, { sendMail: createMailSender({}), baseUrl: 'http://localhost:4173' })
    await expect(auth.register({ email: 'person@example.com', password })).rejects.toMatchObject({ status: 503 })
    expect(handle.db.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(0)
    await expect(auth.requestReset({ email: 'absent@example.com' })).rejects.toMatchObject({ status: 503 })
  })

  test('expired verification cannot enable login and session cookies are secure on HTTPS', async () => {
    const ctx = setup()
    await ctx.auth.register({ email: 'person@example.com', password })
    const old = token(ctx.letters.at(-1)); ctx.advance(31 * 60 * 1000)
    await expect(ctx.auth.verify({ token: old })).rejects.toMatchObject({ status: 400 })
    await expect(ctx.auth.login({ email: 'person@example.com', password })).rejects.toMatchObject({ status: 401 })
    await verified(ctx)
    const httpsAuth = createAuthService(ctx.db, { baseUrl: 'https://learn.example', sendMail: async () => {} })
    expect((await httpsAuth.login({ email: 'person@example.com', password })).cookie).toContain('; Secure')
  })

  test('rate limits account attempts and permits requests after the window', () => {
    const ctx = setup()
    ctx.auth.rateLimit('key', 2, 1000); ctx.auth.rateLimit('key', 2, 1000)
    expect(() => ctx.auth.rateLimit('key', 2, 1000)).toThrow('尝试过于频繁')
    ctx.advance(1001)
    expect(() => ctx.auth.rateLimit('key', 2, 1000)).not.toThrow()
  })

  test('auth routes return explicit handled status, no-store CSRF response and reject cross-origin registration', async () => {
    const ctx = setup()
    const response = () => ({ status: 0, headers: {}, body: '', writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = JSON.parse(body) } })
    const guest = response()
    expect(await handleAuthRoute({ method: 'GET', url: '/api/auth/session', headers: {} }, guest, {}, ctx.auth)).toBe(true)
    expect(guest.headers['Cache-Control']).toBe('no-store')
    expect(guest.body).toMatchObject({ user: null, csrfToken: expect.any(String) })
    expect(guest.body).not.toHaveProperty('cookie')
    const rejected = response()
    await handleAuthRoute({ method: 'POST', url: '/api/auth/register', headers: { origin: 'https://evil.example' } }, rejected, { email: 'person@example.com', password }, ctx.auth)
    expect(rejected.status).toBe(403)
    expect(ctx.db.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(0)
    expect(await handleAuthRoute({ url: '/api/templates' }, response(), {}, ctx.auth)).toBe(false)
  })
})
