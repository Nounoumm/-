const DB_NAME = 'course-handout-history'
const STORE = 'handouts'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('updatedAt', 'updatedAt')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('本机历史暂时不可用。'))
  })
}

function transaction(mode, action) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); const result = action(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onerror = () => { db.close(); reject(new Error('本机历史保存失败，请先导出讲义。')) }
  }))
}

export function saveHandout(record) { return transaction('readwrite', (store) => store.put(record)) }
export function getHandout(id) { return transaction('readonly', (store) => new Promise((resolve) => { const req = store.get(id); req.onsuccess = () => resolve(req.result || null) })) }
export function listHandouts() { return transaction('readonly', (store) => new Promise((resolve) => { const req = store.getAll(); req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, title, topic, updatedAt, checkStatus }) => ({ id, title, topic, updatedAt, checkStatus }))) })) }
export function renameHandout(id, title) { return getHandout(id).then((record) => { if (!record) throw new Error('找不到这份本机讲义。'); return saveHandout({ ...record, title: title.trim(), updatedAt: new Date().toISOString() }) }) }
export function deleteHandout(id) { return transaction('readwrite', (store) => store.delete(id)) }
