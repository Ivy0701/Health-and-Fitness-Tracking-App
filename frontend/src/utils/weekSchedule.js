/** Weekday 0 = Monday … 6 = Sunday (timetable convention) */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Default term start (aligned with Courses enrollment; user can override) */
export const DEFAULT_TERM_START_ISO = "2026-05-01";

export function mondayOfDate(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function weekdayMon0(d) {
  return (d.getDay() + 6) % 7;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function formatISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDateISO(iso) {
  const parts = String(iso || "").trim().split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const day = Number(parts[2]);
  if (!y || !mo || !day) return null;
  const d = new Date(y, mo - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Last calendar day of the span of `months` full months from startISO (e.g. May 1 + 6 → Oct 31) */
export function inclusiveEndDateAfterMonths(startISO, months) {
  const s = parseLocalDateISO(startISO);
  if (!s) return null;
  const m = Math.max(1, Number(months) || 1);
  const end = new Date(s.getFullYear(), s.getMonth() + m, 0);
  end.setHours(0, 0, 0, 0);
  return formatISODateLocal(end);
}

export function dateForWeekday(weekMonday, weekday0Mon) {
  const d = new Date(weekMonday);
  d.setDate(d.getDate() + weekday0Mon);
  return formatISODateLocal(d);
}

export function parseTimeToMinutes(t) {
  if (!t || typeof t !== "string") return NaN;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59 || !Number.isFinite(h) || !Number.isFinite(min)) return NaN;
  return h * 60 + min;
}

export function itemEndMinutes(item) {
  const s = parseTimeToMinutes(item.time);
  if (!Number.isFinite(s)) return NaN;
  const dur = Number(item.durationMinutes) > 0 ? Number(item.durationMinutes) : 60;
  return s + dur;
}

/** Expand a single week (debug / special cases) */
export function expandCourseToPlannedItems(course, weekMonday) {
  const slots = course.weeklySlots || [];
  const dur = Number(course.duration) > 0 ? Number(course.duration) : 30;
  return slots.map((slot) => ({
    title: course.title,
    date: dateForWeekday(weekMonday, slot.weekday),
    time: String(slot.startTime).slice(0, 5),
    note: `${course.category || "course"} · ${dur} min`,
    durationMinutes: dur,
    courseId: course._id,
  }));
}

/** For each day from startISO through endISO (inclusive), generate sessions from weeklySlots */
export function expandCourseToPlannedItemsInRange(course, startISO, endISO) {
  const start = parseLocalDateISO(startISO);
  const end = parseLocalDateISO(endISO);
  if (!start || !end || end < start) return [];

  const slots = course.weeklySlots || [];
  const dur = Number(course.duration) > 0 ? Number(course.duration) : 30;
  const out = [];
  const endT = end.getTime();

  for (let d = new Date(start); d.getTime() <= endT; d = addDays(d, 1)) {
    const w = weekdayMon0(d);
    const iso = formatISODateLocal(d);
    for (const slot of slots) {
      if (Number(slot.weekday) === w) {
        out.push({
          title: course.title,
          date: iso,
          time: String(slot.startTime).slice(0, 5),
          note: `${course.category || "course"} · ${dur} min`,
          durationMinutes: dur,
          courseId: course._id,
        });
      }
    }
  }
  return out;
}

export function rangesOverlap(startA, endA, startB, endB) {
  return !(endA <= startB || endB <= startA);
}

export function itemsTimeOverlap(a, b) {
  const da = String(a?.date || "").trim();
  const db = String(b?.date || "").trim();
  if (!da || !db || da !== db) return false;

  const sa = parseTimeToMinutes(a.time);
  const ea = itemEndMinutes(a);
  const sb = parseTimeToMinutes(b.time);
  const eb = itemEndMinutes(b);
  if (![sa, ea, sb, eb].every(Number.isFinite)) return false;
  return rangesOverlap(sa, ea, sb, eb);
}

/** Only count existing rows with a real time slot (ignore empty / bad data when detecting conflicts) */
export function isExistingBlockCountable(e) {
  if (!e || !String(e.title || "").trim()) return false;
  const d = String(e.date || "").trim();
  const t = String(e.time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t5 = t.slice(0, 5);
  if (!/^\d{1,2}:\d{2}$/.test(t5)) return false;
  if (!Number.isFinite(parseTimeToMinutes(t5))) return false;
  return true;
}

export function findPlannedConflicts(planned, existing) {
  const pairs = [];
  const realExisting = (existing || []).filter(isExistingBlockCountable);
  for (const p of planned) {
    for (const e of realExisting) {
      if (itemsTimeOverlap(p, e)) pairs.push({ planned: p, existing: e });
    }
  }
  return pairs;
}

/** Merge overlapping items into clusters (same calendar date). */
export function clusterItemsForDay(items) {
  const usable = (items || []).filter(isExistingBlockCountable);
  if (!usable.length) return [];
  const sorted = [...usable].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
  let clusters = sorted.map((it) => [it]);
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const A = clusters[i];
        const B = clusters[j];
        const touch = A.some((a) => B.some((b) => itemsTimeOverlap(a, b)));
        if (touch) {
          clusters[i] = [...A, ...B];
          clusters.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return clusters;
}

export const TIMETABLE_START_HOUR = 0;
/** Exclusive end of the visible day (24 ⇒ full 00:00–24:00, 1440 minutes). */
export const TIMETABLE_END_HOUR = 24;

/**
 * Extra px below the logical 24h grid so the last hour band, 24:00 tick, and
 * bottom clusters stay clear of the scroll viewport edge (absolute % layout
 * stays on tt-body height only — see ScheduleView tt-body + tt-tail-spacer).
 */
export const TIMETABLE_BOTTOM_BUFFER_PX = 56;

export function timetableTotalMinutes() {
  return (TIMETABLE_END_HOUR - TIMETABLE_START_HOUR) * 60;
}

/** Timetable body height in px: 1px per minute; grid lines align with blocks */
export function timetableBodyHeightPx() {
  return timetableTotalMinutes();
}

/** Min height for each day column / time rail including bottom breathing room */
export function timetableColumnOuterMinHeightPx() {
  return timetableBodyHeightPx() + TIMETABLE_BOTTOM_BUFFER_PX;
}

export function itemBlockStyle(item) {
  const startMin = parseTimeToMinutes(item.time);
  const day0 = TIMETABLE_START_HOUR * 60;
  const total = timetableTotalMinutes();
  const dur = Number(item.durationMinutes) > 0 ? Number(item.durationMinutes) : 60;
  const top = ((startMin - day0) / total) * 100;
  const height = (dur / total) * 100;
  const topClamped = Math.max(0, Math.min(100 - 0.5, top));
  const heightClamped = Math.min(100 - topClamped, Math.max(height, 2));
  return {
    top: `${topClamped}%`,
    height: `${heightClamped}%`,
  };
}

export function clusterEnvelopeStyle(cluster) {
  let start = Infinity;
  let end = -Infinity;
  for (const it of cluster) {
    const s = parseTimeToMinutes(it.time);
    const e = itemEndMinutes(it);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    start = Math.min(start, s);
    end = Math.max(end, e);
  }
  if (!Number.isFinite(start)) return { top: "0%", height: "6%" };
  const day0 = TIMETABLE_START_HOUR * 60;
  const total = timetableTotalMinutes();
  const top = ((start - day0) / total) * 100;
  let height = ((end - start) / total) * 100;
  const minPct = (45 / total) * 100;
  height = Math.max(height, minPct, cluster.length > 1 ? 12 : 6);
  return {
    top: `${Math.max(0, top)}%`,
    height: `${Math.min(height, 100 - Math.max(0, top))}%`,
  };
}

/** When stacked, flex weight scales with session duration */
export function itemFlexWeight(item) {
  return Math.max(1, Number(item.durationMinutes) || 60);
}

export function minutesToHHmm(total) {
  const m = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function getDefaultDurationMinutes(itemType, partial = {}) {
  const t = String(itemType || "manual").toLowerCase();
  const fromRow = Number(partial.durationMinutes);
  if (Number.isFinite(fromRow) && fromRow >= 1) {
    if (t === "workout" || t === "exercise") return Math.max(30, Math.min(120, fromRow));
    if (t === "course" || t === "course_session") return Math.max(1, fromRow);
    return fromRow;
  }
  if (t === "diet") return 30;
  if (t === "workout" || t === "exercise") return 45;
  if (t === "course" || t === "course_session") return 30;
  if (t === "reminder" || t === "personal" || t === "manual") return 30;
  return 60;
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
 * @returns {string|null} HH:mm
 */
export function findNextAvailableTimeSlot(date, durationMinutes, existingItems, options = {}) {
  const dur = Math.max(1, Number(durationMinutes) || 30);
  const searchStart = Number.isFinite(options.searchStart) ? options.searchStart : TIMETABLE_START_HOUR * 60;
  const searchEnd = Number.isFinite(options.searchEnd) ? options.searchEnd : TIMETABLE_END_HOUR * 60;
  const maxStartMain = searchEnd - dur;
  const windows = options.windows || preferredWindowsForItem(options.itemType || "manual", options.mealType);

  const tryStart = (startMin) => {
    if (!Number.isFinite(startMin)) return null;
    if (startMin < 0 || startMin > 24 * 60 - dur) return null;
    const time = minutesToHHmm(startMin);
    const cand = { date, time, durationMinutes: dur, itemType: options.itemType || "manual", title: "Block" };
    const hit = (existingItems || []).some((e) => {
      if (options.excludeId && String(e._id) === String(options.excludeId)) return false;
      return itemsTimeOverlap(cand, e);
    });
    if (!hit) return time;
    return null;
  };

  const ordered = [];
  const seen = new Set();
  const push = (m) => {
    if (seen.has(m)) return;
    seen.add(m);
    ordered.push(m);
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
  for (let m = 0; m <= 24 * 60 - dur; m += 5) {
    if (m >= searchStart && m <= maxStartMain) continue;
    const t = tryStart(m);
    if (t) return t;
  }
  return null;
}

/** Lower = higher priority for merged timeline slot (Workout > Course/VIP > Diet > Personal). */
export function itemTypeRankForTimeline(item) {
  const t = String(item?.itemType || "").toLowerCase();
  if (t === "workout" || t === "exercise") return 0;
  if (t === "course" || t === "course_session" || item?.courseId) return 1;
  if (t === "diet") return 2;
  return 3;
}

export function pickClusterPrimaryItem(cluster) {
  const arr = (cluster || []).filter(isExistingBlockCountable);
  if (!arr.length) return cluster?.[0] || null;
  return [...arr].sort((a, b) => {
    const ra = itemTypeRankForTimeline(a);
    const rb = itemTypeRankForTimeline(b);
    if (ra !== rb) return ra - rb;
    const ta = parseTimeToMinutes(a.time);
    const tb = parseTimeToMinutes(b.time);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return String(a._id || "").localeCompare(String(b._id || ""));
  })[0];
}

export function sortClusterItemsForModal(cluster) {
  return [...(cluster || [])].sort((a, b) => {
    const ra = itemTypeRankForTimeline(a);
    const rb = itemTypeRankForTimeline(b);
    if (ra !== rb) return ra - rb;
    const ta = parseTimeToMinutes(a.time);
    const tb = parseTimeToMinutes(b.time);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
    return String(a._id || "").localeCompare(String(b._id || ""));
  });
}

/** Envelope time label for a group of overlapping items (same calendar day). */
export function clusterTimeRangeLabel(cluster) {
  let start = Infinity;
  let end = -Infinity;
  for (const it of cluster || []) {
    const s = parseTimeToMinutes(it?.time);
    const e = itemEndMinutes(it);
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
    start = Math.min(start, s);
    end = Math.max(end, e);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  return `${minutesToHHmm(start)} - ${minutesToHHmm(end)}`;
}

export const SCHEDULE_CONFLICT_MESSAGE = "This time slot is already occupied by another scheduled item.";
