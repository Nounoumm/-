import { AccountError } from '../services/private-history.js'

const send = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(status === 204 ? undefined : JSON.stringify(value)); return true
}

// Authentication, origin and CSRF checks run in the server before any account mutation.
export function handleAccountRoute(req, res, body, service, session) {
  const url = new URL(req.url, 'http://localhost'), parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'api' || parts[1] !== 'account') return false
  if (!session?.user?.id) return send(res, 401, { error: '请先登录。', code: 'AUTH_REQUIRED' })
  if (!session.user.verifiedAt) return send(res, 403, { error: '请先验证邮箱。', code: 'EMAIL_UNVERIFIED' })
  const owner = session.user.id, id = parts[3], method = req.method
  body = body || {}
  try {
    if (parts[2] === 'handouts') {
      if (parts.length === 3 && method === 'GET') return send(res, 200, service.list(owner, url.searchParams.get('trash') === 'true'))
      if (parts.length === 3 && method === 'POST') return send(res, 201, service.create(owner, body))
      if (parts.length === 4 && id === 'import' && method === 'POST') return send(res, 200, service.import(owner, body))
      if (parts.length === 4 && method === 'GET') return send(res, 200, service.get(owner, id))
      if (parts.length === 4 && method === 'PATCH') return send(res, 200, service.save(owner, id, body))
      if (parts.length === 4 && method === 'DELETE') return send(res, 200, service.trash(owner, id, body))
      if (parts.length === 5 && parts[4] === 'restore' && method === 'POST') return send(res, 200, service.restore(owner, id, body))
      if (parts.length === 5 && parts[4] === 'permanent' && method === 'DELETE') { service.permanentDelete(owner, id, body); return send(res, 204) }
      if (parts.length === 5 && parts[4] === 'export' && method === 'GET') return send(res, 200, service.get(owner, id).spec)
      if (parts.length === 5 && parts[4] === 'revisions' && method === 'GET') return send(res, 200, service.revisions(owner, id))
      if (parts.length === 7 && parts[4] === 'revisions' && parts[6] === 'restore' && method === 'POST') return send(res, 200, service.restoreRevision(owner, id, Number(parts[5]), body))
    }
    if (parts[2] === 'shares') {
      if (parts.length === 3 && method === 'GET') return send(res, 200, service.shares.list(owner))
      if (parts.length === 3 && method === 'POST') return send(res, 201, service.shares.publish(owner, body))
      if (parts.length === 4 && method === 'PATCH') return send(res, 200, service.shares.update(owner, id, body))
      if (parts.length === 4 && method === 'DELETE') { service.shares.withdraw(owner, id); return send(res, 204) }
      if (parts.length === 5 && parts[4] === 'claim' && method === 'POST') return send(res, 200, service.shares.claim(owner, id, body.manageToken))
    }
    return send(res, 404, { error: '接口不存在。', code: 'NOT_FOUND' })
  } catch (error) {
    if (error instanceof AccountError) return send(res, error.status, { error: error.message, code: error.code, ...(error.server && { server: error.server }) })
    return send(res, 500, { error: '账号操作失败，请稍后重试。', code: 'INTERNAL_ERROR' })
  }
}
