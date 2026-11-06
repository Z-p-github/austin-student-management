import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { geminiProvider } from './follow-up.ts';

const db = openDb();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const server = createApp({
  db,
  draftProvider: geminiProvider(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL),
  publicDir: 'dist',
  secureCookie: process.env.COOKIE_SECURE === '1',
}).listen(port, host, () => console.log(`Student Desk API listening on http://${host}:${port}`));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => db.close()));
}
