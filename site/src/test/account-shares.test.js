// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createCommunityDb } from '../../server/db/index.js'
import { createAccountService } from '../../server/services/account.js'
import { getPublicHandout, hideHandout, publishHandout, updateHandout } from '../../server/services/community.js'
import { handleAccountRoute } from '../../server/routes/account.js'

let handle, service
const spec = (title = '讲义') => ({ schema: 'course-handout/1', meta: { title }, modules: [] })
beforeEach(() => {
  handle = createCommunityDb(':memory:')
  for (const id of ['one', 'two']) handle.db.prepare('INSERT INTO users (id,email,password_hash,display_name,verified_at,created_at) VALUES (?,?,?,?,?,?)').run(id, `${id}@example.com`, 'unused', id, new Date().toISOString(), new Date().toISOString())
  service = createAccountService(handle.db)
})
afterEach(() => handle?.close())

it('keeps an independent public snapshot and only lets its owner edit or withdraw', () => {
  const privateDoc = service.create('one', { spec: spec('私人') })
  const published = service.shares.publish('one', { spec: privateDoc.spec, confirmPublic: true })
  expect(published).not.toHaveProperty('manageToken')
  service.save('one', privateDoc.id, { version: 1, spec: spec('私人更新') })
  expect(getPublicHandout(handle.db, published.id).title).toBe('私人')
  expect(() => service.shares.update('two', published.id, { spec: spec('偷改') })).toThrow('分享不存在')
  expect(() => service.shares.withdraw('two', published.id)).toThrow('分享不存在')
  service.shares.update('one', published.id, { spec: spec('公开更新') })
  expect(getPublicHandout(handle.db, published.id).title).toBe('公开更新')
  service.shares.withdraw('one', published.id)
  expect(getPublicHandout(handle.db, published.id)).toBeNull()
})

it('requires the anonymous token to claim and cannot republish hidden content', () => {
  const anonymous = publishHandout(handle.db, { spec: spec() })
  expect(() => service.shares.claim('one', anonymous.id, 'wrong')).toThrow('无法认领')
  service.shares.claim('one', anonymous.id, anonymous.manageToken)
  expect(service.shares.list('one').items).toHaveLength(1)
  expect(() => service.shares.claim('two', anonymous.id, anonymous.manageToken)).toThrow('无法认领')
  expect(() => updateHandout(handle.db, anonymous.id, anonymous.manageToken, { spec: spec() })).toThrow('无法管理')
  hideHandout(handle.db, anonymous.id)
  expect(() => service.shares.update('one', anonymous.id, { spec: spec() })).toThrow('隐藏')
  expect(getPublicHandout(handle.db, anonymous.id)).toBeNull()
})

function call(method, url, body, session = { user: { id: 'one', verifiedAt: '2026-11-20' } }) {
  let response = {}
  const res = { writeHead(status, headers) { response = { status, headers } }, end(data) { response.body = data ? JSON.parse(data) : null } }
  const handled = handleAccountRoute({ method, url }, res, body, service, session)
  expect(handled).toBe(true)
  return response
}

it('routes use session ownership, no-store responses and safe conflict/error bodies', () => {
  expect(call('GET', '/api/account/handouts', {}, null).status).toBe(401)
  expect(call('GET', '/api/account/handouts', {}, { user: { id: 'one' } }).status).toBe(403)
  const created = call('POST', '/api/account/handouts', { spec: spec(), ownerId: 'two' })
  expect(created.status).toBe(201)
  expect(created.headers['Cache-Control']).toBe('no-store')
  const docId = created.body.id
  expect(call('GET', `/api/account/handouts/${docId}`, {}, { user: { id: 'two', verifiedAt: 'yes' } }).status).toBe(404)
  call('PATCH', `/api/account/handouts/${docId}`, { version: 1, spec: spec('服务器') })
  const conflict = call('PATCH', `/api/account/handouts/${docId}`, { version: 1, spec: spec('设备') })
  expect(conflict.status).toBe(409)
  expect(conflict.body.code).toBe('VERSION_CONFLICT')
  expect(conflict.body.server.spec.meta.title).toBe('服务器')
})
