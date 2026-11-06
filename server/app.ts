import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { outcomes } from '../src/contracts.ts';
import type { Admin, Outcome, Student, Teacher } from '../src/contracts.ts';
import { authenticate, createSession, readToken, removeSession, sessionAdmin, SESSION_COOKIE, SESSION_MS } from './auth.ts';
import { transaction } from './db.ts';
import { draftFollowUp } from './follow-up.ts';
import type { DraftProvider } from './follow-up.ts';
import { parseMelbourneSlot } from './time.ts';

const loginInput = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
const studentInput = z.object({
  name: z.string().trim().min(1).max(100),
  guardianName: z.string().trim().min(1).max(100),
  guardianContact: z.string().trim().min(3).max(160),
  notes: z.string().trim().max(700).default(''),
});
const slotInput = z.object({
  teacherId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});
const resultInput = z.object({ outcome: z.enum(outcomes), feedback: z.string().trim().min(1).max(700) });
const followUpInput = z.object({ note: z.string().trim().min(1).max(1000) });

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function input<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.join('.');
  throw new HttpError(400, field ? `Check the ${field} field: ${issue.message}` : 'Send a valid JSON request.');
}

function id(value: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number <= 0) {
    throw new HttpError(404, 'Record not found.');
  }
  return number;
}

function requireAdmin(res: Response): Admin {
  const admin = res.locals.admin as Admin | null;
  if (!admin) throw new HttpError(401, 'Please sign in.');
  return admin;
}

interface StudentRow {
  id: number;
  name: string;
  guardian_name: string;
  guardian_contact: string;
  notes: string;
  created_at: number;
  trial_id: number | null;
  teacher_id: number | null;
  teacher_name: string | null;
  starts_at: number | null;
  ends_at: number | null;
  outcome: Outcome | null;
  feedback: string | null;
  followed_at: number | null;
  follow_up_note: string | null;
}

const studentQuery = `
  SELECT s.id, s.name, s.guardian_name, s.guardian_contact, s.notes, s.created_at,
    t.id AS trial_id, t.teacher_id, teacher.name AS teacher_name, t.starts_at, t.ends_at,
    t.outcome, t.feedback, t.followed_at, t.follow_up_note
  FROM students s
  LEFT JOIN trials t ON t.id = (SELECT MAX(id) FROM trials WHERE student_id = s.id)
  LEFT JOIN teachers teacher ON teacher.id = t.teacher_id
  WHERE s.owner_id = ?
`;

function iso(time: number): string {
  return new Date(time).toISOString();
}

function studentView(row: StudentRow): Student {
  const { trial_id, teacher_id, teacher_name, starts_at, ends_at } = row;
  const trial = trial_id !== null && teacher_id !== null && teacher_name !== null && starts_at !== null && ends_at !== null
    ? {
      id: trial_id,
      teacher: { id: teacher_id, name: teacher_name },
      startsAt: iso(starts_at),
      endsAt: iso(ends_at),
      outcome: row.outcome,
      feedback: row.feedback,
      followedAt: row.followed_at === null ? null : iso(row.followed_at),
      followUpNote: row.follow_up_note,
    }
    : null;
  return {
    id: row.id,
    name: row.name,
    guardianName: row.guardian_name,
    guardianContact: row.guardian_contact,
    notes: row.notes,
    createdAt: iso(row.created_at),
    trial,
  };
}

function ownedStudent(db: DatabaseSync, owner: number, student: number): StudentRow {
  const row = db.prepare(`${studentQuery} AND s.id = ?`).get(owner, student) as unknown as StudentRow | undefined;
  if (!row) throw new HttpError(404, 'Student not found.');
  return row;
}

function ownedTrial(db: DatabaseSync, owner: number, studentId: number, trialId: number): StudentRow {
  const row = ownedStudent(db, owner, studentId);
  if (row.trial_id !== trialId) throw new HttpError(404, 'Current trial not found.');
  return row;
}

interface AppOptions {
  db: DatabaseSync;
  now?: () => number;
  draftProvider?: DraftProvider;
  publicDir?: string;
  secureCookie?: boolean;
}

