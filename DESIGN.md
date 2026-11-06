# Student Desk design

## Who needs what

An adviser owns the next action for a family. Their queue should answer who needs a trial booked, whose trial needs a result, and who still needs a call. The teacher needs today's session list, who is new, and a place to record attendance and feedback. The guardian is the contact and typically the payer. The student is the learner. A trial is a decision point before enrolment and does not consume prepaid credit.

The first release should follow a student from enquiry through trial, enrolment, attendance and renewal. Build the enquiry-to-follow-up path first because its result and contact history are frequently lost between tools. The demo starts at enquiry and ends when an adviser records contacting the family. Enrolment, teacher login, recurring class scheduling, payments, refunds, renewal alerts, SMS and email sending are outside this slice.

## Data model

| Entity | Relationships and fields |
| --- | --- |
| Adviser and session | One adviser owns many students. A session references the adviser and stores a token hash and expiry. Ownership is on the student, so a future transfer can preserve all trial history. |
| Student | Owner, learner name, guardian name/contact, enquiry notes, creation time. One contact per student in the slice. A separate guardian and student/guardian join can support siblings and multiple contacts later. |
| Teacher and trial | A teacher has many trials. Each trial belongs to one student and stores its start/end, outcome, feedback, follow-up timestamp and note. The latest trial determines the student's queue stage. Earlier trials remain in the database. |
| Class, session and enrolment (planned) | A class defines a recurring local time and teacher. A session is a dated occurrence with its own actual time and teacher, so a cover teacher or cancellation affects one occurrence. Enrolment joins students and classes, allowing concurrent classes. Attendance joins student and session. |
| Credit ledger (planned) | Signed units linked to a student. Purchase adds units. Chargeable attendance subtracts a unit once per session. Refund and correction append linked entries. Balance is the sum of entries. Deduction and attendance update occur in one transaction, guarded against double charges and insufficient credit. |

## Rules and enforcement

| Rule | Enforcement |
| --- | --- |
| Advisers can only read and write their own students and trials. | Session authentication and owner-scoped queries in every student endpoint. |
| A student can have one unfinished trial and follow-up at a time. A new trial can be booked after closing the previous follow-up. | Service check in a write transaction, plus a partial unique index on unfinished trials. |
| The same teacher cannot have overlapping trial bookings across advisers. Adjacent slots are allowed. | Service checks half-open intervals, then inserts under SQLite's write lock. |
| New trials start in the future and last 30 minutes. Local times must exist and have a single UTC equivalent. | Server parses Melbourne input and stores UTC instants. The database enforces end after start and foreign keys. |
| A result can be recorded only after the trial ends, and only once. | Service checks the current trial, end time and outcome in a transaction. The database constrains the allowed outcome values. |
| A follow-up requires a saved outcome, a note and an open trial. | Service checks the transition in a transaction. Database checks enforce consistent outcome and follow-up fields. |

## Assumptions and questions

The adviser books and records trial outcomes. Teachers are seeded resources and the check covers trials booked in this system. Ownership is exclusive. Follow-up records work done in the adviser's existing channel. No trial reschedule, cancellation or transfer UI is in the demo. All business times use Australia/Melbourne. The five questions I would ask before extending the slice:

1. Who owns a student when the adviser is away, and who can transfer that student?
2. How many trials may a student attend, and what are the reschedule and no-show policies?
3. Which rooms, teacher rosters and regular sessions must count as booking conflicts?
4. Which attendance outcomes consume credit, and how do refunds, exceptions and corrections work?
5. What counts as a completed follow-up, who is accountable, and when should it escalate?

## Pages and task entry

The adviser lands on the work queue. New enquiry takes one click to open. Booking, recording a result and following up take a queue filter and a student selection. The panel shows the current action alongside the guardian and trial facts. The planned teacher landing page puts today's sessions first, with one click to a roster. Future enrolment and credit activity can live under the student detail.

```text
Adviser home                                   Selected student
┌────────────────────────── [ + New enquiry ] ┐ ┌──────────────────────┐
│ All students | Booked | Results due | Follow │ │ Name · Follow-up due │
│ Filters                         Search [__] │ │ Guardian / contact   │
│ Student        Status          Trial        │ │ Trial / result       │
│ Leo Wilson     Follow-up due   Thu 10:30    │ │ [Suggest follow-up]  │
│ Mia Patel      Result due      Thu 10:00    │ │ Note [____________]  │
└─────────────────────────────────────────────┘ │ [Mark as followed up]│
                                                └──────────────────────┘
Planned teacher home → Today's classes → Roster → Attendance + feedback
```

The optional drafting action uses the saved outcome and feedback to suggest a next step and family message. A server schema validates both strings and an outcome-specific template covers timeout, missing credentials or invalid responses. The adviser can edit the message and record the outcome of their contact even if drafting fails.
