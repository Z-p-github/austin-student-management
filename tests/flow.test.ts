import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../server/app.ts';
import { hashPassword } from '../server/auth.ts';
import { openDb } from '../server/db.ts';
import { draftFollowUp } from '../server/follow-up.ts';
import { parseMelbourneSlot } from '../server/time.ts';

test('a trial goes from enquiry to follow-up while direct requests enforce ownership and sequence', async (t) => {
  let now = Date.parse('2026-11-06T01:00:00Z');
  const db = openDb(':memory:');
  const password = 'test-only-password';
  const insertAdmin = db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)');
  insertAdmin.run('Jamie', 'jamie@example.test', hashPassword(password));
  insertAdmin.run('Riley', 'riley@example.test', hashPassword(password));
  db.exec("INSERT INTO teachers (name) VALUES ('Alex'), ('Priya')");
  const server = createApp({ db, now: () => now, draftProvider: async () => ({ invalid: 'shape' }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve) => server.close(() => {
    db.close();
    resolve();
  })));

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  function request(path: string, cookie?: string, body?: object) {
    return fetch(base + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function signIn(email: string) {
    const response = await request('/login', undefined, { email, password });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.ok(cookie?.includes('HttpOnly'));
    return cookie!.split(';')[0];
  }

  assert.equal((await request('/workspace')).status, 401);
  const jamie = await signIn('jamie@example.test');
  const riley = await signIn('riley@example.test');
  const enquiry = { name: 'Test Student', guardianName: 'Test Guardian', guardianContact: 'parent@example.test' };
  const created = await request('/students', jamie, enquiry);
  assert.equal(created.status, 201);
  const { student } = await created.json();
  const path = `/students/${student.id}`;
  assert.equal((await request(path, riley)).status, 404);
  assert.deepEqual((await (await request('/workspace', riley)).json()).students, []);

  const slot = { teacherId: 1, date: '2026-11-06', time: '13:00' };
  assert.equal((await request(path + '/trials', riley, slot)).status, 404);
  assert.equal((await request(path + '/trials', jamie, { ...slot, time: '10:00' })).status, 400);
  const bookings = await Promise.all([
    request(path + '/trials', jamie, slot),
    request(path + '/trials', jamie, { ...slot, teacherId: 2 }),
  ]);
  assert.deepEqual(bookings.map((res) => res.status).sort(), [201, 409]);
  const { student: scheduled } = await bookings.find((res) => res.status === 201)!.json();
  assert.equal(scheduled.trial.startsAt, '2026-11-06T02:00:00.000Z');
  const trialPath = `${path}/trials/${scheduled.trial.id}`;

  const second = await request('/students', riley, { ...enquiry, name: 'Other student' });
  const { student: otherStudent } = await second.json();
  const otherTrials = `/students/${otherStudent.id}/trials`;
  const occupiedSlot = { ...slot, teacherId: scheduled.trial.teacher.id };
  assert.equal((await request(otherTrials, riley, { ...occupiedSlot, time: '13:15' })).status, 409);
  assert.equal((await request(otherTrials, riley, { ...occupiedSlot, time: '13:30' })).status, 201);

  const result = { outcome: 'interested', feedback: 'Asked about a weekday class.' };
  assert.equal((await request(trialPath + '/result', jamie, result)).status, 409);
  assert.equal((await request(trialPath + '/follow-up', jamie, { note: 'Called.' })).status, 409);
  now = Date.parse('2026-11-06T02:30:00Z');
  assert.equal((await request(trialPath + '/result', riley, result)).status, 404);
  assert.equal((await request(trialPath + '/result', jamie, { ...result, outcome: 'unknown' })).status, 400);
  assert.equal((await request(trialPath + '/result', jamie, result)).status, 200);
  assert.equal((await request(trialPath + '/result', jamie, result)).status, 409);
  const draft = await request(trialPath + '/draft', jamie, {});
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).draft.source, 'template');

  const completed = await request(trialPath + '/follow-up', jamie, { note: 'Family contacted about Tuesday class.' });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).student.trial.followedAt, new Date(now).toISOString());
  assert.equal((await request(trialPath + '/follow-up', jamie, { note: 'Duplicate.' })).status, 409);
  assert.equal((await request('/logout', jamie, {})).status, 204);
  assert.equal((await request('/workspace', jamie)).status, 401);
});

test('Melbourne dates use seasonal UTC offsets and reject skipped or repeated wall times', () => {
  assert.equal(new Date(parseMelbourneSlot('2026-01-15', '09:00')!.start).toISOString(), '2026-01-14T22:00:00.000Z');
  assert.equal(new Date(parseMelbourneSlot('2026-07-15', '09:00')!.start).toISOString(), '2026-07-14T23:00:00.000Z');
  assert.equal(parseMelbourneSlot('2026-10-04', '02:15'), null);
  assert.equal(parseMelbourneSlot('2026-04-05', '02:15'), null);
  assert.equal(parseMelbourneSlot('2026-02-30', '09:00'), null);
});

test('follow-up drafts accept validated output and keep a usable template when the model fails', async () => {
  const trial = { outcome: 'undecided' as const, feedback: 'Interested in the class format.' };
  const good = { nextStep: 'Call the family.', parentMessage: 'Would you like to discuss the class format?' };
  assert.deepEqual(await draftFollowUp(trial, async () => good), { ...good, source: 'ai' });
  const invalid = await draftFollowUp(trial, async () => ({ ...good, parentMessage: '' }));
  assert.equal(invalid.source, 'template');
  assert.ok(invalid.parentMessage.length > 20);
  assert.deepEqual(await draftFollowUp(trial, async () => { throw new Error('timeout'); }), invalid);
});
