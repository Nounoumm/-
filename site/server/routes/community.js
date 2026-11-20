import { getPublicHandout, publishHandout, reportHandout, searchHandouts, updateHandout, withdrawHandout } from '../services/community.js'

const json = (res, status, value, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(value)) }
const tokenFrom = (req) => req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''

export function handleCommunityRoute(req, res, body, db) {
  const url = new URL(req.url, 'http://localhost'); const parts = url.pathname.split('/').filter(Boolean); if (parts[0] !== 'api' || parts[1] !== 'community' || parts[2] !== 'handouts') return false; const handoutId = parts[3]
  try {
    if (req.method === 'GET' && parts.length === 3) return json(res, 200, searchHandouts(db, { query: url.searchParams.get('q') || '', tag: url.searchParams.get('tag') || '', cursor: url.searchParams.get('cursor') || '', limit: url.searchParams.get('limit') }))
    if (req.method === 'GET' && parts.length === 4) { const item = getPublicHandout(db, handoutId); return item ? json(res, 200, item) : json(res, 404, { error: '讲义不存在。' }) }
    if (req.method === 'POST' && parts.length === 3) return json(res, 201, publishHandout(db, body), { 'Cache-Control': 'no-store' })
    if (req.method === 'POST' && parts.length === 5 && parts[4] === 'reports') return json(res, 201, { reportId: reportHandout(db, handoutId, body) })
    if (req.method === 'PATCH' && parts.length === 4) { const item = updateHandout(db, handoutId, tokenFrom(req), body); return json(res, 200, item) }
    if (req.method === 'DELETE' && parts.length === 4) { withdrawHandout(db, handoutId, tokenFrom(req)); return json(res, 204, {}) }
    return false
  } catch (error) { return json(res, error.message.includes('管理') ? 401 : 400, { error: error.message }) }
}
