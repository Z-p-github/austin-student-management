import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Admin } from '../src/contracts.ts';

export const SESSION_COOKIE = 'austin_session';
export const SESSION_MS = 8 * 60 * 60_000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

const dummyHash = hashPassword('unused');

export function authenticate(db: DatabaseSync, email: string, password: string): Admin | null {
  const row = db.prepare('SELECT * FROM admins WHERE email = ?')
    .get(email.trim().toLowerCase()) as (Admin & { password_hash: string }) | undefined;
  const [salt, expected] = (row?.password_hash ?? dummyHash).split(':');
  const actual = scryptSync(password, salt, 64);
  if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !row) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export function createSession(db: DatabaseSync, adminId: number, now: number): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), adminId, now + SESSION_MS);
  return token;
}

export function readToken(cookie: string | undefined): string | null {
  const value = cookie?.split(';').map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function sessionAdmin(db: DatabaseSync, token: string | null, now: number): Admin | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT a.id, a.name, a.email FROM sessions s
    JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), now);
  return (row as Admin | undefined) ?? null;
}

export function removeSession(db: DatabaseSync, token: string | null): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}
