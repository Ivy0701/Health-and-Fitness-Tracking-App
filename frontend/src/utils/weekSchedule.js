/** Weekday 0 = Monday … 6 = Sunday (课表常用) */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 学期默认起点（与产品约定一致，可在选课区改） */
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

/** 从起始日算起连续 `months` 个「整月」的末日（例：5/1 + 6 个月 → 10/31） */
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

/** 单周展开（保留给调试或特殊用途） */
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

/** 从 startISO 到 endISO（含）每个日历日，按课程的 weeklySlots 生成全部课次 */
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

/** 仅与「真实占用时段」的日程比较，避免空时间/脏数据误报冲突 */
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

export const TIMETABLE_START_HOUR = 6;
export const TIMETABLE_END_HOUR = 22;

export function timetableTotalMinutes() {
  return (TIMETABLE_END_HOUR - TIMETABLE_START_HOUR) * 60;
}

/** 课表主体高度 (px)：每分钟 1px，整点横线与时间块对齐 */
export function timetableBodyHeightPx() {
  return timetableTotalMinutes();
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

/** 多节叠放时按课时长比例分高（供 flex-grow 使用） */
export function itemFlexWeight(item) {
  return Math.max(1, Number(item.durationMinutes) || 60);
}
