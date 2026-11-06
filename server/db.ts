import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(file = process.env.DB_PATH || 'data/austin.sqlite'): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES admins(id),
      name TEXT NOT NULL,
      guardian_name TEXT NOT NULL,
      guardian_contact TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS students_owner ON students(owner_id, id);
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS trials (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
      outcome TEXT CHECK (outcome IN ('interested', 'undecided', 'not_proceeding', 'no_show')),
      feedback TEXT,
      followed_at INTEGER,
      follow_up_note TEXT,
      CHECK ((outcome IS NULL) = (feedback IS NULL)),
      CHECK ((followed_at IS NULL) = (follow_up_note IS NULL)),
      CHECK (followed_at IS NULL OR (outcome IS NOT NULL AND followed_at >= ends_at))
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS trials_one_unfinished
      ON trials(student_id) WHERE followed_at IS NULL;
    CREATE INDEX IF NOT EXISTS trials_student_history ON trials(student_id, id DESC);
    CREATE INDEX IF NOT EXISTS trials_teacher_slot ON trials(teacher_id, starts_at, ends_at);
  `);
  return db;
}

export function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
