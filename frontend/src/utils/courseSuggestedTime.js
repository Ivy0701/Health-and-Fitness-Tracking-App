/**
 * Helpers for course "daily template" time derived from weeklySlots (first startTime).
 * Backend scheduling uses the same daily rule in `courseSchedulePlacement.expandCourseSessionsInRange`.
 */

/**
 * @param {object} courseOrSlots - course-like `{ weeklySlots }` or an array of slot objects
 * @returns {string} normalized "HH:mm" from the first slot with a valid startTime, or ""
 */
export function pickSuggestedDailyTimeHHmm(courseOrSlots) {
  const slots =
    courseOrSlots != null && Array.isArray(courseOrSlots.weeklySlots)
      ? courseOrSlots.weeklySlots
      : Array.isArray(courseOrSlots)
        ? courseOrSlots
        : [];

  for (const s of slots) {
    const raw = String(s?.startTime ?? "").trim();
    if (!raw) continue;
    const t = raw.slice(0, 5);
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) continue;
    if (h < 0 || h > 23 || min < 0 || min > 59) continue;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return "";
}

/** Short UI phrase for course modals, e.g. "Daily at 08:00", or "" when unknown. */
export function formatCourseSuggestedDailyTime(course) {
  const hhmm = pickSuggestedDailyTimeHHmm(course);
  return hhmm ? `Daily at ${hhmm}` : "";
}

function endHHmmFromStartAndDuration(startHHmm, durationMinutes) {
  const [h, m] = String(startHHmm || "")
    .slice(0, 5)
    .split(":")
    .map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const dur = Math.max(1, Number(durationMinutes) || 30);
  let total = h * 60 + m + dur;
  total = Math.min(24 * 60, total);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(Math.min(23, eh)).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

/** Same shape as API `daily_schedule` for UI fallback when enrollment payload omits it. */
export function buildDailyScheduleRangeFromCourse(course) {
  const startTime = pickSuggestedDailyTimeHHmm(course);
  if (!startTime) return null;
  const durationMinutes = Math.max(1, Number(course?.duration || course?.minutesPerDay || 30));
  return {
    startTime,
    endTime: endHHmmFromStartAndDuration(startTime, durationMinutes),
    durationMinutes,
  };
}
