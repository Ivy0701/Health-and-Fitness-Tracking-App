/**
 * Unified schedule interval math and conflict detection (server-side).
 * Touching intervals (end === start) do NOT conflict.
 */

const DAY_START_MIN = 0;
const DAY_END_MIN = 24 * 60;

function pad2(n) {
  return String(Math.max(0, n | 0)).padStart(2, "0");
}

function parseTimeToMinutes(t) {
  if (!t || typeof t !== "string") return NaN;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59 || !Number.isFinite(h) || !Number.isFinite(min)) return NaN;
  return h * 60 + min;
}

function minutesToHHmm(total) {
  const m = Math.max(0, Math.min(total, 24 * 60 - 1));
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${pad2(h)}:${pad2(mm)}`;
}

const DIET_LOG_SYNC_SOURCE = "diet_log_sync";

function defaultDurationMinutes(itemType, row = {}) {
  const type = String(itemType || row.itemType || "manual").toLowerCase();
  /** Meal blocks from Diet records are always 15m on the schedule; ignore corrupt DB durations. */
  if (type === "diet" && String(row?.scheduleSource || "").trim() === DIET_LOG_SYNC_SOURCE) {
    return 15;
  }
  const fromRow = Number(row.durationMinutes);
  if (Number.isFinite(fromRow) && fromRow >= 1) {
    if (type === "workout" || type === "exercise") return Math.max(30, Math.min(120, fromRow));
    if (type === "course" || type === "course_session") return Math.max(1, fromRow);
    return fromRow;
  }
  if (type === "diet") {
    return 30;
  }
  if (type === "workout" || type === "exercise") return 45;
  if (type === "course" || type === "course_session") return 30;
  if (type === "reminder" || type === "personal" || type === "manual") return 30;
  return 60;
}

function normalizeScheduleItemTimeRange(row) {
  const date = String(row?.date || "").trim();
  const timeRaw = String(row?.time || "").trim();
  const time = timeRaw.slice(0, 5);
  const start = parseTimeToMinutes(time);
  const rawDur = defaultDurationMinutes(row?.itemType, row);
  const durationMinutes = Math.max(1, Math.round(Number(rawDur) || 1));
  const end = Number.isFinite(start) ? start + durationMinutes : NaN;
  return { date, time, start, end, durationMinutes };
}

function intervalsOverlap(startA, endA, startB, endB) {
  if (![startA, endA, startB, endB].every(Number.isFinite)) return false;
  return startA < endB && endA > startB;
}

function itemsTimeOverlap(a, b) {
  const da = String(a?.date || "").trim();
  const db = String(b?.date || "").trim();
  if (!da || !db || da !== db) return false;
  const na = normalizeScheduleItemTimeRange(a);
  const nb = normalizeScheduleItemTimeRange(b);
  if (!Number.isFinite(na.start) || !Number.isFinite(nb.start)) return false;
  return intervalsOverlap(na.start, na.end, nb.start, nb.end);
}

function isCountableBlock(row) {
  if (!row || !String(row.title || "").trim()) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || "").trim())) return false;
  const t = String(row.time || "").trim().slice(0, 5);
  if (!/^\d{1,2}:\d{2}$/.test(t)) return false;
  return Number.isFinite(parseTimeToMinutes(t));
}

/**
 * Returns whether candidate overlaps any countable existing row (excluding excludeId).
 * When conflict is true, `hit` identifies the first overlapping row and minute ranges for logs.
 */
function findScheduleConflictDetail(candidate, existingRows, excludeId) {
  const c = normalizeScheduleItemTimeRange(candidate);
  const exId = excludeId != null ? String(excludeId) : "";
  if (!Number.isFinite(c.start) || !Number.isFinite(c.end)) {
    return {
      conflict: false,
      candidateRange: { date: c.date, time: c.time, startMin: c.start, endMin: c.end, durationMinutes: c.durationMinutes },
      hit: null,
      invalidCandidate: true,
    };
  }
  const candForOverlap = { ...candidate, date: c.date, time: c.time, durationMinutes: c.durationMinutes };
  for (const e of existingRows || []) {
    const eid = String(e?._id || "");
    if (exId && eid === exId) continue;
    if (!isCountableBlock(e)) continue;
    if (itemsTimeOverlap(candForOverlap, e)) {
      const nb = normalizeScheduleItemTimeRange(e);
      return {
        conflict: true,
        candidateRange: { date: c.date, time: c.time, startMin: c.start, endMin: c.end, durationMinutes: c.durationMinutes },
        hit: {
          id: eid,
          itemType: e?.itemType,
          scheduleSource: String(e?.scheduleSource || ""),
          title: e?.title,
          date: String(e?.date || "").trim(),
          time: String(e?.time || "").trim().slice(0, 5),
          startMin: nb.start,
          endMin: nb.end,
          durationMinutes: nb.durationMinutes,
        },
      };
    }
  }
  return {
    conflict: false,
    candidateRange: { date: c.date, time: c.time, startMin: c.start, endMin: c.end, durationMinutes: c.durationMinutes },
    hit: null,
  };
}

function hasScheduleConflict(candidate, existingRows, excludeId) {
  return findScheduleConflictDetail(candidate, existingRows, excludeId).conflict;
}

function preferredWindowsForItem(itemType, mealType) {
  const type = String(itemType || "").toLowerCase();
  if (type === "diet") {
    const m = String(mealType || "lunch").toLowerCase();
    if (m === "breakfast") return [[7 * 60, 9 * 60]];
    if (m === "lunch") return [[12 * 60, 14 * 60]];
    if (m === "dinner") return [[18 * 60, 20 * 60]];
    if (m === "snack") return [[15 * 60, 17 * 60]];
    return [[12 * 60, 14 * 60]];
  }
  if (type === "workout" || type === "exercise") {
    return [
      [7 * 60, 9 * 60],
      [18 * 60, 21 * 60],
    ];
  }
  if (type === "course" || type === "course_session") {
    return [
      [9 * 60, 12 * 60],
      [13 * 60, 17 * 60],
    ];
  }
  if (type === "reminder" || type === "personal" || type === "manual") {
    return [[9 * 60, 20 * 60]];
  }
  return [[9 * 60, 18 * 60]];
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {number} durationMinutes
 * @param {object[]} existingRows
 * @param {{ excludeId?: string, itemType?: string, mealType?: string, searchStart?: number, searchEnd?: number }} options
 * @returns {string|null} HH:mm
 */
function findNextAvailableTimeSlot(date, durationMinutes, existingRows, options = {}) {
  const dur = Math.max(1, Number(durationMinutes) || 30);
  const searchStart = Number.isFinite(options.searchStart) ? options.searchStart : 6 * 60;
  const searchEnd = Number.isFinite(options.searchEnd) ? options.searchEnd : 22 * 60;
  const maxStartMain = searchEnd - dur;
  const windows = options.windows || preferredWindowsForItem(options.itemType, options.mealType);
  const excludeId = options.excludeId != null ? String(options.excludeId) : "";

  const tryStart = (startMin) => {
    if (!Number.isFinite(startMin)) return null;
    if (startMin < DAY_START_MIN || startMin > 24 * 60 - dur) return null;
    const time = minutesToHHmm(startMin);
    const cand = { date, time, durationMinutes: dur, itemType: options.itemType || "manual" };
    if (!hasScheduleConflict(cand, existingRows, excludeId)) return time;
    return null;
  };

  const ordered = [];
  const seen = new Set();
  const push = (m) => {
    if (!seen.has(m)) {
      seen.add(m);
      ordered.push(m);
    }
  };

  for (const [w0, w1] of windows) {
    const maxS = Math.min(w1 - dur, maxStartMain);
    for (let m = Math.max(w0, searchStart); m <= maxS; m += 15) push(m);
  }
  for (let m = searchStart; m <= maxStartMain; m += 15) push(m);

  for (const m of ordered) {
    const t = tryStart(m);
    if (t) return t;
  }

  for (let m = searchStart; m <= maxStartMain; m += 5) {
    const t = tryStart(m);
    if (t) return t;
  }

  for (let m = DAY_START_MIN; m <= 24 * 60 - dur; m += 5) {
    if (m >= searchStart && m <= maxStartMain) continue;
    const t = tryStart(m);
    if (t) return t;
  }

  return null;
}

const SCHEDULE_CONFLICT_MESSAGE = "This time overlaps with another scheduled item.";

const DIET_PLAN_MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];

const DIET_MEAL_ANCHORS = {
  breakfast: 8 * 60,
  lunch: 12 * 60 + 30,
  dinner: 19 * 60,
  snack: 16 * 60,
};

/** Strict windows per spec (no absurd cross-type times). */
const DIET_MEAL_STRICT_WINDOWS = {
  breakfast: [7 * 60, 9 * 60 + 30],
  lunch: [11 * 60 + 30, 14 * 60 + 30],
  dinner: [18 * 60, 21 * 60],
  snack: [15 * 60, 17 * 60 + 30],
};

const DIET_PLAN_APPLY_FAIL =
  "This meal plan could not be scheduled without time conflicts. Please clear some time slots or choose another date.";

/**
 * Find a start time inside the meal-specific window only (atomic diet plan apply).
 * @returns {string|null} HH:mm
 */
function findSlotForDietMeal(date, workingRows, mealType, durationMinutes, excludeId = null) {
  const m = String(mealType || "lunch").toLowerCase();
  const win = DIET_MEAL_STRICT_WINDOWS[m] || DIET_MEAL_STRICT_WINDOWS.lunch;
  const [w0, w1] = win;
  const anchor = DIET_MEAL_ANCHORS[m] ?? Math.floor((w0 + w1) / 2);
  const dur = Math.max(1, Number(durationMinutes) || 30);
  if (w1 - w0 < dur) return null;

  const candidates = [];
  candidates.push(anchor);
  for (let delta = 5; delta <= w1 - w0; delta += 5) {
    candidates.push(anchor - delta, anchor + delta);
  }
  for (let t = w0; t <= w1 - dur; t += 5) candidates.push(t);

  const ex = excludeId != null ? String(excludeId) : "";
  const seen = new Set();
  for (const start of candidates) {
    if (!Number.isFinite(start)) continue;
    const k = Math.round(start);
    if (k < w0 || k > w1 - dur) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    const time = minutesToHHmm(k);
    const cand = { date, time, durationMinutes: dur, itemType: "diet", title: "Meal" };
    if (!hasScheduleConflict(cand, workingRows, ex)) return time;
  }
  return null;
}

/**
 * Simulate placing all diet-plan meals; all-or-nothing.
 * @param {string} date
 * @param {object[]} baselineRows existing items excluding rows to be replaced by this apply
 * @param {{ mealType: string, durationMinutes?: number, title: string, subtitle?: string, totalCalories?: number }[]} mealSpecs in breakfast→snack order
 */
function simulateDietPlanApply(date, baselineRows, mealSpecs) {
  const working = [...baselineRows];
  const placements = [];
  const ordered = [];
  for (const key of DIET_PLAN_MEAL_ORDER) {
    const spec = mealSpecs.find((x) => String(x.mealType || "").toLowerCase() === key);
    if (spec) ordered.push(spec);
  }
  for (const spec of ordered) {
    const mt = String(spec.mealType || "").toLowerCase();
    const dur = Math.max(1, Number(spec.durationMinutes) || 30);
    const slot = findSlotForDietMeal(date, working, mt, dur, null);
    if (!slot) return { ok: false, message: DIET_PLAN_APPLY_FAIL };
    const row = {
      date,
      time: slot,
      durationMinutes: dur,
      itemType: "diet",
      title: String(spec.title || "").trim() || `${mt} · Meal`,
      subtitle: spec.subtitle != null ? String(spec.subtitle) : "",
      meal: mt,
      totalCalories: Math.max(0, Number(spec.totalCalories) || 0),
    };
    placements.push(row);
    working.push({ ...row, _id: `tmp-${placements.length}` });
  }
  return { ok: true, placements };
}

/**
 * Try to move one diet row out of overlap by re-slotting inside its meal window.
 */
function resolveDietRowOverlap(date, dietRow, allDayRows) {
  const others = allDayRows.filter((r) => String(r?._id || "") !== String(dietRow?._id || ""));
  const meal = String(dietRow?.meal || "lunch").toLowerCase();
  const dur = defaultDurationMinutes("diet", dietRow);
  const slot = findSlotForDietMeal(date, others, meal, dur, String(dietRow._id || ""));
  return slot;
}

module.exports = {
  parseTimeToMinutes,
  minutesToHHmm,
  defaultDurationMinutes,
  normalizeScheduleItemTimeRange,
  intervalsOverlap,
  itemsTimeOverlap,
  findScheduleConflictDetail,
  hasScheduleConflict,
  findNextAvailableTimeSlot,
  findSlotForDietMeal,
  simulateDietPlanApply,
  resolveDietRowOverlap,
  preferredWindowsForItem,
  isCountableBlock,
  SCHEDULE_CONFLICT_MESSAGE,
  DIET_PLAN_MEAL_ORDER,
  DIET_PLAN_APPLY_FAIL,
};
