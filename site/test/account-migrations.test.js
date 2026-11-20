// @vitest-environment node
import { test, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCommunityDb } from '../server/db/index.js'

test('upgrades existing community database with a backup and does not reapply migrations', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'handout-migration-'))
  const databasePath = path.join(directory, 'community.sqlite')
  let handle
  try {
    const previous = new DatabaseSync(databasePath)
    previous.exec(readFileSync(new URL('../server/db/migrations/001-community.sql', import.meta.url), 'utf8'))
    previous.prepare("INSERT INTO community_handouts VALUES (?,?,?,?,?,?,?,'visible',?,?)").run('original', '{}', '旧讲义', '主题', '[]', '', 'digest', '2026-11-19', '2026-11-19')
    previous.close()
    handle = createCommunityDb(databasePath)
    expect(handle.db.prepare('SELECT title,owner_id FROM community_handouts WHERE id=?').get('original')).toMatchObject({ title: '旧讲义', owner_id: null })
    expect(handle.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count).toBe(3)
    const backups = readdirSync(directory).filter((name) => name.includes('.backup-'))
    expect(backups).toHaveLength(1)
    const backup = new DatabaseSync(path.join(directory, backups[0]), { readOnly: true })
    expect(backup.prepare('SELECT title FROM community_handouts').get().title).toBe('旧讲义')
    expect(backup.prepare("SELECT 1 FROM sqlite_master WHERE name='users'").get()).toBeUndefined()
    backup.close(); handle.close(); handle = createCommunityDb(databasePath)
    expect(readdirSync(directory).filter((name) => name.includes('.backup-'))).toHaveLength(1)
    expect(handle.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count).toBe(3)
  } finally { handle?.close(); rmSync(directory, { recursive: true, force: true }) }
})

test('deleting private handouts cascades revisions and source import mappings', () => {
  const handle = createCommunityDb(':memory:'); const db = handle.db
  try {
    db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES (?,?,?,?)').run('u', 'u@example.com', 'hash', '2026-11-20')
    db.prepare('INSERT INTO private_handouts VALUES (?,?,?,?,?,?,?,NULL)').run('h','u','title','{}',1,'2026-11-20','2026-11-20')
    db.prepare('INSERT INTO handout_revisions VALUES (?,?,?,?,?,?)').run('h','u',1,'{}','title','2026-11-20')
    db.prepare('INSERT INTO history_imports VALUES (?,?,?)').run('u','local','h')
    db.prepare('DELETE FROM private_handouts WHERE id=?').run('h')
    expect(db.prepare('SELECT COUNT(*) AS count FROM handout_revisions').get().count).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM history_imports').get().count).toBe(0)
  } finally { handle.close() }
})

test('upgrade invalidates legacy verification links without credential binding', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'handout-credential-migration-'))
  const databasePath = path.join(directory, 'community.sqlite'); let handle
  try {
    const previous = new DatabaseSync(databasePath)
    for (const migration of ['001-community.sql', '002-account-sync.sql']) {
      previous.exec(readFileSync(new URL(`../server/db/migrations/${migration}`, import.meta.url), 'utf8'))
    }
    previous.exec('CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)')
    previous.prepare('INSERT INTO schema_migrations VALUES (?,?)').run('001-community.sql', '2026-11-20')
    previous.prepare('INSERT INTO schema_migrations VALUES (?,?)').run('002-account-sync.sql', '2026-11-20')
    previous.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES (?,?,?,?)').run('u', 'u@example.com', 'unverified-hash', '2026-11-20')
    previous.prepare('INSERT INTO auth_tokens(id,user_id,token_digest,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?)').run('v', 'u', 'legacy-digest', 'verify', '2099-01-01', '2026-11-20')
    previous.close(); handle = createCommunityDb(databasePath)
    const legacy = handle.db.prepare('SELECT * FROM auth_tokens WHERE id=?').get('v')
    expect(legacy.used_at).not.toBeNull()
    expect(legacy.pending_password_hash).toBeNull()
    expect(handle.db.prepare('SELECT verified_at FROM users WHERE id=?').get('u').verified_at).toBeNull()
  } finally { handle?.close(); rmSync(directory, { recursive: true, force: true }) }
})
