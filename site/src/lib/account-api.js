let csrfToken = ''
export function clearCsrf() { csrfToken = '' }
export class ApiError extends Error {
  constructor(status, body) { super(body?.error || body?.message || `请求失败（${status}）`); this.status = status; this.code = body?.code; this.server = body?.server }
}
export async function accountRequest(path, { method = 'GET', body, signal, owner } = {}) {
  if (path.startsWith('/api/account/') && !owner) throw new Error('账号已改变，请重新登录。')
  if (method !== 'GET' && !csrfToken) await session()
  const response = await fetch(path, { method, credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json', ...(owner ? { 'X-Account-ID': owner } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const value = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new ApiError(response.status, value)
  if (value?.csrfToken) csrfToken = value.csrfToken
  return value
}
async function session() { return accountRequest('/api/auth/session') }
export const authApi = {
  session,
  register: (body) => accountRequest('/api/auth/register', { method: 'POST', body }),
  verify: (token) => accountRequest('/api/auth/verify', { method: 'POST', body: { token } }),
  login: (body) => accountRequest('/api/auth/login', { method: 'POST', body }),
  logout: async () => { await accountRequest('/api/auth/logout', { method: 'POST' }); clearCsrf() },
  forgot: (email) => accountRequest('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  reset: (token, password) => accountRequest('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
}
const base = '/api/account/handouts'
export function cloudFor(owner) {
 const accountRequest = (path, options = {}) => scopedRequest(path, { ...options, owner })
 return {
  list: (trash = false) => accountRequest(`${base}${trash ? '?trash=true' : ''}`),
  get: (id) => accountRequest(`${base}/${encodeURIComponent(id)}`),
  create: (spec, signal) => accountRequest(base, { method: 'POST', body: { spec, title: spec.meta.title }, signal }),
  save: (id, spec, version, signal) => accountRequest(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { spec, title: spec.meta.title, version }, signal }),
  trash: (record) => accountRequest(`${base}/${record.id}`, { method: 'DELETE', body: { version: record.version } }),
  restore: (record) => accountRequest(`${base}/${record.id}/restore`, { method: 'POST', body: { version: record.version } }),
  purge: (record) => accountRequest(`${base}/${record.id}/permanent`, { method: 'DELETE', body: { version: record.version } }),
  revisions: (id) => accountRequest(`${base}/${id}/revisions`),
  restoreRevision: (id, revision, version) => accountRequest(`${base}/${id}/revisions/${revision}/restore`, { method: 'POST', body: { version } }),
  import: (sourceId, spec, title, revisions) => accountRequest(`${base}/import`, { method: 'POST', body: { sourceId, spec, title, ...(revisions ? { revisions } : {}) } }),
}}
const scopedRequest = accountRequest
export function sharesFor(owner) {
 const accountRequest = (path, options = {}) => scopedRequest(path, { ...options, owner })
 return {
  list: () => accountRequest('/api/account/shares'),
  publish: (body) => accountRequest('/api/account/shares', { method: 'POST', body }),
  update: (id, body) => accountRequest(`/api/account/shares/${id}`, { method: 'PATCH', body }),
  remove: (id) => accountRequest(`/api/account/shares/${id}`, { method: 'DELETE' }),
  claim: (id, manageToken) => accountRequest(`/api/account/shares/${id}/claim`, { method: 'POST', body: { manageToken } }),
}}
/** Deliberate allowlist: never upload local IDs, materials, or anonymous management tokens. */
export function portableSpec(spec) {
  const metaKeys = ['title', 'subtitle', 'series', 'author', 'date', 'audience', 'template', 'language', 'include_toc', 'include_answers']
  const meta = Object.fromEntries(metaKeys.filter((key) => spec.meta?.[key] !== undefined).map((key) => [key, spec.meta[key]]))
  const pick = (obj, keys) => Object.fromEntries(keys.filter((key) => obj?.[key] !== undefined).map((key) => [key, structuredClone(obj[key])]))
  return { schema: 'course-handout/1', meta,
    ...(spec.preface ? { preface: spec.preface } : {}),
    modules: (spec.modules || []).map((module) => ({ ...pick(module, ['title', 'description']), chapters: (module.chapters || []).map((chapter) => ({
      ...pick(chapter, ['title', 'objectives', 'prerequisites', 'lead', 'summary', 'key_points', 'answers']),
      sections: (chapter.sections || []).map((section) => pick(section, ['title', 'body'])),
      exercises: Object.fromEntries(['basic', 'intermediate', 'challenge'].filter((key) => chapter.exercises?.[key]).map((key) => [key, chapter.exercises[key].map((q) => typeof q === 'string' ? q : pick(q, ['q', 'hint']))])),
    })) })), ...(spec.appendix ? { appendix: {
      ...(typeof spec.appendix.notes === 'string' ? { notes: spec.appendix.notes } : {}),
      glossary: Array.isArray(spec.appendix.glossary) ? spec.appendix.glossary.filter((entry) => Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string').map(([term, definition]) => [term, definition]) : [],
      references: Array.isArray(spec.appendix.references) ? spec.appendix.references.map((entry) => Object.fromEntries(['title', 'url', 'note'].filter((key) => typeof entry?.[key] === 'string').map((key) => [key, entry[key]]))) : [],
    } } : {}) }
}
export function downloadJson(spec) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(portableSpec(spec), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `${spec.meta?.title || '讲义'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
