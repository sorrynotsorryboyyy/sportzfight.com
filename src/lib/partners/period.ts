/**
 * Monthly statement periods, in Europe/Paris.
 *
 * The month here is a CALENDAR month, not a rolling window. Rolling windows are
 * used elsewhere in this codebase (see the daily streak) because SECURITY RULES
 * have no timezone and cannot name a calendar day. Statements are computed in a
 * Node API route, where Intl carries the full timezone database, so that
 * constraint does not apply — and a statement that has to survive being pasted
 * into an invoice must line up with the month a human means.
 *
 * The server clock is UTC on Vercel. Doing this with setDate(1)/setHours(0)
 * puts the boundary at 01:00 or 02:00 Paris time, so a payment made at 00:30 on
 * 1 March lands in the February statement. Harmless on a live counter, not
 * harmless on a document a partner invoices against.
 */

export const PARTNER_TZ = 'Europe/Paris';

/** "2026-03". Sorts lexicographically, which is why it is the document key. */
export type PeriodId = string;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isPeriodId = (value: unknown): value is PeriodId =>
  typeof value === 'string' && PERIOD_RE.test(value);

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

/** The Paris wall-clock parts of an instant. */
function parisParts(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARTNER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Which period an instant falls in. */
export function periodOf(at: Date): PeriodId {
  const { year, month } = parisParts(at);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * The UTC instant of midnight, Paris time, on the 1st of a given month.
 *
 * Paris is UTC+1 in winter and UTC+2 in summer, so the offset has to be
 * measured AT the instant rather than assumed. The trick: guess the UTC
 * instant, read it back as Paris wall-clock, and subtract however far off the
 * guess landed. One correction is enough — the offset error is at most an hour,
 * and French DST transitions fall on the last Sunday of March and October,
 * never on the 1st at midnight, so the correction cannot straddle one.
 */
function parisMonthStart(year: number, month: number): Date {
  const guess = Date.UTC(year, month - 1, 1, 0, 0, 0);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARTNER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  // What that guess actually reads as, in Paris.
  const asParis = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );

  // asParis - guess IS the offset. Removing it lands on Paris midnight.
  return new Date(guess - (asParis - guess));
}

/**
 * The half-open UTC instants [start, end) of a Paris calendar month.
 *
 * Half-open matters: a payment at exactly 00:00:00 on the 1st belongs to the
 * month STARTING, not the one ending. Getting that backwards moves a line
 * between two statements that have both already been sent.
 */
export function periodBounds(id: PeriodId): { start: Date; end: Date } {
  if (!isPeriodId(id)) throw new Error(`bad period: ${id}`);
  const [y, m] = id.split('-').map(Number);
  return {
    start: parisMonthStart(y, m),
    end: m === 12 ? parisMonthStart(y + 1, 1) : parisMonthStart(y, m + 1),
  };
}

/** The period before this one. "2026-01" -> "2025-12". */
export function previousPeriod(id: PeriodId): PeriodId {
  if (!isPeriodId(id)) throw new Error(`bad period: ${id}`);
  const [y, m] = id.split('-').map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The period after this one, for stepping forward in the admin view. */
export function nextPeriod(id: PeriodId): PeriodId {
  if (!isPeriodId(id)) throw new Error(`bad period: ${id}`);
  const [y, m] = id.split('-').map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** "mars 2026", for a dashboard row and a statement header. */
export function periodLabel(id: PeriodId): string {
  if (!isPeriodId(id)) return id;
  const [y, m] = id.split('-').map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

/**
 * "du 1er au 31 mars 2026" — the wording an invoice needs.
 *
 * The last day is derived from the period's own end boundary rather than a
 * lookup table, so February and leap years take care of themselves.
 */
export function periodRangeLabel(id: PeriodId): string {
  if (!isPeriodId(id)) return id;
  const { end } = periodBounds(id);
  // One second before the next month begins, read in Paris.
  const last = parisParts(new Date(end.getTime() - 1000)).day;
  const [y, m] = id.split('-').map(Number);
  return `du 1er au ${last} ${MONTHS_FR[m - 1]} ${y}`;
}
