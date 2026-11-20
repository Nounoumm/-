import { randomUUID } from 'node:crypto'

export const HISTORY_LIMITS = Object.freeze({ maxCount: 200, maxSpecBytes: 1024 * 1024, maxBytes: 100 * 1024 * 1024, maxRevisions: 20 })
export class AccountError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST', server) { super(message); this.status = status; this.code = code; if (server) this.server = server }
}
const fail = (message) => { throw new AccountError(400, message) }
const text = (value) => typeof value === 'string' ? value : ''
const stringList = (value) => Array.isArray(value) ? value.map((v) => text(v)) : []
const strings = (obj, keys) => Object.fromEntries(keys.filter((k) => typeof obj?.[k] === 'string').map((k) => [k, text(obj[k])]))

// Persist only document fields; source uploads, provider context and management tokens never enter history.
export function sanitizePrivateSpec(input) {
  let raw
  try { raw = JSON.stringify(input) } catch { fail('讲义格式无效。') }
  if (!raw || Buffer.byteLength(raw) > HISTORY_LIMITS.maxSpecBytes) throw new AccountError(413, '每份讲义不能超过 1 MiB。', 'SPEC_TOO_LARGE')
  if (input?.schema !== 'course-handout/1' || typeof input.meta?.title !== 'string' || !input.meta.title.trim() || !Array.isArray(input.modules)) fail('讲义格式无效。')
  const exercise = (v) => typeof v === 'string' ? v : strings(v, ['q', 'hint'])
  const spec = {
    schema: 'course-handout/1',
    meta: { ...strings(input.meta, ['title', 'subtitle', 'series', 'author', 'date', 'audience', 'template', 'language']), ...Object.fromEntries(['include_toc', 'include_answers'].filter((k) => typeof input.meta[k] === 'boolean').map((k) => [k, input.meta[k]])) },
    modules: input.modules.map((m) => {
      if (!m || !Array.isArray(m.chapters)) fail('模块结构无效。')
      return { ...strings(m, ['id', 'title', 'description']), chapters: m.chapters.map((c) => {
        if (!c || !Array.isArray(c.sections)) fail('章节结构无效。')
        return { ...strings(c, ['id', 'title', 'lead']), objectives: stringList(c.objectives), prerequisites: stringList(c.prerequisites), sections: c.sections.map((s) => strings(s, ['id', 'title', 'body'])), summary: stringList(c.summary), key_points: stringList(c.key_points), exercises: Object.fromEntries(['basic', 'intermediate', 'challenge'].filter((k) => Array.isArray(c.exercises?.[k])).map((k) => [k, c.exercises[k].map(exercise)])), answers: stringList(c.answers) }
      }) }
    }),
  }
  if (typeof input.preface === 'string') spec.preface = input.preface
  if (input.appendix) spec.appendix = { glossary: Array.isArray(input.appendix.glossary) ? input.appendix.glossary.map((v) => Array.isArray(v) ? v.slice(0, 2).map((s) => text(s)) : []) : [], references: Array.isArray(input.appendix.references) ? input.appendix.references.map((v) => strings(v, ['title', 'url', 'note'])) : [], ...strings(input.appendix, ['notes']) }
  if (Buffer.byteLength(JSON.stringify(spec)) > HISTORY_LIMITS.maxSpecBytes) throw new AccountError(413, '每份讲义不能超过 1 MiB。', 'SPEC_TOO_LARGE')
  return spec
}

