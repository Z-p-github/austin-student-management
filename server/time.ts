import { DateTime } from 'luxon';

export const BUSINESS_ZONE = 'Australia/Melbourne';
export const TRIAL_MINUTES = 30;

export function parseMelbourneSlot(date: string, time: string): { start: number; end: number } | null {
  const wall = `${date}T${time}`;
  const local = DateTime.fromISO(wall, { zone: BUSINESS_ZONE });
  if (!local.isValid || local.toFormat("yyyy-MM-dd'T'HH:mm") !== wall) return null;
  // A wall time during the fall-back hour refers to two instants.
  if (local.getPossibleOffsets().length !== 1) return null;
  const start = local.toMillis();
  return { start, end: start + TRIAL_MINUTES * 60_000 };
}
