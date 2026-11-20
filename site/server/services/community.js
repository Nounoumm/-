import crypto from 'node:crypto'
import { createManageToken, matchesManageToken } from '../lib/tokens.js'
import { assertSpec } from '../lib/validation.js'

const REPORT_REASONS = new Set(['copyright', 'misinformation', 'personal_data', 'other'])
const clean = (value, max) => String(value || '').trim().slice(0, max)
const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const parse = (row) => row ? { id: row.id, spec: JSON.parse(row.spec_json), title: row.title, topic: row.topic, tags: JSON.parse(row.tags_json), displayName: row.display_name || '', status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null
const publicFields = (item) => item && ({ id: item.id, spec: item.spec, title: item.title, topic: item.topic, tags: item.tags, displayName: item.displayName, createdAt: item.createdAt, updatedAt: item.updatedAt })

export function publishHandout(db, { spec, displayName = '', tags = [] }) {
  assertSpec(spec)
  const title = clean(spec.meta?.title, 160); const topic = clean(spec.meta?.title || spec.meta?.subtitle, 160)
  if (!title) throw new Error('讲义标题不能为空。')
  const normalizedTags = [...new Set((Array.isArray(tags) ? tags : []).map((tag) => clean(tag, 30)).filter(Boolean))].slice(0, 10)
  const token = createManageToken(); const timestamp = now(); const handoutId = id()
  db.prepare('INSERT INTO community_handouts (id, spec_json, title, topic, tags_json, display_name, manage_digest, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'visible\', ?, ?)').run(handoutId, JSON.stringify(spec), title, topic, JSON.stringify(normalizedTags), clean(displayName, 60), token.digest, timestamp, timestamp)
  return { id: handoutId, manageToken: token.token, createdAt: timestamp }
}

export function getPublicHandout(db, handoutId) {
  const item = parse(db.prepare('SELECT * FROM community_handouts WHERE id = ? AND status = \'visible\'').get(handoutId)); return publicFields(item)
}

export function searchHandouts(db, { query = '', tag = '', cursor = '', limit = 20 } = {}) {
  const size = Math.max(1, Math.min(50, Number(limit) || 20)); const q = `%${clean(query, 120)}%`; const tagQuery = clean(tag, 30); const [cursorDate, cursorId] = String(cursor || '').split('|')
  const cursorClause = cursorDate && cursorId ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : ''
  const params = [q, q, q, tagQuery, `%${tagQuery}%`]; if (cursorClause) params.push(cursorDate, cursorDate, cursorId); params.push(size + 1)
  const rows = db.prepare(`SELECT * FROM community_handouts WHERE status = 'visible' AND (title LIKE ? OR topic LIKE ? OR tags_json LIKE ?) AND (? = '' OR tags_json LIKE ?)${cursorClause} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params)
  const items = rows.slice(0, size).map((row) => publicFields(parse(row))); const nextCursor = rows.length > size ? rows[size - 1].created_at + '|' + rows[size - 1].id : null
  return { items, nextCursor }
}

function authorized(db, handoutId, token) {
  const row = db.prepare('SELECT * FROM community_handouts WHERE id = ?').get(handoutId)
  if (!row || row.status !== 'visible' || !matchesManageToken(token, row.manage_digest)) throw new Error('无法管理此分享。')
  return row
}

export function updateHandout(db, handoutId, token, { spec, displayName = '', tags = [] }) {
  const row = authorized(db, handoutId, token); assertSpec(spec); const timestamp = now(); const nextTitle = clean(spec.meta?.title, 160); const nextTags = [...new Set((Array.isArray(tags) ? tags : []).map((tag) => clean(tag, 30)).filter(Boolean))].slice(0, 10)
  db.prepare('UPDATE community_handouts SET spec_json = ?, title = ?, topic = ?, tags_json = ?, display_name = ?, status = \'visible\', updated_at = ? WHERE id = ?').run(JSON.stringify(spec), nextTitle, nextTitle, JSON.stringify(nextTags), clean(displayName, 60), timestamp, row.id)
  return publicFields(parse(db.prepare('SELECT * FROM community_handouts WHERE id = ?').get(row.id)))
}

export function withdrawHandout(db, handoutId, token) { const row = authorized(db, handoutId, token); db.prepare('UPDATE community_handouts SET status = \'withdrawn\', updated_at = ? WHERE id = ?').run(now(), row.id) }

export function reportHandout(db, handoutId, { reason, details = '' }) {
  if (!REPORT_REASONS.has(reason)) throw new Error('举报理由无效。')
  if (!db.prepare('SELECT 1 FROM community_handouts WHERE id = ? AND status = \'visible\'').get(handoutId)) throw new Error('讲义不存在。')
  const reportId = id(); db.prepare('INSERT INTO community_reports (id, handout_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?)').run(reportId, handoutId, reason, clean(details, 1000), now()); return reportId
}

export function hideHandout(db, handoutId) { db.prepare('UPDATE community_handouts SET status = \'hidden\', updated_at = ? WHERE id = ?').run(now(), handoutId) }

export function listReports(db) { return db.prepare('SELECT id, handout_id AS handoutId, reason, details, created_at AS createdAt, status FROM community_reports WHERE status = \'open\' ORDER BY created_at ASC').all() }
