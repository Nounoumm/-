import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, authApi, cloudFor, portableSpec } from './account-api.js'
import { saveHandout } from './history-db.js'
import { createHistoryController } from './history-controller.js'
import { saveRecovery, removeRecovery, clearAccountRecovery } from './recovery-db.js'

export function useDraft(user) {
  const [draft, setDraft] = useState(null), [state, setState] = useState('saved'), [error, setError] = useState(null), [conflict, setConflict] = useState(null), [recoveryError, setRecoveryError] = useState('')
  const current = useRef(null), controller = useRef(null), userRef = useRef(user)
  userRef.current = user
  const close = useCallback(() => { controller.current?.cancel(); controller.current = null; current.current = null; setDraft(null); setError(null); setConflict(null); setState('saved') }, [])
  const open = useCallback((spec, { location = 'local', record = null, owner = userRef.current?.id, save = false } = {}) => {
    controller.current?.cancel(); setError(null); setConflict(null); setState('saved'); setRecoveryError('')
    const clean = portableSpec(spec)
    const session = { spec: clean, location, owner: location === 'cloud' ? owner : null, id: record?.id || (location === 'local' ? crypto.randomUUID() : null), version: record?.version, title: record?.title || clean.meta.title, recoveryKey: record?.recoveryKey || record?.id || crypto.randomUUID(), cacheWrites: Promise.resolve() }
    session.cache = (snapshot) => { if (location !== 'cloud') return; session.cacheWrites = session.cacheWrites.catch(() => {}).then(() => saveRecovery({ owner: session.owner, key: session.recoveryKey, id: session.id, version: session.version, title: snapshot.meta.title, spec: snapshot, updatedAt: new Date().toISOString() })).catch((err) => { if (current.current === session) setRecoveryError(err.message) }) }
    current.current = session; setDraft({ ...session })
    controller.current = createHistoryController({
      onState: (value) => { if (current.current === session) setState(value) },
      onError: (err) => { if (current.current === session) { setError(err); if (err.status === 409) setConflict(err.server || { deletedAt: true }) } },
      save: async (snapshot, signal) => {
        if (session.location === 'cloud') {
          if (!userRef.current || userRef.current.id !== session.owner) throw new ApiError(401, { code: 'ACCOUNT_CHANGED', error: '请登录原账号后重试，当前内容仍保留在页面中。' })
          const authenticated = await authApi.session()
          if (signal.aborted || current.current !== session) return
          if (authenticated.user?.id !== session.owner) throw new ApiError(401, { code: authenticated.user ? 'ACCOUNT_CHANGED' : 'AUTH_REQUIRED', error: '登录已过期或账号已改变。请重新登录原账号后保存，当前内容未上传。' })
          const cloudApi = cloudFor(session.owner); const result = session.id ? await cloudApi.save(session.id, snapshot, session.version, signal) : await cloudApi.create(snapshot, signal)
          if (signal.aborted || current.current !== session) return
          session.id = result.id; session.version = result.version; setError(null)
          if (session.spec === snapshot) session.cacheWrites = session.cacheWrites.catch(() => {}).then(() => removeRecovery(session.owner, session.recoveryKey)).catch((err) => { if (current.current === session) setRecoveryError(err.message) })
          else session.cache(session.spec)
          setDraft((previous) => ({ ...previous, id: result.id, version: result.version }))
        } else {
          await saveHandout({ id: session.id, title: snapshot.meta.title, topic: snapshot.meta.title, updatedAt: new Date().toISOString(), checkStatus: 'unchecked', spec: snapshot })
          if (current.current === session) setError(null)
        }
      },
    })
    if (save) { session.cache(clean); controller.current.schedule(clean) }
  }, [])
  const update = useCallback((value) => {
    const session = current.current; if (!session) return
    session.spec = portableSpec(typeof value === 'function' ? value(session.spec) : value)
    setDraft({ ...session }); session.cache(session.spec); controller.current?.schedule(session.spec)
  }, [])
  const flush = useCallback(() => controller.current?.flush() || Promise.resolve(), [])
  const hasPending = useCallback(() => !!controller.current?.hasPending(), [])
  const keepCopy = useCallback(async () => {
    const session = current.current; if (!session || session.owner !== userRef.current?.id) throw new Error('请登录原账号。')
    const copy = portableSpec(session.spec); copy.meta.title += '（此设备副本）'
    open(copy, { location: 'cloud', owner: session.owner, save: true }); await controller.current.flush(); await session.cacheWrites; await removeRecovery(session.owner, session.recoveryKey)
  }, [open])
  const useServer = useCallback(async () => { if (conflict?.spec && !conflict.deletedAt) { const old = current.current; open(conflict.spec, { location: 'cloud', record: conflict, owner: old?.owner }); await old.cacheWrites; await removeRecovery(old.owner, old.recoveryKey) } }, [conflict, open])
  const clearRecovery = useCallback(async (owner) => { const old = current.current; controller.current?.cancel(); if (old) await old.cacheWrites; await clearAccountRecovery(owner) }, [])
  useEffect(() => {
    const warn = (e) => { if (controller.current?.hasPending()) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn); controller.current?.cancel() }
  }, [])
  return { draft, update, open, close, flush, hasPending, state, error, conflict, keepCopy, useServer, clearRecovery, recoveryError }
}
