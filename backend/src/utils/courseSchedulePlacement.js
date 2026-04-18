/**
 * Course session expansion + conflict resolution for schedule placement.
 * Keeps parity with frontend `expandCourseToPlannedItemsInRange` (Mon=0 weekday).
 */
const mongoose = require("mongoose");
const scheduleTime = require("./scheduleTime");

function toDateKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKeyAtNoon(dateKey) {
  const s = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00`);
}

function weekdayMon0FromDateKey(dateKey) {
  const d = parseDateKeyAtNoon(dateKey);
  if (!d || Number.isNaN(d.getTime())) return 0;
  return (d.getDay() + 6) % 7;
}

function addDaysToDateKey(dateKey, n) {
  const d = parseDateKeyAtNoon(dateKey);
  if (!d || Number.isNaN(d.getTime())) return String(dateKey || "").trim();
  d.setDate(d.getDate() + Number(n || 0));
  return toDateKeyFromDate(d);
}

function expandCourseSessionsInRange(course, startDateKey, endDateKey) {
  const start = parseDateKeyAtNoon(startDateKey);
  const end = parseDateKeyAtNoon(endDateKey);
  if (!start || !end || end < start) return [];
  const slots = Array.isArray(course?.weeklySlots) ? course.weeklySlots : [];
  const dur = Number(course?.duration) > 0 ? Number(course.duration) : 30;
  const out = [];
  const endT = end.getTime();
  for (let d = new Date(start); d.getTime() <= endT; d.setDate(d.getDate() + 1)) {
    const w = (d.getDay() + 6) % 7;
    const iso = toDateKeyFromDate(d);
    for (const slot of slots) {
      if (Number(slot.weekday) !== w) continue;
      const t = String(slot.startTime || "").trim().slice(0, 5);
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      let timeStr = "09:00";
      if (m) {
        const hh = Math.min(23, Math.max(0, Number(m[1])));
        const mm = Math.min(59, Math.max(0, Number(m[2])));
        timeStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
      out.push({
        title: String(course.title || "").trim() || "Course",
        date: iso,
        time: timeStr,
        note: `${String(course.category || "course").trim()} · ${dur} min`,
        durationMinutes: dur,
        courseId: course._id,
      });
    }
  }
  return out;
}

function endTimeHHmm(startHHmm, durationMinutes) {
  const st = scheduleTime.parseTimeToMinutes(String(startHHmm || "").slice(0, 5));
  if (!Number.isFinite(st)) return "";
  const dur = Math.max(1, Number(durationMinutes) || 30);
  return scheduleTime.minutesToHHmm(st + dur);
}

/**
 * Find a non-overlapping slot for one course session (same day forward, then other days).
 * Does not mutate `accumulated`.
 */
function resolveCourseSessionPlacement(planned, accumulated, opts = {}) {
  const maxDayShift = Number.isFinite(opts.maxDayShift) ? opts.maxDayShift : 21;
  const dur = Math.max(1, Number(planned.durationMinutes) || 30);
  const origDate = String(planned.date || "").trim();
  const origTime = String(planned.time || "").trim().slice(0, 5);
  const title = String(planned.title || "Course").trim() || "Course";

  const tryAt = (dateKey, timeStr) => {
    const cand = {
      date: dateKey,
      time: String(timeStr || "").trim().slice(0, 5),
      durationMinutes: dur,
      itemType: "course",
      title,
    };
    if (!scheduleTime.isCountableBlock(cand)) return null;
    if (scheduleTime.hasScheduleConflict(cand, accumulated, null)) return null;
    const t5 = cand.time;
    return {
      date: dateKey,
      time: t5,
      rescheduled: dateKey !== origDate || t5 !== origTime,
      originalDate: origDate,
      originalTime: origTime,
    };
  };

  let hit = tryAt(origDate, origTime);
  if (hit) return hit;

  const origStart = scheduleTime.parseTimeToMinutes(origTime);
  if (Number.isFinite(origStart)) {
    for (let m = origStart + 5; m <= 24 * 60 - dur; m += 5) {
      const ts = scheduleTime.minutesToHHmm(m);
      hit = tryAt(origDate, ts);
      if (hit) return hit;
    }
  }

  const slotSameDay = scheduleTime.findNextAvailableTimeSlot(origDate, dur, accumulated, { itemType: "course" });
  if (slotSameDay) {
    hit = tryAt(origDate, slotSameDay);
    if (hit) return hit;
  }

  for (let offset = 1; offset <= maxDayShift; offset += 1) {
    const dk = addDaysToDateKey(origDate, offset);
    const slot = scheduleTime.findNextAvailableTimeSlot(dk, dur, accumulated, { itemType: "course" });
    if (!slot) continue;
    hit = tryAt(dk, slot);
    if (hit) return hit;
  }

  return null;
}

/**
 * @param {object[]} sessionTemplates from expandCourseSessionsInRange
 * @param {object[]} existingRows schedule rows for user (same-day overlap set)
 * @param {{ maxDayShift?: number }} opts
 */
function resolveAllCourseSessions(sessionTemplates, existingRows, opts = {}) {
  const accumulated = [...(existingRows || [])].map((r) => ({ ...r }));
  const placements = [];
  const moves = [];

  for (let idx = 0; idx < sessionTemplates.length; idx += 1) {
    const template = sessionTemplates[idx];
    const dur = Math.max(1, Number(template.durationMinutes) || 30);
    const planned = {
      title: template.title,
      date: template.date,
      time: template.time,
      durationMinutes: dur,
      courseId: template.courseId,
      note: template.note != null ? String(template.note) : "",
      subtitle: template.subtitle != null ? String(template.subtitle) : `Plan Day ${idx + 1}`,
    };

    const r = resolveCourseSessionPlacement(planned, accumulated, opts);
    if (!r) {
      return {
        ok: false,
        failIndex: idx,
        placements: [],
        moves: [],
        anyRescheduled: false,
      };
    }

    placements.push({
      title: planned.title,
      subtitle: planned.subtitle,
      date: r.date,
      time: r.time,
      note: planned.note,
      durationMinutes: dur,
      courseId: planned.courseId,
    });

    if (r.rescheduled) {
      moves.push({
        dayIndex: idx + 1,
        originalSession: {
          date: r.originalDate,
          startTime: r.originalTime,
          endTime: endTimeHHmm(r.originalTime, dur),
        },
        scheduledSession: {
          date: r.date,
          startTime: r.time,
          endTime: endTimeHHmm(r.time, dur),
        },
      });
    }

    accumulated.push({
      date: r.date,
      time: r.time,
      durationMinutes: dur,
      itemType: "course",
      title: planned.title,
      _id: new mongoose.Types.ObjectId(),
    });
  }

  return {
    ok: true,
    placements,
    moves,
    anyRescheduled: moves.length > 0,
  };
}

module.exports = {
  expandCourseSessionsInRange,
  resolveAllCourseSessions,
  resolveCourseSessionPlacement,
  endTimeHHmm,
  weekdayMon0FromDateKey,
  addDaysToDateKey,
  parseDateKeyAtNoon,
};
