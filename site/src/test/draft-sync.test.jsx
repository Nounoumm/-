import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useDraft } from '../lib/use-draft.js'
import { authApi, cloudFor } from '../lib/account-api.js'
import { listRecovery, clearAccountRecovery } from '../lib/recovery-db.js'
import 'fake-indexeddb/auto'
vi.mock('../lib/account-api.js', async (original) => ({ ...await original(), authApi: { session: vi.fn() }, cloudFor: vi.fn() }))
const spec = { schema: 'course-handout/1', meta: { title: '课程' }, modules: [{ title: '模块', chapters: [{ title: '章节', sections: [{ title: '节', body: '最初正文' }] }] }] }
afterEach(async () => { cleanup(); vi.clearAllMocks(); await clearAccountRecovery('alice'); await clearAccountRecovery('bob') })
describe('cloud draft isolation and recovery', () => {
  it('marks expired sessions as reauth-required and retries retained edits after same-account login', async () => {
    authApi.session.mockResolvedValueOnce({ user: null }).mockResolvedValue({ user: { id: 'alice' } })
    const save = vi.fn().mockResolvedValue({ id: 'record', version: 2 }); cloudFor.mockReturnValue({ save })
    const { result } = renderHook(() => useDraft({ id: 'alice' }))
    act(() => result.current.open(spec, { location: 'cloud', record: { id: 'record', version: 1 } }))
    act(() => result.current.update((current) => ({ ...current, meta: { title: '保留修改' } })))
    await act(async () => { await expect(result.current.flush()).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' }) })
    expect(result.current.error.status).toBe(401); expect(result.current.draft.spec.meta.title).toBe('保留修改'); expect(save).not.toHaveBeenCalled()
    await act(async () => { await result.current.flush() }); expect(save.mock.calls[0][1].meta.title).toBe('保留修改'); expect(result.current.state).toBe('saved')
  })
  it('retains a conflict and creates a copy without overwriting the server record', async () => {
    authApi.session.mockResolvedValue({ user: { id: 'alice' } })
    const save = vi.fn().mockRejectedValue({ status: 409, server: { id: 'record', version: 3, spec } }), create = vi.fn().mockResolvedValue({ id: 'copy', version: 1 })
    cloudFor.mockReturnValue({ save, create })
    const { result } = renderHook(() => useDraft({ id: 'alice' }))
    act(() => result.current.open(spec, { location: 'cloud', record: { id: 'record', version: 1 } }))
    act(() => result.current.update((current) => ({ ...current, meta: { title: '本机修改' } })))
    await act(async () => { await expect(result.current.flush()).rejects.toMatchObject({ status: 409 }) })
    expect(result.current.conflict.version).toBe(3); expect(result.current.draft.spec.meta.title).toBe('本机修改')
    await act(async () => { await result.current.keepCopy() })
    expect(create.mock.calls[0][0].meta.title).toBe('本机修改（此设备副本）'); expect(save).toHaveBeenCalledTimes(1); expect(result.current.draft.id).toBe('copy')
  })
  it('does not send an old account draft after the signed-in account changes', async () => {
    const save = vi.fn(); cloudFor.mockReturnValue({ save })
    const { result, rerender } = renderHook(({ user }) => useDraft(user), { initialProps: { user: { id: 'alice' } } })
    act(() => result.current.open(spec, { location: 'cloud', record: { id: 'a', version: 1 } }))
    act(() => result.current.update(spec)); rerender({ user: { id: 'bob' } })
    await act(async () => { await expect(result.current.flush()).rejects.toThrow('原账号') })
    expect(save).not.toHaveBeenCalled(); expect(result.current.draft.owner).toBe('alice')
  })
  it('keeps failed edits in the owner-only recovery store and clears them on logout', async () => {
    authApi.session.mockResolvedValue({ user: { id: 'alice' } }); cloudFor.mockReturnValue({ save: vi.fn().mockRejectedValue(new Error('网络断开')) })
    const { result } = renderHook(() => useDraft({ id: 'alice' }))
    act(() => result.current.open(spec, { location: 'cloud', record: { id: 'a', version: 1 } }))
    act(() => result.current.update((value) => ({ ...value, meta: { title: '离线修改' } })))
    await act(async () => { await expect(result.current.flush()).rejects.toThrow('网络断开') })
    await waitFor(async () => expect((await listRecovery('alice'))[0].spec.meta.title).toBe('离线修改'))
    expect(await listRecovery('bob')).toEqual([])
    await act(async () => { await result.current.clearRecovery('alice'); result.current.close() })
    expect(await listRecovery('alice')).toEqual([]); expect(result.current.draft).toBe(null)
  })
})
