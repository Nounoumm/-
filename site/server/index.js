import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import templates from '../../shared/templates.json' with { type: 'json' }
import { config } from './config.js'
import { templateResponse } from './routes/templates.js'
import { handleHandoutRoute } from './routes/handouts.js'
import { handleCommunityRoute } from './routes/community.js'
import { handleAdminRoute } from './routes/admin.js'
import { createCommunityDb } from './db/index.js'
import { createRateLimiter } from './lib/rate-limit.js'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticRoot = path.resolve(siteRoot, 'dist')
const dbHandle = createCommunityDb()
const rateLimit = createRateLimiter()
const communityRateLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20 })
function readBody(req) { return new Promise((resolve, reject) => { let data = ''; req.on('data', (chunk) => { data += chunk; if (data.length > 35_000_000) reject(new Error('请求体过大。')) }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch { reject(new Error('请求体不是合法 JSON。')) } }); req.on('error', reject) }) }
function send(res, status, body, type = 'text/html; charset=utf-8') { res.writeHead(status, { 'Content-Type': type }); res.end(body) }

const server = createServer(async (req, res) => {
  const abort = new AbortController(); req.requestSignal = abort.signal; req.on('aborted', () => abort.abort()); req.on('close', () => { if (!res.writableEnded) abort.abort() })
  try {
    if (req.method === 'GET' && req.url === '/api/templates') return send(res, 200, JSON.stringify(templateResponse()), 'application/json; charset=utf-8')
    if (req.url.startsWith('/api/')) {
      if ((req.url === '/api/handouts/outline' || req.url === '/api/handouts/generate') && !rateLimit(req.socket.remoteAddress || 'unknown')) return send(res, 429, JSON.stringify({ error: '请求过于频繁，请稍后再试。' }), 'application/json; charset=utf-8')
      if (req.url.startsWith('/api/community/') && req.method === 'POST' && !communityRateLimit(req.socket.remoteAddress || 'unknown')) return send(res, 429, JSON.stringify({ error: '社区操作过于频繁，请稍后再试。' }), 'application/json; charset=utf-8')
      const body = await readBody(req); const communityHandled = handleAdminRoute(req, res, dbHandle.db) || handleCommunityRoute(req, res, body, dbHandle.db)
      if (communityHandled) return
      const handled = await handleHandoutRoute(req, res, body); if (!handled) send(res, 404, JSON.stringify({ error: '接口不存在。' }), 'application/json; charset=utf-8'); return
    }
    const requested = req.url === '/' ? '/index.html' : req.url
    const root = (await import('node:fs')).existsSync(path.join(staticRoot, 'index.html')) ? staticRoot : siteRoot
    let file = path.resolve(root, `.${decodeURIComponent(requested)}`); if (!(file === root || file.startsWith(root + path.sep))) return send(res, 404, 'Not found')
    if (!(await import('node:fs')).existsSync(file) && root === staticRoot) file = path.join(root, 'index.html')
    const content = await readFile(file); const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8'; return send(res, 200, content, type)
  } catch (error) { if (!res.headersSent) send(res, 400, JSON.stringify({ error: error.message }), 'application/json; charset=utf-8') }
})

if (process.env.NODE_ENV !== 'test') server.listen(config.port, '127.0.0.1', () => console.log(`Course Handout Studio site listening on http://127.0.0.1:${config.port}`))
export { server }
