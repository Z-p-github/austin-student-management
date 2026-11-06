import { DateTime } from 'luxon';
import { hashPassword } from './auth.ts';
import { openDb, transaction } from './db.ts';
import { BUSINESS_ZONE, TRIAL_MINUTES } from './time.ts';
import type { Outcome } from '../src/contracts.ts';

const db = openDb();
const today = DateTime.now().setZone(BUSINESS_ZONE).startOf('day');
const people = [
  'Amelia Chen', 'Oliver Nguyen', 'Mia Patel', 'Leo Wilson', 'Sofia Tran', 'Noah Brown',
  'Isla Martin', 'Lucas Wong', 'Ava Singh', 'Henry Taylor', 'Chloe Zhang', 'Liam Davis',
  'Grace Yu', 'Jack Thomas', 'Ruby Lee', 'Theo Scott', 'Matilda Liu', 'Ethan Park',
  'Zoe Robinson', 'Oscar Wang', 'Evie White', 'Finn Tan', 'Hannah Kim', 'Archie Harris',
  'Ella Green', 'James Young', 'Nina Kelly', 'Sam Zhao',
];
const demoPassword = 'AustinDemo2026!';

try {
  const seeded = transaction(db, () => {
    if (db.prepare('SELECT 1 FROM admins LIMIT 1').get()) return false;
    const insertAdmin = db.prepare('INSERT INTO admins (id, name, email, password_hash) VALUES (?, ?, ?, ?)');
    insertAdmin.run(1, 'Jamie Morgan', 'jamie@example.test', hashPassword(demoPassword));
    insertAdmin.run(2, 'Riley Davis', 'riley@example.test', hashPassword(demoPassword));
    const insertTeacher = db.prepare('INSERT INTO teachers (id, name) VALUES (?, ?)');
    for (const [index, teacher] of ['Alex Campbell', 'Priya Shah', 'Morgan Lee', 'Taylor Nguyen'].entries()) {
      insertTeacher.run(index + 1, teacher);
    }
    const insertStudent = db.prepare(`
      INSERT INTO students (id, owner_id, name, guardian_name, guardian_contact, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTrial = db.prepare(`
      INSERT INTO trials (student_id, teacher_id, starts_at, ends_at, outcome, feedback, followed_at, follow_up_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const outcomes: Outcome[] = ['interested', 'undecided', 'no_show', 'not_proceeding'];
    const feedback = [
      'Engaged in the reading exercise. Family asked about weekday classes.',
      'Participated well and would like to discuss the lesson format before deciding.',
      'The student did not attend the booked trial.',
      'The family said the current timetable would not suit them.',
    ];
    for (const [index, name] of people.entries()) {
      const studentId = index + 1;
      const stage = index % 5;
      const scenario = index % outcomes.length;
      insertStudent.run(studentId, index < 20 ? 1 : 2, name, `Guardian ${studentId}`, `guardian${studentId}@example.test`,
        index % 2 ? 'Interested in after-school sessions.' : 'Asked about a trial before enrolling.',
        today.minus({ days: index + 2 }).toMillis());
      if (stage === 0) continue;
      const day = stage === 1 ? 1 + Math.floor(index / 10) : -1 - Math.floor(index / 10);
      const start = today.plus({ days: day, hours: 9, minutes: (index % 10) * 30 }).toMillis();
      const end = start + TRIAL_MINUTES * 60_000;
      insertTrial.run(studentId, (index % 4) + 1, start, end,
        stage >= 3 ? outcomes[scenario] : null, stage >= 3 ? feedback[scenario] : null,
        stage === 4 ? end + 3_600_000 : null, stage === 4 ? 'Family contacted. Follow-up recorded.' : null);
    }
    return true;
  });
  console.log(seeded ? 'Seeded 28 fictional students, 4 teachers and 2 advisers.' : 'Database already has users. Seed skipped.');
} finally {
  db.close();
}
