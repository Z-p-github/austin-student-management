import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api, errorText } from './api.ts';
import { outcomeLabels, outcomes } from './contracts.ts';
import type { Admin, FollowUpDraft, Stage, Student, Teacher } from './contracts.ts';

const paths = {
  logo: 'M12 3 3 7.5 12 12l9-4.5L12 3ZM6 10v6l6 3 6-3v-6M21 8v6',
  add: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  chevron: 'm9 6 6 6-6 6',
  search: 'm20 20-4-4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-2-12a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm-2 5h18M8 3v4m8-4v4m-8 8h3',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M18 6 6 18',
  logout: 'M10 17l5-5-5-5m5 5H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7',
  sparkle: 'm12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2ZM20 15l.8 2.2L23 18l-2.2.8L20 21l-.8-2.2L17 18l2.2-.8L20 15Z',
  inbox: 'M5 4h14l3 10v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5L5 4Zm-3 10h6l2 3h4l2-3h6',
  shield: 'M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Zm-3-10 2 2 4-4',
} as const;

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}

export function Logo() {
  return <div className="brand"><span className="brand-mark"><Icon name="logo" size={23} /></span>
    <span>Student Desk<small>Austin Education</small></span></div>;
}

export const stageLabels: Record<Stage, string> = {
  enquiry: 'New enquiry',
  scheduled: 'Trial booked',
  awaiting_result: 'Result due',
  follow_up: 'Follow-up due',
  completed: 'Followed up',
};

export function Badge({ stage }: { stage: Stage }) {
  return <span className={`badge badge-${stage}`}><span />{stageLabels[stage]}</span>;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export const melbourneDate = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', weekday: 'short',
});

const melbourneClock = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit',
});

const melbourneInput = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
});

function inputDate(now: number) {
  const fields = Object.fromEntries(melbourneInput.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function displaySlot(start: string, end: string) {
  return `${melbourneDate.format(new Date(start))} · ${melbourneClock.format(new Date(start))}–${melbourneClock.format(new Date(end))}`;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <p className="error-box" role="alert">{children}</p>;
}

function useSubmit(onSave: (student: Student, message: string) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>, path: string, body: object, message: string) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const { student } = await api<{ student: Student }>(path, body);
      onSave(student, message);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  }
  return { submit, pending, error };
}

export function Login({ onLogin }: { onLogin: (admin: Admin) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const { admin } = await api<{ admin: Admin }>('/login', { email, password });
      onLogin(admin);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  }

  return <main className="login-layout">
    <section className="login-feature">
      <Logo />
      <div className="login-feature-body"><p className="overline">ADVISER WORKSPACE</p>
        <h1>Keep every<br />student in sight.</h1>
        <p>From the first enquiry to the next conversation, see what needs your attention.</p>
        <div className="mini-workflow"><span>Enquiry</span><Icon name="chevron" size={14} /><span>Trial</span><Icon name="chevron" size={14} /><span>Follow-up</span></div>
      </div>
      <div className="login-foot"><Icon name="clock" size={16} /> Melbourne time · Australia</div>
    </section>
    <section className="login-panel">
      <form className="login-form" onSubmit={signIn}>
        <p className="overline">AUSTIN EDUCATION</p><h2>Sign in</h2>
        <p className="muted">Open your student workspace.</p>
        <label>Work email<input required autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
        <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button className="button primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}<Icon name="arrow" size={17} /></button>
        <button className="button secondary demo-button" type="button" disabled={pending} onClick={() => {
          setEmail('jamie@example.test');
          setPassword('AustinDemo2026!');
        }}>Fill demo credentials</button>
      </form>
    </section>
  </main>;
}

