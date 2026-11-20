export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const buckets = new Map()
  return function allow(key) {
    const now = Date.now(); const current = buckets.get(key)
    if (!current || now - current.started >= windowMs) { buckets.set(key, { started: now, count: 1 }); return true }
    if (current.count >= max) return false
    current.count += 1; return true
  }
}
