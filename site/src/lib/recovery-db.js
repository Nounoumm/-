const DB = 'course-handout-account-recovery'
async function operate(mode, action) {
  const db = await new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('此浏览器无法保存离线恢复副本，请导出 JSON。')); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { const store = req.result.createObjectStore('drafts', { keyPath: ['owner', 'key'] }); store.createIndex('owner', 'owner') }
    req.onerror = () => reject(new Error('无法保存账号恢复副本，请导出 JSON。')); req.onsuccess = () => resolve(req.result)
  })
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode); let result
    try { const request = action(tx.objectStore('drafts')); if (request) request.onsuccess = () => { result = request.result } } catch (err) { db.close(); reject(err); return }
    tx.oncomplete = () => { db.close(); resolve(result) }; tx.onabort = tx.onerror = () => { db.close(); reject(new Error('无法保存账号恢复副本，请导出 JSON。')) }
  })
}
export const saveRecovery = (record) => operate('readwrite', (store) => { if (!record.owner) throw new Error('缺少恢复副本所属账号。'); return store.put(record) })
export const listRecovery = (owner) => owner ? operate('readonly', (store) => store.index('owner').getAll(owner)) : Promise.resolve([])
export const removeRecovery = (owner, key) => operate('readwrite', (store) => store.delete([owner, key]))
export const clearAccountRecovery = (owner) => operate('readwrite', (store) => {
  const request = store.index('owner').openCursor(IDBKeyRange.only(owner)); request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue() } }
})
