import { validateGenerateInput } from '../lib/validation.js'
import { createLocalOutline, generateHandout } from '../services/generation.js'
import { checkSpec, buildDocx } from '../services/python-builder.js'
import { extractTextFiles } from '../services/materials.js'

function json(res, status, value, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(value)) }

export async function handleHandoutRoute(req, res, body) {
  if (req.method === 'POST' && req.url === '/api/materials/extract') {
    try { return json(res, 200, { files: await extractTextFiles(body.files || []) }) } catch (error) { return json(res, 400, { error: error.message }) }
  }
  if (req.method !== 'POST') return false
  if (req.url === '/api/handouts/outline') {
    const validation = validateGenerateInput(body, { requireSelection: false }); if (!validation.ok) return json(res, 400, { error: '请求参数无效。', fields: validation.errors })
    return json(res, 200, { outline: createLocalOutline(validation.value) })
  }
  if (req.url === '/api/handouts/check') {
    try { return json(res, 200, await checkSpec(body.spec, req.requestSignal)) } catch (error) { return json(res, 400, { error: error.message }) }
  }
  if (req.url === '/api/handouts/docx') {
    try { const result = await checkSpec(body.spec, req.requestSignal); if (result.issues?.some((issue) => issue.level === 'error')) return json(res, 422, { error: '讲义检查存在错误，请修正后再导出。', issues: result.issues, stats: result.stats }); const built = await buildDocx(body.spec, req.requestSignal); res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="course-handout.docx"' }); return res.end(built.bytes) } catch (error) { return json(res, 400, { error: error.message }) }
  }
  if (req.url === '/api/handouts/generate') {
    const validation = validateGenerateInput(body); if (!validation.ok) return json(res, 400, { error: '请求参数无效。', fields: validation.errors })
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    const send = (payload) => res.write(`data: ${JSON.stringify({ type: payload.type || 'progress', ...payload })}\n\n`)
    try { const spec = await generateHandout(validation.value, body.outline, String(body.materialText || ''), req.requestSignal, (progress) => send(progress)); send({ type: 'result', spec }); res.end() } catch (error) { if (!res.writableEnded) { send({ type: 'error', error: error.message }); res.end() } }
    return true
  }
  return false
}
