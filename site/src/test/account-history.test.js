// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createCommunityDb } from '../../server/db/index.js'
import { createAccountService } from '../../server/services/account.js'

let handle, service
const spec = (title = '课程') => ({ schema: 'course-handout/1', meta: { title }, modules: [] })
beforeEach(() => {
  handle = createCommunityDb(':memory:')
  for (const id of ['one', 'two']) handle.db.prepare('INSERT INTO users (id,email,password_hash,display_name,verified_at,created_at) VALUES (?,?,?,?,?,?)').run(id, `${id}@example.com`, 'unused', id, new Date().toISOString(), new Date().toISOString())
  service = createAccountService(handle.db)
})
afterEach(() => handle?.close())

it('isolates records and returns server snapshots for stale versions', () => {
  const doc = service.create('one', { spec: spec() })
  expect(() => service.get('two', doc.id)).toThrow('讲义不存在')
  const next = service.save('one', doc.id, { version: 1, spec: spec('更新') })
  expect(next.version).toBe(2)
  try { service.save('one', doc.id, { version: 1, spec: spec('旧') }); throw Error('accepted') } catch (error) { expect(error.status).toBe(409); expect(error.server.spec.meta.title).toBe('更新') }
})

it('retains 20 revisions and restores a revision as a new version', () => {
  let doc = service.create('one', { spec: spec() })
  for (let i = 0; i < 25; i++) doc = service.save('one', doc.id, { version: doc.version, spec: spec(`v${i}`) })
  const items = service.revisions('one', doc.id).items
  expect(items).toHaveLength(20)
  const restored = service.restoreRevision('one', doc.id, items[19].version, { version: doc.version })
  expect(restored.version).toBe(27)
  expect(restored.spec.meta.title).toBe('v5')
})

it('keeps deletion tombstones, supports restoration, and purges expired trash', () => {
  const doc = service.create('one', { spec: spec() })
  const deleted = service.trash('one', doc.id, { version: 1 })
  expect(() => service.save('one', doc.id, { version: 2, spec: spec() })).toThrow('回收站')
  expect(service.list('one', true).items).toHaveLength(1)
  const restored = service.restore('one', doc.id, { version: deleted.version })
  const trashedAgain = service.trash('one', doc.id, { version: restored.version })
  handle.db.prepare('UPDATE private_handouts SET deleted_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', trashedAgain.id)
  expect(service.purgeExpired()).toBe(1)
  expect(service.list('one', true).items).toHaveLength(0)
})

it('imports once per owner/source and strips private upload and token metadata', () => {
  const input = { sourceId: 'device/local1', spec: { ...spec(), materialText: 'secret', manageToken: 'secret', meta: { title: '课程', referenceText: 'secret' } }, revisions: [{ spec: spec('旧版') }] }
  const a = service.import('one', input), b = service.import('one', input)
  expect(a.imported).toBe(true); expect(b.imported).toBe(false)
  expect(a.record.id).toBe(b.record.id)
  expect(JSON.stringify(a.record)).not.toContain('secret')
  expect(service.revisions('one', a.record.id).items).toHaveLength(2)
  expect(service.import('two', input).record.id).not.toBe(a.record.id)
})

it('enforces the spec size and document count quotas atomically', () => {
  expect(() => service.create('one', { spec: { ...spec(), preface: 'x'.repeat(1024 * 1024) } })).toThrow('1 MiB')
  for (let i = 0; i < 200; i++) service.create('one', { spec: spec() })
  expect(() => service.create('one', { spec: spec() })).toThrow('200')
  expect(service.list('one').quota.count).toBe(200)
})

it('counts revision and trash bytes and rolls back saves beyond total quota', () => {
  const doc = service.create('one', { spec: spec() })
  handle.db.prepare('UPDATE handout_revisions SET spec_json=zeroblob(?) WHERE handout_id=?').run(100 * 1024 * 1024, doc.id)
  expect(() => service.save('one', doc.id, { version: 1, spec: spec('不能写入') })).toThrow('100 MiB')
  expect(service.get('one', doc.id).version).toBe(1)
  service.trash('one', doc.id, { version: 1 })
  expect(service.quota('one').bytes).toBeGreaterThan(100 * 1024 * 1024)
})

it('owner checks protect revisions, exports, deletion and restores', () => {
  const doc = service.create('one', { spec: spec() })
  for (const action of [() => service.save('two', doc.id, { version: 1, spec: spec() }), () => service.trash('two', doc.id, { version: 1 }), () => service.revisions('two', doc.id), () => service.restoreRevision('two', doc.id, 1, { version: 1 }), () => service.restore('two', doc.id, { version: 1 }), () => service.permanentDelete('two', doc.id, { version: 1 })]) expect(action).toThrow('讲义不存在')
  const deleted = service.trash('one', doc.id, { version: 1 })
  service.permanentDelete('one', doc.id, { version: deleted.version })
  expect(handle.db.prepare('SELECT COUNT(*) AS count FROM handout_revisions').get().count).toBe(0)
})

it('preserves full accepted text and synchronizes renamed titles in snapshots and exports', () => {
  const largeBody = 'x'.repeat(1000001)
  const imported = service.import('one', { sourceId: 'renamed', title: '本机重命名', spec: { ...spec('旧名'), modules: [{ title: '模块', chapters: [{ title: '章', sections: [{ title: '节', body: largeBody }] }] }] } }).record
  expect(imported.spec.modules[0].chapters[0].sections[0].body).toHaveLength(1000001)
  expect(imported.spec.meta.title).toBe('本机重命名')
  const updated = service.save('one', imported.id, { version: imported.version, title: '再次重命名', spec: imported.spec })
  expect(updated.title).toBe('再次重命名')
  expect(updated.spec.meta.title).toBe('再次重命名')
  const restored = service.restoreRevision('one', imported.id, 1, { version: updated.version })
  expect(restored.title).toBe(restored.spec.meta.title)
  expect(restored.spec.meta.title).toBe('本机重命名')
})
