// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { createSiteServer } from '../server/index.js'
import { createCommunityDb } from '../server/db/index.js'
import { createAuthService } from '../server/services/auth.js'

const disposables = []
afterEach(async () => { for (const dispose of disposables.splice(0).reverse()) await dispose() })

async function setup() {
  const handle = createCommunityDb(':memory:')
  disposables.push(() => handle.close())
  const mail = []
  const baseUrl = 'http://localhost:5173'
  const auth = createAuthService(handle.db, { baseUrl, sendMail: async message => mail.push(message) })
  const server = createSiteServer({ db: handle.db, auth })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  disposables.push(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const url = `http://127.0.0.1:${server.address().port}`
  const request = (path, options = {}) => fetch(url + path, options)
  return { request, baseUrl, mail }
}

test('anonymous requests cannot read private history and auth responses are not cached', async () => {
  const { request } = await setup()
  const response = await request('/api/account/handouts')
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toContain('no-store')
  const session = await request('/api/auth/session')
  expect(session.status).toBe(200)
  expect(session.headers.get('cache-control')).toContain('no-store')
  expect((await session.json()).user).toBeNull()
})

test('registration cannot be forged from another origin', async () => {
  const { request } = await setup()
  const response = await request('/api/auth/register', {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'testing-123456' }),
  })
  expect(response.status).toBe(403)
})

test('JSON request size limit is enforced before account input is processed', async () => {
  const { request } = await setup()
  const response = await request('/api/account/handouts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(2 * 1024 * 1024) }),
  })
  expect(response.status).toBe(413)
})

test('two independent devices share account history while stale writes and other accounts are rejected', async () => {
  const { request, baseUrl, mail } = await setup()
  function device() {
    let cookie = '', csrf = '', accountId = ''
    return async (path, method = 'GET', value, expectedAccount) => {
      const response = await request(path, {
        method, headers: { Cookie: cookie, Origin: baseUrl, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'X-Account-ID': expectedAccount ?? accountId },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      })
      const set = response.headers.getSetCookie()
      if (set.length) {
        const jar = new Map(cookie.split('; ').filter(Boolean).map(part => part.split('=')))
        for (const item of set) { const [key, token] = item.split(';')[0].split('='); jar.set(key, token) }
        cookie = [...jar].map(pair => pair.join('=')).join('; ')
      }
      const data = response.status === 204 ? {} : await response.json()
      if (data.csrfToken) csrf = data.csrfToken
      if (data.user) accountId = data.user.id
      return { status: response.status, data }
    }
  }
  const desktop = device(), phone = device(), stranger = device()
  async function signup(client, email) {
    expect((await client('/api/auth/session')).status).toBe(200)
    expect((await client('/api/auth/register', 'POST', { email, password: 'Test-password-123!' })).status).toBeLessThan(300)
    const token = new URL(mail.at(-1).text.match(/https?:\/\/\S+/)[0]).hash.split('=')[1]
    expect((await client('/api/auth/verify', 'POST', { token })).status).toBe(200)
    expect((await client('/api/auth/login', 'POST', { email, password: 'Test-password-123!' })).status).toBe(200)
  }
  await signup(desktop, 'learner@example.com')
  await phone('/api/auth/session')
  expect((await phone('/api/auth/login', 'POST', { email: 'learner@example.com', password: 'Test-password-123!' })).status).toBe(200)
  const spec = { schema: 'course-handout/1', meta: { title: '跨设备讲义' }, modules: [] }
  const created = await desktop('/api/account/handouts', 'POST', { spec })
  expect(created.status).toBe(201)
  const id = created.data.id
  const seen = await phone('/api/account/handouts/' + id)
  expect(seen.data.spec.meta.title).toBe('跨设备讲义')
  const saved = await desktop('/api/account/handouts/' + id, 'PATCH', { spec: { ...spec, meta: { title: '电脑修改' } }, version: created.data.version })
  expect(saved.status).toBe(200)
  const stale = await phone('/api/account/handouts/' + id, 'PATCH', { spec, version: seen.data.version })
  expect(stale.status).toBe(409)
  expect(stale.data.server.spec.meta.title).toBe('电脑修改')
  await signup(stranger, 'other@example.com')
  expect((await stranger('/api/account/handouts/' + id)).status).toBe(404)
  expect((await stranger('/api/account/handouts/' + id, 'PATCH', { spec, version: saved.data.version })).status).toBe(404)
  const staleTab = await stranger('/api/account/handouts', 'GET', undefined, 'previous-tab-account')
  expect(staleTab.status).toBe(401)
  expect(staleTab.data.code).toBe('ACCOUNT_CHANGED')
  expect((await stranger('/api/account/handouts', 'POST', { spec }, 'previous-tab-account')).status).toBe(401)
  expect((await stranger('/api/account/shares', 'POST', { spec, confirmPublic: true }, 'previous-tab-account')).status).toBe(401)
  expect((await stranger('/api/account/handouts')).data.items).toHaveLength(0)
  expect((await desktop('/api/community/handouts', 'POST', { spec })).status).toBe(400)
  const largeSpec = { ...spec, preface: 'a'.repeat(600000) }
  const imported = await desktop('/api/account/handouts/import', 'POST', { sourceId: 'large-local-record', spec: largeSpec, revisions: [{ spec: largeSpec }] })
  expect(imported.status).toBe(200)
  expect(imported.data.record.version).toBe(2)
  expect((await phone('/api/account/handouts/' + imported.data.record.id + '/revisions')).data.items).toHaveLength(2)
  expect((await desktop('/api/auth/logout', 'POST', {})).status).toBe(200)
  expect((await desktop('/api/account/handouts')).status).toBe(401)
  expect((await phone('/api/account/handouts/' + id)).status).toBe(200)
})
