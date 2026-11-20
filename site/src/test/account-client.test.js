import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { saveRecovery, listRecovery, clearAccountRecovery } from '../lib/recovery-db.js'
import { portableSpec, authApi, clearCsrf, cloudFor, sharesFor } from '../lib/account-api.js'
import { saveHandout, getHandout, renameHandout, deleteHandout } from '../lib/history-db.js'

const spec = { schema: 'course-handout/1', meta: { title: '测试', __token: 'secret' }, __historyId: 'local-id', materialText: 'private source', manageToken: 'secret', modules: [{ title: '模块', chapters: [{ title: '章', sections: [{ title: '节', body: '正文', material: 'hidden' }], exercises: { basic: ['题'] }, answers: ['答'] }] }] }
describe('account client data boundaries', () => {
  beforeEach(() => { clearCsrf(); vi.unstubAllGlobals() })
  it('exports only portable handout content', () => { const value = portableSpec(spec); expect(value.modules[0].chapters[0].sections[0].body).toBe('正文'); expect(JSON.stringify(value)).not.toMatch(/secret|local-id|private source|hidden/); expect(value.modules[0].chapters[0].answers).toEqual(['答']) })
  it('removes nested reference metadata and non-string glossary entries', () => {
    const value = portableSpec({ ...spec, appendix: { references: [{ title: '课程', url: 'https://example.com', note: '公开', materialText: 'secret', token: 'secret' }], glossary: [['词', '义', 'secret'], ['bad', { token: 'secret' }]], sourceFile: 'secret' } })
    expect(value.appendix.references).toEqual([{ title: '课程', url: 'https://example.com', note: '公开' }]); expect(value.appendix.glossary).toEqual([['词', '义']]); expect(JSON.stringify(value)).not.toContain('secret')
  })
  it('isolates account recovery drafts and removes only the account logging out', async () => {
    await saveRecovery({ owner: 'alice', key: 'a', spec }); await saveRecovery({ owner: 'bob', key: 'b', spec })
    expect((await listRecovery('alice')).map((r) => r.key)).toEqual(['a'])
    await clearAccountRecovery('alice'); expect(await listRecovery('alice')).toEqual([]); expect((await listRecovery('bob')).length).toBe(1); await clearAccountRecovery('bob')
  })
  it('awaits committed local writes and renames the actual document too', async () => {
    await saveHandout({ id: 'local', title: '旧标题', spec, updatedAt: new Date().toISOString() }); await renameHandout('local', '新标题')
    expect((await getHandout('local')).spec.meta.title).toBe('新标题'); await deleteHandout('local'); expect(await getHandout('local')).toBe(null)
  })
  it('seeds CSRF for registration and propagates unavailable email configuration', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options) => { calls.push([url, options]); return url.endsWith('/session') ? new Response(JSON.stringify({ user: null, csrfToken: 'csrf' })) : new Response(JSON.stringify({ error: '邮件服务尚未配置。' }), { status: 503 }) }))
    await expect(authApi.register({ email: 'test@example.com', password: 'long-password' })).rejects.toThrow('邮件服务尚未配置。')
    expect(calls[1][1].headers['X-CSRF-Token']).toBe('csrf'); expect(calls[1][1].credentials).toBe('same-origin')
  })
  it('binds all account requests to captured owner even when another tab changes the session', async () => {
    const calls = []; const alice = cloudFor('alice'), aliceShares = sharesFor('alice')
    vi.stubGlobal('fetch', vi.fn(async (url, options) => { calls.push([url, options]); return new Response(JSON.stringify(url.endsWith('/session') ? { user: { id: 'bob' }, csrfToken: 'bob-csrf' } : { items: [] })) }))
    await authApi.session(); await alice.list(); await alice.import('local', portableSpec(spec), '测试'); await aliceShares.publish({ spec: portableSpec(spec) })
    expect(calls.slice(1).every(([, options]) => options.headers['X-Account-ID'] === 'alice')).toBe(true)
    await expect(cloudFor().list()).rejects.toThrow('账号已改变')
  })
})
