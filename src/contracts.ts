export const outcomes = ['interested', 'undecided', 'not_proceeding', 'no_show'] as const;
export type Outcome = (typeof outcomes)[number];

export const outcomeLabels: Record<Outcome, string> = {
  interested: 'Interested',
  undecided: 'Undecided',
  not_proceeding: 'Not proceeding',
  no_show: 'Did not attend',
};

export interface Admin {
  id: number;
  name: string;
  email: string;
}

export interface Teacher {
  id: number;
  name: string;
}

export interface Trial {
  id: number;
  teacher: Teacher;
  startsAt: string;
  endsAt: string;
  outcome: Outcome | null;
  feedback: string | null;
  followedAt: string | null;
  followUpNote: string | null;
}

export interface Student {
  id: number;
  name: string;
  guardianName: string;
  guardianContact: string;
  notes: string;
  createdAt: string;
  trial: Trial | null;
}

export interface FollowUpDraft {
  nextStep: string;
  parentMessage: string;
  source: 'ai' | 'template';
}

export type Stage = 'enquiry' | 'scheduled' | 'awaiting_result' | 'follow_up' | 'completed';

export function studentStage(trial: Trial | null, now: number): Stage {
  if (!trial) return 'enquiry';
  if (trial.followedAt) return 'completed';
  if (trial.outcome) return 'follow_up';
  return Date.parse(trial.endsAt) <= now ? 'awaiting_result' : 'scheduled';
}
