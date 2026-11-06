import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, api, errorText } from './api.ts';
import { studentStage } from './contracts.ts';
import type { Admin, Stage, Student, Teacher } from './contracts.ts';
import { Badge, Detail, EnquiryDialog, ErrorBox, Icon, Login, Logo, displaySlot, initials, melbourneDate } from './components.tsx';
import './style.css';

type Filter = 'all' | Stage;
type WorkspaceData = { students: Student[]; teachers: Teacher[]; now: string };

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All students' }, { key: 'enquiry', label: 'Enquiries' },
  { key: 'scheduled', label: 'Booked' }, { key: 'awaiting_result', label: 'Results due' },
  { key: 'follow_up', label: 'Follow-up' }, { key: 'completed', label: 'Completed' },
];

function Workspace({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newEnquiry, setNewEnquiry] = useState(false);
  const [message, setMessage] = useState('');
  const [timeOffset, setTimeOffset] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const now = clock + timeOffset;

  useEffect(() => {
    let active = true;
    api<WorkspaceData>('/workspace').then((result) => {
      if (!active) return;
      const clientNow = Date.now();
      setClock(clientNow);
      setTimeOffset(Date.parse(result.now) - clientNow);
      setData(result);
      setError('');
    }).catch((cause) => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onLogout();
      else setError(errorText(cause));
    });
    return () => { active = false; };
  }, [refresh, onLogout]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const records = useMemo(() => (data?.students ?? []).map((student) => ({
    student, stage: studentStage(student.trial, now),
  })), [data, now]);
  const counts = records.reduce<Partial<Record<Stage, number>>>((result, record) => {
    result[record.stage] = (result[record.stage] || 0) + 1;
    return result;
  }, {});
  const needle = query.trim().toLowerCase();
  const visible = records.filter(({ student, stage }) => (filter === 'all' || filter === stage)
    && [student.name, student.guardianName].some((value) => value.toLowerCase().includes(needle)));
  const selection = records.find(({ student }) => student.id === selectedId);

  function save(student: Student, notice: string) {
    setClock(Date.now());
    setData((current) => {
      if (!current) return current;
      const students = current.students.some((row) => row.id === student.id)
        ? current.students.map((row) => row.id === student.id ? student : row)
        : [student, ...current.students];
      return { ...current, students };
    });
    setSelectedId(student.id);
    setNewEnquiry(false);
    setMessage(notice);
    if (filter !== 'all') setFilter(studentStage(student.trial, Date.now() + timeOffset));
  }

  async function signOut() {
    setLogoutError('');
    setLoggingOut(true);
    try {
      await api<void>('/logout', {});
      onLogout();
    } catch (cause) {
      setLogoutError(errorText(cause));
      setLoggingOut(false);
    }
  }

  return <>
    <header className="site-header"><div className="header-inner">
      <Logo />
      <div className="header-user"><span className="avatar user-avatar">{initials(admin.name)}</span>
        <span className="user-name">{admin.name}<small>Education adviser</small></span>
        <button className="icon-button signout" type="button" aria-label="Sign out" title="Sign out" disabled={loggingOut} onClick={signOut}><Icon name="logout" size={19} /></button>
      </div>
    </div></header>
    <main className="workspace">
      <div className="workspace-heading">
        <div><p className="overline">ADVISER WORKSPACE</p><h1>Student pipeline</h1><p className="muted">Manage enquiries, trials and family follow-ups.</p></div>
        <button className="button primary new-enquiry" onClick={() => setNewEnquiry(true)} disabled={!data}><Icon name="add" size={19} /> New enquiry</button>
      </div>
      <div className="workspace-meta"><Icon name="clock" size={16} /> {melbourneDate.format(now)} <span>·</span> Melbourne time</div>
      {logoutError && <ErrorBox>{logoutError}</ErrorBox>}
      {error && <div className="state-panel"><ErrorBox>{error}</ErrorBox><button className="button secondary" onClick={() => { setError(''); setRefresh(refresh + 1); }}>Try again</button></div>}
      {!data && !error && <div className="state-panel" role="status">Loading your workspace…</div>}
      {data && <>
        <div className="stats" aria-label="Student pipeline counts">
          <Stat name="All students" value={records.length} icon="people" selected={filter === 'all'} onClick={() => setFilter('all')} />
          <Stat name="Trial booked" value={counts.scheduled || 0} icon="calendar" selected={filter === 'scheduled'} onClick={() => setFilter('scheduled')} />
          <Stat name="Results due" value={counts.awaiting_result || 0} icon="inbox" selected={filter === 'awaiting_result'} onClick={() => setFilter('awaiting_result')} />
          <Stat name="Follow-up due" value={counts.follow_up || 0} icon="clock" selected={filter === 'follow_up'} onClick={() => setFilter('follow_up')} />
        </div>
        {message && <div className="toast" role="status"><Icon name="check" size={18} />{message}
          <button className="icon-button" type="button" aria-label="Dismiss notification" onClick={() => setMessage('')}><Icon name="close" size={16} /></button></div>}
        <div className={`work-grid${selection ? ' with-detail' : ''}`}>
          <section className="roster" aria-labelledby="roster-title">
            <div className="roster-header"><div><h2 id="roster-title">My students</h2><p className="muted">{visible.length} of {records.length} students</p></div>
              <label className="search"><Icon name="search" size={17} /><input type="search" aria-label="Search students" value={query}
                onChange={(event) => setQuery(event.target.value)} placeholder="Search students" /></label>
            </div>
            <nav className="filters" aria-label="Filter students by stage">
              {filters.map(({ key, label }) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
            </nav>
            {visible.length ? <div className="student-table">
              <div className="table-head" aria-hidden="true"><span>Student</span><span>Status</span><span>Trial</span><span /></div>
              <ul aria-label="Student results">{visible.map(({ student, stage }) => (
                <li key={student.id}>
                  <button className="student-row" aria-pressed={student.id === selectedId} type="button" onClick={() => {
                    setSelectedId(student.id);
                    if (window.matchMedia('(max-width: 920px)').matches) {
                      window.requestAnimationFrame(() => document.querySelector('.detail')?.scrollIntoView({ block: 'start' }));
                    }
                  }}>
                    <span className="student-name"><span className="avatar">{initials(student.name)}</span><strong>{student.name}</strong></span>
                    <Badge stage={stage} /><span className="row-trial">{student.trial ? displaySlot(student.trial.startsAt, student.trial.endsAt) : '—'}</span>
                    <Icon name="chevron" size={16} />
                  </button>
                </li>
              ))}</ul>
            </div> : <div className="empty-state"><span className="fact-icon"><Icon name="inbox" size={24} /></span><h3>No students here</h3>
              <p className="muted">{query ? 'Try another name or clear your filters.' : 'Students appear here as they reach this stage.'}</p>
              {(query || filter !== 'all') && <button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button>}</div>}
          </section>
          {selection && <Detail key={`${selection.student.id}/${selection.stage}/${selection.student.trial?.id}`} student={selection.student}
            stage={selection.stage} teachers={data.teachers} now={now} onSave={save} onClose={() => setSelectedId(null)} />}
        </div>
        {newEnquiry && <EnquiryDialog onClose={() => setNewEnquiry(false)} onSave={save} />}
      </>}
      <footer className="workspace-footer"><Icon name="shield" size={16} /> You are viewing students assigned to you.</footer>
    </main>
  </>;
}

function Stat({ name, value, icon, selected, onClick }: {
  name: string; value: number; icon: 'people' | 'calendar' | 'inbox' | 'clock'; selected: boolean; onClick: () => void;
}) {
  return <button className={`stat stat-${icon}`} type="button" aria-pressed={selected} onClick={onClick}>
    <span><span className="stat-label">{name}</span><strong>{value}</strong></span>
    <span className="stat-icon"><Icon name={icon} size={20} /></span>
  </button>;
}

function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ admin: Admin }>('/me').then((response) => { if (active) setAdmin(response.admin); })
      .catch((cause) => {
        if (active && !(cause instanceof ApiError && cause.status === 401)) setError(errorText(cause));
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  if (loading) return <main className="start-state" role="status">Opening Student Desk…</main>;
  if (error) return <main className="start-state"><ErrorBox>{error}</ErrorBox>
    <button className="button secondary" onClick={() => { setError(''); setLoading(true); setAttempt(attempt + 1); }}>Try again</button></main>;
  return admin ? <Workspace admin={admin} onLogout={() => setAdmin(null)} /> : <Login onLogin={setAdmin} />;
}

createRoot(document.getElementById('root')!).render(<App />);