export function createPrivateHistoryService(db, { clock = () => new Date() } = {}) {
  const timestamp = () => clock().toISOString()
  const record = (row) => ({ id: row.id, title: row.title, spec: JSON.parse(row.spec_json), version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at })
  const owned = (owner, id) => { const row = db.prepare('SELECT * FROM private_handouts WHERE id=? AND owner_id=?').get(id, owner); if (!row) throw new AccountError(404, '讲义不存在。', 'NOT_FOUND'); return row }
  const expected = (row, version) => { if (!Number.isInteger(version) || version !== row.version) throw new AccountError(409, '讲义已在其他设备更新。', 'VERSION_CONFLICT', record(row)) }
  const active = (row) => { if (row.deleted_at) throw new AccountError(409, '讲义已进入回收站，请先恢复。', 'DELETED', record(row)) }
  const titleOf = (title, spec) => { const v = typeof title === 'string' ? title.trim() : spec.meta.title.trim(); if (!v || v.length > 160) fail('标题须为 1–160 个字符。'); return v }
  const atomic = (action) => { db.exec('BEGIN IMMEDIATE'); try { const result = action(); db.exec('COMMIT'); return result } catch (e) { db.exec('ROLLBACK'); throw e } }
  const quota = (owner) => {
    const q = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(length(CAST(spec_json AS BLOB))),0) AS bytes FROM private_handouts WHERE owner_id=?').get(owner)
    q.bytes += db.prepare('SELECT COALESCE(SUM(length(CAST(spec_json AS BLOB))),0) AS bytes FROM handout_revisions WHERE owner_id=?').get(owner).bytes
    return { ...q, ...HISTORY_LIMITS }
  }
  const enforceQuota = (owner) => { const q = quota(owner); if (q.count > q.maxCount) throw new AccountError(409, '每个账号最多保存 200 份讲义，请清理回收站。', 'QUOTA_EXCEEDED'); if (q.bytes > q.maxBytes) throw new AccountError(409, '账号内容及版本总量不能超过 100 MiB。', 'QUOTA_EXCEEDED') }
  const revision = (owner, id, version, title, spec, time) => {
    db.prepare('INSERT INTO handout_revisions(handout_id,owner_id,version,spec_json,title,created_at) VALUES(?,?,?,?,?,?)').run(id, owner, version, JSON.stringify(spec), title, time)
    db.prepare('DELETE FROM handout_revisions WHERE handout_id=? AND owner_id=? AND version NOT IN (SELECT version FROM handout_revisions WHERE handout_id=? AND owner_id=? ORDER BY version DESC LIMIT 20)').run(id, owner, id, owner)
  }
  const insert = (owner, data) => {
    const spec = sanitizePrivateSpec(data.spec), title = titleOf(data.title, spec), time = timestamp(), id = randomUUID()
    spec.meta.title = title
    sanitizePrivateSpec(spec)
    db.prepare('INSERT INTO private_handouts(id,owner_id,title,spec_json,version,created_at,updated_at,deleted_at) VALUES(?,?,?,?,1,?,?,NULL)').run(id, owner, title, JSON.stringify(spec), time, time)
    revision(owner, id, 1, title, spec, time); return record(owned(owner, id))
  }
  const save = (owner, id, data) => {
    const row = owned(owner, id); active(row); expected(row, data.version)
    const spec = sanitizePrivateSpec(data.spec), title = titleOf(data.title, spec), time = timestamp(), version = row.version + 1
    spec.meta.title = title
    sanitizePrivateSpec(spec)
    db.prepare('UPDATE private_handouts SET title=?,spec_json=?,version=?,updated_at=? WHERE id=? AND owner_id=?').run(title, JSON.stringify(spec), version, time, id, owner)
    revision(owner, id, version, title, spec, time); enforceQuota(owner); return record(owned(owner, id))
  }
  return {
    quota,
    list(owner, trash = false) { return { items: db.prepare(`SELECT * FROM private_handouts WHERE owner_id=? AND deleted_at IS ${trash ? 'NOT ' : ''}NULL ORDER BY updated_at DESC,id DESC`).all(owner).map((row) => { const { spec, ...meta } = record(row); return meta }), quota: quota(owner) } },
    get(owner, id) { return record(owned(owner, id)) },
    create(owner, data) { return atomic(() => { const result = insert(owner, data); enforceQuota(owner); return result }) },
    save(owner, id, data) { return atomic(() => save(owner, id, data)) },
    trash(owner, id, data) { return atomic(() => { const row = owned(owner, id); active(row); expected(row, data.version); const time = timestamp(); db.prepare('UPDATE private_handouts SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=?').run(time, time, id, owner); return record(owned(owner, id)) }) },
    restore(owner, id, data) { return atomic(() => { const row = owned(owner, id); expected(row, data.version); if (!row.deleted_at) fail('讲义不在回收站。'); if (Date.parse(row.deleted_at) <= clock().getTime() - 30 * 86400000) throw new AccountError(410, '回收站保留期已结束。', 'EXPIRED'); const time = timestamp(); db.prepare('UPDATE private_handouts SET deleted_at=NULL,updated_at=?,version=version+1 WHERE id=? AND owner_id=?').run(time, id, owner); revision(owner, id, row.version + 1, row.title, JSON.parse(row.spec_json), time); enforceQuota(owner); return record(owned(owner, id)) }) },
    permanentDelete(owner, id, data) { return atomic(() => { const row = owned(owner, id); expected(row, data.version); if (!row.deleted_at) fail('请先将讲义移入回收站。'); db.prepare('DELETE FROM private_handouts WHERE id=? AND owner_id=?').run(id, owner) }) },
    revisions(owner, id) { owned(owner, id); return { items: db.prepare('SELECT version,title,created_at AS createdAt FROM handout_revisions WHERE handout_id=? AND owner_id=? ORDER BY version DESC').all(id, owner) } },
    restoreRevision(owner, id, rev, data) { return atomic(() => { const current = owned(owner, id); active(current); expected(current, data.version); const previous = db.prepare('SELECT * FROM handout_revisions WHERE handout_id=? AND owner_id=? AND version=?').get(id, owner, rev); if (!previous) throw new AccountError(404, '版本不存在。', 'NOT_FOUND'); return save(owner, id, { version: data.version, spec: JSON.parse(previous.spec_json), title: previous.title }) }) },
    import(owner, data) { return atomic(() => {
      if (typeof data.sourceId !== 'string' || !data.sourceId || data.sourceId.length > 256) fail('本机记录标识无效。')
      const prior = db.prepare('SELECT handout_id FROM history_imports WHERE owner_id=? AND source_id=?').get(owner, data.sourceId)
      if (prior) return { record: record(owned(owner, prior.handout_id)), imported: false }
      const previous = Array.isArray(data.revisions) ? data.revisions.slice(-19) : []
      const entries = [...previous, data]
      let result = insert(owner, entries[0])
      for (const entry of entries.slice(1)) result = save(owner, result.id, { ...entry, version: result.version })
      db.prepare('INSERT INTO history_imports(owner_id,source_id,handout_id) VALUES(?,?,?)').run(owner, data.sourceId, result.id)
      enforceQuota(owner); return { record: result, imported: true }
    }) },
    purgeExpired() { return atomic(() => db.prepare('DELETE FROM private_handouts WHERE deleted_at IS NOT NULL AND deleted_at<=?').run(new Date(clock().getTime() - 30 * 86400000).toISOString()).changes) },
  }
}