export function createApp({ db, now = Date.now, draftProvider, publicDir, secureCookie = false }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        if (new URL(origin).host !== req.get('host')) throw new Error('Origin mismatch');
      } catch {
        return next(new HttpError(403, 'This request must come from Student Desk.'));
      }
    }
    next();
  }, express.json({ limit: '16kb' }));
  app.use('/api', (req, res, next) => {
    const token = readToken(req.get('cookie'));
    res.locals.token = token;
    res.locals.admin = sessionAdmin(db, token, now());
    next();
  });

  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: secureCookie, path: '/' };

  app.post('/api/login', (req, res) => {
    const { email, password } = input(loginInput, req.body);
    const admin = authenticate(db, email, password);
    if (!admin) throw new HttpError(401, 'Email or password is incorrect.');
    removeSession(db, res.locals.token as string | null);
    const token = createSession(db, admin.id, now());
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS }).json({ admin });
  });

  app.post('/api/logout', (_req, res) => {
    removeSession(db, res.locals.token as string | null);
    res.clearCookie(SESSION_COOKIE, cookieOptions).status(204).end();
  });

  app.get('/api/me', (_req, res) => res.json({ admin: requireAdmin(res) }));

  app.get('/api/workspace', (_req, res) => {
    const admin = requireAdmin(res);
    const students = db.prepare(`${studentQuery} ORDER BY s.created_at DESC, s.id DESC`)
      .all(admin.id) as unknown as StudentRow[];
    const teachers = db.prepare('SELECT id, name FROM teachers ORDER BY name').all() as unknown as Teacher[];
    res.json({ students: students.map(studentView), teachers, now: iso(now()) });
  });

  app.post('/api/students', (req, res) => {
    const admin = requireAdmin(res);
    const { name, guardianName, guardianContact, notes } = input(studentInput, req.body);
    const result = db.prepare(`
      INSERT INTO students (owner_id, name, guardian_name, guardian_contact, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(admin.id, name, guardianName, guardianContact, notes, now());
    res.status(201).json({ student: studentView(ownedStudent(db, admin.id, Number(result.lastInsertRowid))) });
  });

  app.get('/api/students/:studentId', (req, res) => {
    res.json({ student: studentView(ownedStudent(db, requireAdmin(res).id, id(req.params.studentId))) });
  });

  app.post('/api/students/:studentId/trials', (req, res) => {
    const admin = requireAdmin(res);
    const studentId = id(req.params.studentId);
    const { teacherId, date, time } = input(slotInput, req.body);
    const slot = parseMelbourneSlot(date, time);
    if (!slot) throw new HttpError(400, 'Choose a valid, unambiguous Melbourne date and time.');
    transaction(db, () => {
      const student = ownedStudent(db, admin.id, studentId);
      if (slot.start <= now()) throw new HttpError(400, 'Choose a trial time in the future.');
      if (student.trial_id !== null && student.followed_at === null) {
        throw new HttpError(409, 'Finish the current trial and its follow-up before booking another.');
      }
      if (!db.prepare('SELECT 1 FROM teachers WHERE id = ?').get(teacherId)) {
        throw new HttpError(400, 'Select a teacher from the list.');
      }
      const overlap = db.prepare(`
        SELECT 1 FROM trials WHERE teacher_id = ? AND starts_at < ? AND ends_at > ? LIMIT 1
      `).get(teacherId, slot.end, slot.start);
      if (overlap) throw new HttpError(409, 'This teacher already has a trial at that time.');
      db.prepare('INSERT INTO trials (student_id, teacher_id, starts_at, ends_at) VALUES (?, ?, ?, ?)')
        .run(studentId, teacherId, slot.start, slot.end);
    });
    res.status(201).json({ student: studentView(ownedStudent(db, admin.id, studentId)) });
  });

  app.post('/api/students/:studentId/trials/:trialId/result', (req, res) => {
    const admin = requireAdmin(res);
    const studentId = id(req.params.studentId);
    const trialId = id(req.params.trialId);
    const { outcome, feedback } = input(resultInput, req.body);
    transaction(db, () => {
      const row = ownedTrial(db, admin.id, studentId, trialId);
      if (row.outcome !== null) throw new HttpError(409, 'The outcome has already been recorded.');
      if (row.ends_at === null || row.ends_at > now()) {
        throw new HttpError(409, 'Record the result after the trial ends.');
      }
      db.prepare('UPDATE trials SET outcome = ?, feedback = ? WHERE id = ?').run(outcome, feedback, trialId);
    });
    res.json({ student: studentView(ownedStudent(db, admin.id, studentId)) });
  });

  app.post('/api/students/:studentId/trials/:trialId/draft', async (req, res) => {
    const row = ownedTrial(db, requireAdmin(res).id, id(req.params.studentId), id(req.params.trialId));
    if (!row.outcome || row.feedback === null || row.followed_at !== null) {
      throw new HttpError(409, 'A draft is available after recording an outcome and before completing follow-up.');
    }
    res.json({ draft: await draftFollowUp({ outcome: row.outcome, feedback: row.feedback }, draftProvider) });
  });

  app.post('/api/students/:studentId/trials/:trialId/follow-up', (req, res) => {
    const admin = requireAdmin(res);
    const studentId = id(req.params.studentId);
    const trialId = id(req.params.trialId);
    const { note } = input(followUpInput, req.body);
    transaction(db, () => {
      const row = ownedTrial(db, admin.id, studentId, trialId);
      if (!row.outcome) throw new HttpError(409, 'Record the trial outcome first.');
      if (row.followed_at !== null) throw new HttpError(409, 'Follow-up has already been completed.');
      db.prepare('UPDATE trials SET followed_at = ?, follow_up_note = ? WHERE id = ?')
        .run(now(), note, trialId);
    });
    res.json({ student: studentView(ownedStudent(db, admin.id, studentId)) });
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found.')));
  if (publicDir && existsSync(resolve(publicDir, 'index.html'))) {
    app.use(express.static(publicDir));
    app.get('/', (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    const status = (error as { status?: number } | null)?.status;
    if (status === 400 || status === 413) {
      return res.status(status).json({ error: status === 413 ? 'Request is too large.' : 'Send a valid JSON request.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