export function EnquiryDialog({ onClose, onSave }: { onClose: () => void; onSave: (student: Student, message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { submit, pending, error } = useSubmit(onSave);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return <dialog ref={dialog} className="dialog" aria-labelledby="enquiry-title" onCancel={(event) => {
    event.preventDefault();
    if (!pending) onClose();
  }}>
    <div className="dialog-header"><div><p className="overline">STUDENT PIPELINE</p><h2 id="enquiry-title">New enquiry</h2></div>
      <button type="button" className="icon-button" aria-label="Close enquiry" disabled={pending} onClick={onClose}><Icon name="close" /></button></div>
    <form onSubmit={(event) => submit(event, '/students', Object.fromEntries(new FormData(event.currentTarget)), 'Enquiry created.')}>
      <label>Student name<input name="name" autoFocus required maxLength={100} placeholder="e.g. Amelia Chen" /></label>
      <label>Parent or guardian<input name="guardianName" required maxLength={100} /></label>
      <label>Guardian contact<input name="guardianContact" required minLength={3} maxLength={160} placeholder="Email or phone number" /></label>
      <label>Enquiry notes <span className="optional">optional</span><textarea name="notes" rows={3} maxLength={700} placeholder="What is the family looking for?" /></label>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose} disabled={pending}>Cancel</button>
        <button className="button primary" disabled={pending}>{pending ? 'Saving…' : 'Create enquiry'}</button></div>
    </form>
  </dialog>;
}

interface DetailProps {
  student: Student;
  stage: Stage;
  teachers: Teacher[];
  now: number;
  onSave: (student: Student, message: string) => void;
  onClose: () => void;
}

function BookTrial({ student, teachers, now, onSave }: DetailProps) {
  const { submit, pending, error } = useSubmit(onSave);
  return <form className="action-form" onSubmit={(event) => {
    const fields = new FormData(event.currentTarget);
    void submit(event, `/students/${student.id}/trials`, {
      teacherId: Number(fields.get('teacherId')), date: fields.get('date'), time: fields.get('time'),
    }, 'Trial booked.');
  }}>
    <h3>Book a trial</h3><p className="muted">30-minute lesson · Melbourne time</p>
    <label>Teacher<select name="teacherId" required defaultValue=""><option value="" disabled>Select a teacher</option>
      {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
    <div className="two-fields"><label>Date<input type="date" name="date" min={inputDate(now)} required /></label>
      <label>Start time<input type="time" name="time" required /></label></div>
    {error && <ErrorBox>{error}</ErrorBox>}
    <button className="button primary" disabled={pending || !teachers.length}>{pending ? 'Booking…' : 'Book trial'}<Icon name="calendar" size={17} /></button>
  </form>;
}

function RecordResult({ student, onSave }: DetailProps) {
  const { submit, pending, error } = useSubmit(onSave);
  const trial = student.trial!;
  return <form className="action-form" onSubmit={(event) => submit(event, `/students/${student.id}/trials/${trial.id}/result`,
    Object.fromEntries(new FormData(event.currentTarget)), 'Trial result recorded.')}>
    <h3>Record trial result</h3><p className="muted">Summarise what happened and the family’s interest.</p>
    <label>Outcome<select name="outcome" required defaultValue=""><option value="" disabled>Select an outcome</option>
      {outcomes.map((outcome) => <option key={outcome} value={outcome}>{outcomeLabels[outcome]}</option>)}</select></label>
    <label>Feedback<textarea name="feedback" rows={4} required maxLength={700} placeholder="Describe the session. Leave out names and contact details." /></label>
    {error && <ErrorBox>{error}</ErrorBox>}
    <button className="button primary" disabled={pending}>{pending ? 'Saving…' : 'Save result'}<Icon name="check" size={18} /></button>
  </form>;
}

function FollowUp({ student, onSave }: DetailProps) {
  const { submit, pending, error } = useSubmit(onSave);
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [message, setMessage] = useState('');
  const trialPath = `/students/${student.id}/trials/${student.trial!.id}`;

  async function generate() {
    setDrafting(true);
    setDraftError('');
    try {
      const { draft } = await api<{ draft: FollowUpDraft }>(trialPath + '/draft', {});
      setDraft(draft);
      setMessage(draft.parentMessage);
    } catch (cause) {
      setDraftError(errorText(cause));
    } finally {
      setDrafting(false);
    }
  }

  return <form className="action-form" onSubmit={(event) => submit(event, trialPath + '/follow-up',
    { note: new FormData(event.currentTarget).get('note') }, 'Follow-up completed.')}>
    <h3>Follow up with family</h3>
    <p className="muted">Contact the family, then record what you did here.</p>
    <div className="draft-box">
      <button type="button" className="button secondary draft-button" disabled={drafting || pending || !!draft} onClick={generate}>
        <Icon name="sparkle" size={17} />{drafting ? 'Preparing draft…' : 'Suggest follow-up'}
      </button>
      {draftError && <ErrorBox>{draftError}</ErrorBox>}
      {draft && <>
        <p className="draft-source">{draft.source === 'ai' ? 'AI suggestion' : 'Template suggestion'}</p>
        <p className="next-step">{draft.nextStep}</p>
        <label>Message draft<textarea value={message} rows={4} onChange={(event) => setMessage(event.target.value)} /></label>
        <p className="muted">Review and copy the message to your usual channel.</p>
      </>}
    </div>
    <label>Follow-up note<textarea name="note" rows={3} required maxLength={1000} placeholder="e.g. Called guardian and agreed to discuss Tuesday classes." /></label>
    {error && <ErrorBox>{error}</ErrorBox>}
    <button className="button primary" disabled={pending}>{pending ? 'Saving…' : 'Mark as followed up'}<Icon name="check" size={18} /></button>
  </form>;
}

export function Detail(props: DetailProps) {
  const { student, stage, onClose } = props;
  const trial = student.trial;
  return <aside className="detail" aria-labelledby="student-title">
    <div className="detail-heading">
      <span className="avatar large">{initials(student.name)}</span>
      <button type="button" className="icon-button" aria-label="Close student details" onClick={onClose}><Icon name="close" /></button>
      <h2 id="student-title">{student.name}</h2><Badge stage={stage} />
    </div>
    <dl className="detail-facts"><div><dt>Guardian</dt><dd>{student.guardianName}</dd></div>
      <div><dt>Contact</dt><dd>{student.guardianContact}</dd></div>
      {student.notes && <div><dt>Enquiry notes</dt><dd>{student.notes}</dd></div>}</dl>
    {trial && <div className="trial-facts">
      <span className="fact-icon"><Icon name="calendar" size={18} /></span>
      <div><strong>{displaySlot(trial.startsAt, trial.endsAt)}</strong><p>{trial.teacher.name} · Trial lesson</p></div>
    </div>}
    {trial?.outcome && <div className="outcome"><p className="overline">TRIAL RESULT</p><strong>{outcomeLabels[trial.outcome]}</strong><p>{trial.feedback}</p></div>}
    {stage === 'enquiry' && <BookTrial {...props} />}
    {stage === 'scheduled' && <p className="note"><Icon name="clock" size={17} /> The result form opens when the lesson ends.</p>}
    {stage === 'awaiting_result' && <RecordResult {...props} />}
    {stage === 'follow_up' && <FollowUp {...props} />}
    {stage === 'completed' && <><div className="done-box"><Icon name="check" size={19} /><div><strong>Follow-up complete</strong><p>{trial?.followUpNote}</p></div></div><BookTrial {...props} /></>}
  </aside>;
}
