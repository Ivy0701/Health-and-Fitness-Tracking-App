function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatLocalDate(dateInput) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

export function getTodayLocalDate() {
  return formatLocalDate(new Date());
}

export function normalizeDateKey(value) {
  if (!value) return "";
  if (value instanceof Date) return formatLocalDate(value);
  const raw = String(value).trim();
  const hit = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (hit) return hit[0];
  return formatLocalDate(raw);
}

export function compareDateKeys(a, b) {
  const keyA = normalizeDateKey(a);
  const keyB = normalizeDateKey(b);
  if (!keyA || !keyB) return 0;
  if (keyA < keyB) return -1;
  if (keyA > keyB) return 1;
  return 0;
}

export function isTodayDate(value, today = getTodayLocalDate()) {
  return compareDateKeys(value, today) === 0;
}

export function isPastDate(value, today = getTodayLocalDate()) {
  return compareDateKeys(value, today) < 0;
}

export function isFutureDate(value, today = getTodayLocalDate()) {
  return compareDateKeys(value, today) > 0;
}
