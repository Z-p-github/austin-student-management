# Student Desk

A runnable Austin Education take-home slice for education advisers. It covers enquiry intake, trial booking, recording a result and closing the family follow-up. The broader domain, assumptions and page sketch are in [DESIGN.md](DESIGN.md).

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API listens locally on port 3001 and Vite proxies API calls. To serve the production build from one process, run `npm run build && npm start` and open [http://127.0.0.1:3001](http://127.0.0.1:3001).

Seed creates 28 fictional students, four teachers and two advisers. It is safe to rerun on a database that already has users. To get a separate clean demo, set `DB_PATH` to a new local file for both the seed and server commands. The default database is `data/austin.sqlite`.

| Demo account | Email | Password |
| --- | --- | --- |
| Jamie Morgan | `jamie@example.test` | `AustinDemo2026!` |
| Riley Davis | `riley@example.test` | `AustinDemo2026!` |

All business dates are in Australia/Melbourne. The seed includes recent and upcoming trial slots based on the day you run it. The accounts are for a local demo with fictional data.

## Follow-up drafting

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to use Gemini. Override `GEMINI_MODEL` if needed for your account. The server requests JSON schema output and validates the two text fields with Zod. A timeout, provider error, malformed output or absent key yields a labelled local template. Run the app with no key to demonstrate this. The result and follow-up flows also work without asking for a draft.

Only the saved outcome and feedback text go to the model. Leave names and contact details out of feedback. The application uses the suggested text as an editable draft. It does not send messages. The provider key and local database are ignored by Git.

## Demo and verification

1. Sign in as Jamie. Create a new enquiry and book a future trial. Try booking a second student with the same teacher and overlapping time.
2. Filter to **Results due**, open a seeded past trial, and record an outcome and short feedback.
3. Request a follow-up suggestion, review the draft, then enter a contact note and mark the follow-up complete.
4. Sign in as Riley and observe that the student list changes.

`npm test` runs the workflow through HTTP against a real SQLite database, including anonymous access, cross-adviser access, duplicate and overlapping bookings, adjacent slots, invalid transitions, date conversion, and invalid or unavailable LLM output. Use `npm run build` for type checking and the production bundle. A seeded past trial lets the demo show the result and follow-up steps without waiting for a new booking to finish.

## Code walkthrough

- `server/app.ts` contains authenticated routes, state transitions and booking overlap checks.
- `server/db.ts` defines relational constraints and the write transaction. Storing UTC instants keeps interval checks independent of the host time zone.
- `server/follow-up.ts` handles the provider, schema validation and local templates.
- `src/main.tsx` and `src/components.tsx` contain the adviser workspace and its action forms.

## AI-assisted work

Codex helped read the brief, compare possible slices, draft the design and implement and verify the code. We considered a teacher attendance and credit-deduction demo but chose the trial queue because it addresses missed follow-up and can be exercised end to end within the time box. Teacher dashboards, automatic reminders and automated sending were left out of the implementation. An editable draft with a local fallback keeps the adviser in control and the workflow usable if the provider fails.
