import { hideHandout, listReports } from '../services/community.js'
import crypto from 'node:crypto'

const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)) }
function authorized(req) { const actual = Buffer.from(req.headers.authorization?.replace(/^Bearer\s+/, '') || ''); const expected = Buffer.from(process.env.ADMIN_API_KEY || ''); return expected.length > 0 && actual.length === expected.length && crypto.timingSafeEqual(actual, expected) }
export function handleAdminRoute(req, res, db) {
  if (!req.url.startsWith('/api/admin/')) return false
  if (!authorized(req)) return json(res, process.env.ADMIN_API_KEY ? 401 : 503, { error: '管理员权限不可用。' })
  try { if (req.method === 'GET' && req.url === '/api/admin/reports') return json(res, 200, { reports: listReports(db) }); const match = req.url.match(/^\/api\/admin\/community\/handouts\/([^/]+)\/hide$/); if (req.method === 'POST' && match) { hideHandout(db, match[1]); return json(res, 200, { ok: true }) } return json(res, 404, { error: '接口不存在。' }) } catch { return json(res, 400, { error: '管理员操作失败。' }) }
}
