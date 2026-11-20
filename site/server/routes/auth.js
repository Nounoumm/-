function send(res, status, value) {
  const { cookie, ...body } = value
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) })
  res.end(JSON.stringify(body))
  return true
}

export async function handleAuthRoute(req, res, body, auth) {
  const url = new URL(req.url, 'http://localhost'); const path = url.pathname
  if (!path.startsWith('/api/auth/')) return false
  try {
    const session = auth.getSession(req)
    if (req.method === 'GET' && path === '/api/auth/session') {
      return send(res, 200, session ? { user: session.user, csrfToken: session.csrfToken } : { user: null, ...auth.guestCsrf() })
    }
    if (req.method !== 'POST') return send(res, 405, { error: '该接口不支持此操作。' })
    auth.assertCsrf(req, session)
    const ip = req.socket?.remoteAddress || 'unknown'
    auth.rateLimit(`ip:${ip}`, 30)
    if (body?.email) auth.rateLimit(`email:${String(body.email).trim().toLowerCase()}:${path}`, 10)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: '请求格式无效。' })
    switch (path) {
      case '/api/auth/register': return send(res, 200, await auth.register(body))
      case '/api/auth/verify': return send(res, 200, await auth.verify(body))
      case '/api/auth/login': return send(res, 200, await auth.login(body, req))
      case '/api/auth/logout': return send(res, 200, auth.logout(req))
      case '/api/auth/forgot-password': return send(res, 200, await auth.requestReset(body))
      case '/api/auth/reset-password': return send(res, 200, await auth.reset(body))
      default: return send(res, 404, { error: '账号接口不存在。' })
    }
  } catch (error) {
    return send(res, error.status || 500, { error: error.status ? error.message : '账号服务暂时不可用，请稍后重试。' })
  }
}
