/**
 * Shared formatting helpers for the RAT dashboard.
 * All numeric output uses en-US grouping; dates use Intl.
 */

export function toNumber(value, fallback = 0) {
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : fallback;
}

/** 1234567 -> "1,234,567" */
export function formatNumber(value, fallback = '0') {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return fallback;
  return n.toLocaleString('en-US');
}

/** 42 -> "+42", -7 -> "-7", 0 -> "0" */
export function formatSigned(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  const formatted = n.toLocaleString('en-US');
  return n > 0 ? `+${formatted}` : formatted;
}

/** 0.235 -> "23.5%" */
export function formatPercent(fraction, digits = 1) {
  const n = typeof fraction === 'string' ? Number(fraction) : fraction;
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(digits)}%`;
}

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Accept epoch seconds / milliseconds as well as ISO strings.
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && String(value).trim() !== '' && /^\d+$/.test(String(value).trim())) {
    const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

/** "12 Mar 2024" (or "—" when unparseable) */
export function formatDate(value) {
  const d = toDate(value);
  return d ? dateFmt.format(d) : '—';
}

/** "12 Mar 2024, 14:05" */
export function formatDateTime(value) {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : '—';
}

/** Chart axis label: short bucket rendering, pass-through for non-dates. */
export function formatBucket(value) {
  const d = toDate(value);
  if (!d) return String(value ?? '');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const opts = sameYear
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: '2-digit' };
  return new Intl.DateTimeFormat('en-GB', opts).format(d);
}

/** "3f9c1ab" short hash */
export function shortHash(hash, length = 7) {
  if (!hash) return '—';
  return String(hash).slice(0, length);
}

/** Truncate long text with an ellipsis. */
export function truncate(text, max = 80) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/** Pick the first defined numeric field from a row (backend shape tolerance). */
export function pickNumber(row, keys, fallback = 0) {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return fallback;
}

/** Pick the first defined field from a row (backend shape tolerance). */
export function pickField(row, keys, fallback = undefined) {
  if (!row) return fallback;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}
