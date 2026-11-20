import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export function createCommunityDb(databasePath = process.env.DATABASE_PATH || path.resolve(here, '../../../data/community.sqlite')) {
  const onDisk = databasePath !== ':memory:'
  if (onDisk) mkdirSync(path.dirname(databasePath), { recursive: true })
  const existed = onDisk && existsSync(databasePath)
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  try {
    const hasVersions = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
    const applied = new Set(hasVersions ? db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name) : [])
    const migrations = readdirSync(path.join(here, 'migrations')).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
    const pending = migrations.filter((name) => !applied.has(name))
    // VACUUM INTO creates a consistent snapshot including any WAL data before schema changes.
    if (existed && pending.length) {
      const backup = `${databasePath}.backup-${Date.now()}-${Math.random().toString(16).slice(2)}`
      db.prepare('VACUUM INTO ?').run(backup)
    }
    for (const name of pending) {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
        db.exec(readFileSync(path.join(here, 'migrations', name), 'utf8'))
        db.prepare('INSERT INTO schema_migrations(name,applied_at) VALUES (?,?)').run(name, new Date().toISOString())
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    }
  } catch (error) { db.close(); throw error }
  return { db, close: () => db.close() }
}
