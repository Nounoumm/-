/** Serialize writes; retain the newest failed draft until retry or explicit discard. */
export function createHistoryController({ save, delayMs = 800, onError = () => {}, onState = () => {} }) {
  let timer, pending, running, disposed = false
  const abort = new AbortController()
  function schedule(record) {
    if (disposed) return
    pending = record; clearTimeout(timer); onState('pending')
    timer = setTimeout(() => { flush().catch(() => {}) }, delayMs)
  }
  function flush() {
    clearTimeout(timer)
    if (disposed) return Promise.resolve()
    if (running) return running
    if (pending === undefined) return Promise.resolve()
    running = (async () => {
      while (!disposed && pending !== undefined) {
        const record = pending; pending = undefined; onState('saving')
        try { await save(record, abort.signal) } catch (error) {
          if (!disposed) { if (pending === undefined) pending = record; onState('error'); onError(error) }
          throw error
        }
      }
      if (!disposed) onState('saved')
    })().finally(() => { running = undefined })
    return running
  }
  return { schedule, flush, hasPending: () => pending !== undefined || !!running,
    cancel() { disposed = true; clearTimeout(timer); pending = undefined; abort.abort() } }
}
