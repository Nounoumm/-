const DB_NAME = 'course-handout-history', STORE = 'handouts'
export class HistoryStorageError extends Error { constructor() { super('本机历史保存失败，请下载 JSON 备份或清理旧讲义。') } }
function openDb() { return new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) { reject(new HistoryStorageError()); return }
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => { const store = request.result.createObjectStore(STORE, { keyPath: 'id' }); store.createIndex('updatedAt', 'updatedAt') }
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new HistoryStorageError()); request.onblocked = () => reject(new HistoryStorageError())
}) }
async function transact(mode, action) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let value, transaction
    try { transaction = db.transaction(STORE, mode); const request = action(transaction.objectStore(STORE)); request.onsuccess = () => { value = request.result } } catch { db.close(); reject(new HistoryStorageError()); return }
    transaction.oncomplete = () => { db.close(); resolve(value) }
    transaction.onerror = transaction.onabort = () => { db.close(); reject(new HistoryStorageError()) }
  })
}
export const saveHandout = (record) => transact('readwrite', (store) => store.put(record))
export const getHandout = (id) => transact('readonly', (store) => store.get(id)).then((record) => record || null)
export const listHandouts = () => transact('readonly', (store) => store.getAll()).then((items) => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, title, topic, updatedAt, checkStatus }) => ({ id, title, topic, updatedAt, checkStatus })))
export async function renameHandout(id, title) {
  if (!title.trim() || title.trim().length > 120) throw new Error('标题应为 1–120 个字符。')
  const record = await getHandout(id); if (!record) throw new Error('找不到这份本机讲义。')
  return saveHandout({ ...record, title: title.trim(), spec: { ...record.spec, meta: { ...record.spec.meta, title: title.trim() } }, updatedAt: new Date().toISOString() })
}
export const deleteHandout = (id) => transact('readwrite', (store) => store.delete(id))
