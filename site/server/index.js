import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { templateResponse } from './routes/templates.js'
import { handleHandoutRoute } from './routes/handouts.js'
import { handleCommunityRoute } from './routes/community.js'
import { handleAdminRoute } from './routes/admin.js'
import { createCommunityDb } from './db/index.js'
import { createRateLimiter } from './lib/rate-limit.js'
import { createAuthService } from './services/auth.js'
import { handleAuthRoute } from './routes/auth.js'
import { createAccountService } from './services/account.js'
import { handleAccountRoute } from './routes/account.js'

const staticRoot = fileURLToPath(new URL('../dist/', import.meta.url))
const fail = (message, status) => Object.assign(new Error(message), { status })

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    const chunks = []
    req.on('data', chunk => {
      bytes += chunk.length
      if (bytes > limit) { chunks.length = 0; reject(fail('请求体过大。', 413)); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (bytes > limit) return
      try { resolve(bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) }
      catch { reject(fail('请求体不是合法 JSON。', 400)) }
    })
    req.on('error', reject)
  })
}
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function createSiteServer({ db, auth = createAuthService(db) }) {
  const account = createAccountService(db)
  const maintain = () => {
    account.purgeExpired()
    const now = new Date().toISOString()
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL').run(now)
    db.prepare('DELETE FROM auth_tokens WHERE expires_at <= ? OR used_at IS NOT NULL').run(now)
  }
  maintain()
  const maintenance = setInterval(() => {
    try { maintain() } catch { console.error('账号数据定期清理失败，请检查数据库。') }
  }, 24 * 60 * 60 * 1000)
  maintenance.unref()
  const generateLimit = createRateLimiter()
  const communityLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20 })
  const server = createServer(async (req, res) => {
    const abort = new AbortController()
    req.requestSignal = abort.signal
    req.on('aborted', () => abort.abort())
    res.on('close', () => { if (!res.writableEnded) abort.abort() })
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    try {
      const url = new URL(req.url, 'http://localhost')
      const pathname = url.pathname
      if (pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store')
        const limit = pathname === '/api/materials/extract' ? 35_000_000 : pathname === '/api/account/handouts/import' ? 21 * 1024 * 1024 : 1_100_000
        const body = await readBody(req, limit)
        if (await handleAuthRoute(req, res, body, auth)) return
        if (pathname.startsWith('/api/account/')) {
          const session = auth.getSession(req)
          if (!session) throw fail('请先登录账号。', 401)
          // The header binds a tab to its displayed account, never grants ownership.
          if (req.headers['x-account-id'] !== session.user.id) return json(res, 401, { error: '账号已在其他页面切换，请刷新页面或重新登录。', code: 'ACCOUNT_CHANGED' })
          if (!['GET', 'HEAD'].includes(req.method)) auth.assertCsrf(req, session)
          if (pathname.startsWith('/api/account/shares') && req.method === 'POST') auth.rateLimit('share:' + session.user.id, 20, 60 * 60 * 1000)
          if (await handleAccountRoute(req, res, body, account, session)) return
          return json(res, 404, { error: '接口不存在。' })
        }
        if (pathname === '/api/templates' && req.method === 'GET') return json(res, 200, templateResponse())
        if (pathname === '/api/community/handouts' && req.method === 'POST' && auth.getSession(req)) throw fail('登录后请通过账号分享入口发布。', 400)
        const client = req.socket.remoteAddress || 'unknown'
        if (['/api/handouts/outline', '/api/handouts/generate'].includes(pathname) && !generateLimit(client)) throw fail('请求过于频繁，请稍后再试。', 429)
        if (pathname.startsWith('/api/community/') && req.method === 'POST' && !communityLimit(client)) throw fail('社区操作过于频繁，请稍后再试。', 429)
        handleAdminRoute(req, res, db)
        if (res.writableEnded) return
        handleCommunityRoute(req, res, body, db)
        if (res.writableEnded) return
        await handleHandoutRoute(req, res, body)
        if (!res.writableEnded && !res.headersSent) json(res, 404, { error: '接口不存在。' })
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw fail('请求方法不支持。', 405)
      const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'
      let file = path.resolve(staticRoot, relative)
      const inside = path.relative(staticRoot, file)
      if (inside.startsWith('..') || path.isAbsolute(inside)) throw fail('页面不存在。', 404)
      let content
      try { content = await readFile(file) }
      catch {
        if (path.extname(file)) throw fail('页面不存在。', 404)
        file = path.join(staticRoot, 'index.html')
        try { content = await readFile(file) } catch { throw fail('请先运行网站生产构建，或通过开发服务器访问。', 503) }
      }
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
      res.end(req.method === 'HEAD' ? undefined : content)
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : '服务暂时不可用，请稍后再试。' })
      else if (!res.writableEnded) res.end()
    }
  })
  server.on('close', () => clearInterval(maintenance))
  return server
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  const handle = createCommunityDb()
  const auth = createAuthService(handle.db)
  const server = createSiteServer({ db: handle.db, auth })
  server.listen(config.port, process.env.HOST || '127.0.0.1', () => console.log('Course Handout Studio listening on port ' + config.port))
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => server.close(() => { handle.close(); process.exit(0) }))
}
