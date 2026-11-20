export function createHistoryController({ save, delayMs = 800 }) {
  let timer
  let pending
  const flush = async () => { if (!pending) return; const record = pending; pending = undefined; clearTimeout(timer); timer = undefined; await save(record) }
  return { schedule(record) { pending = record; clearTimeout(timer); timer = setTimeout(() => { flush().catch(() => {}) }, delayMs) }, flush, cancel() { clearTimeout(timer); timer = undefined; pending = undefined } }
}
