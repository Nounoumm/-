import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(path.join(here, 'migrations', '001-community.sql'), 'utf8')

export function createCommunityDb(databasePath = process.env.DATABASE_PATH || path.resolve(here, '../../../data/community.sqlite')) {
  mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(migration)
  return { db, close: () => db.close() }
}
