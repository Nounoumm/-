import { randomUUID } from 'node:crypto'
import { AccountError, sanitizePrivateSpec } from './private-history.js'
import { createManageToken, matchesManageToken } from '../lib/tokens.js'

export function createAccountShareService(db) {
  const parse = (row) => ({ id: row.id, title: row.title, spec: JSON.parse(row.spec_json), topic: row.topic, tags: JSON.parse(row.tags_json), displayName: row.display_name || '', status: row.status, createdAt: row.created_at, updatedAt: row.updated_at })
  const owned = (owner, id) => { const row = db.prepare('SELECT * FROM community_handouts WHERE id=? AND owner_id=?').get(id, owner); if (!row) throw new AccountError(404, '分享不存在。', 'NOT_FOUND'); return row }
  const content = (data) => {
    const spec = sanitizePrivateSpec(data.spec), displayName = data.displayName || '', tags = data.tags || []
    if (typeof displayName !== 'string' || displayName.length > 60 || !Array.isArray(tags) || tags.length > 10 || tags.some((v) => typeof v !== 'string' || v.length > 30)) throw new AccountError(400, '分享名称或标签无效。')
    return { spec, title: spec.meta.title.slice(0, 160), displayName: displayName.trim(), tags: [...new Set(tags.map((v) => v.trim()).filter(Boolean))] }
  }
  return {
    list(owner) { return { items: db.prepare('SELECT * FROM community_handouts WHERE owner_id=? ORDER BY updated_at DESC,id DESC').all(owner).map(parse) } },
    publish(owner, data) {
      if (data.confirmPublic !== true) throw new AccountError(400, '请确认公开发布及资料分享权限。')
      const value = content(data), id = randomUUID(), time = new Date().toISOString()
      // Account shares do not disclose a bearer management token; only the authenticated owner can manage.
      db.prepare('INSERT INTO community_handouts(id,spec_json,title,topic,tags_json,display_name,manage_digest,status,created_at,updated_at,owner_id) VALUES(?,?,?,?,?,?,?,\'visible\',?,?,?)').run(id, JSON.stringify(value.spec), value.title, value.title, JSON.stringify(value.tags), value.displayName, createManageToken().digest, time, time, owner)
      return parse(owned(owner, id))
    },
    update(owner, id, data) {
      const row = owned(owner, id)
      if (row.status !== 'visible') throw new AccountError(409, '分享已被隐藏或撤回，不能重新公开。', 'SHARE_NOT_VISIBLE')
      const value = content(data)
      db.prepare('UPDATE community_handouts SET spec_json=?,title=?,topic=?,tags_json=?,display_name=?,updated_at=? WHERE id=? AND owner_id=? AND status=\'visible\'').run(JSON.stringify(value.spec), value.title, value.title, JSON.stringify(value.tags), value.displayName, new Date().toISOString(), id, owner)
      return parse(owned(owner, id))
    },
    withdraw(owner, id) { owned(owner, id); db.prepare('UPDATE community_handouts SET status=\'withdrawn\',updated_at=? WHERE id=? AND owner_id=?').run(new Date().toISOString(), id, owner) },
    claim(owner, id, token) {
      const row = db.prepare('SELECT * FROM community_handouts WHERE id=?').get(id)
      if (!row || row.owner_id || typeof token !== 'string' || !matchesManageToken(token, row.manage_digest)) throw new AccountError(404, '无法认领此分享。', 'CLAIM_FAILED')
      const result = db.prepare('UPDATE community_handouts SET owner_id=?,manage_digest=?,updated_at=? WHERE id=? AND owner_id IS NULL').run(owner, createManageToken().digest, new Date().toISOString(), id)
      if (result.changes !== 1) throw new AccountError(409, '分享已被认领。', 'CLAIM_FAILED')
      return parse(owned(owner, id))
    },
  }
}
