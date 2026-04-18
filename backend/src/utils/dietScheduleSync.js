const mongoose = require("mongoose");
const Diet = require("../models/Diet");
const ScheduleItem = require("../models/ScheduleItem");
const scheduleTime = require("./scheduleTime");

const DIET_LOG_SOURCE = "diet_log_sync";
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

/** Fixed default start times when a diet record has no recordedTimeLocal yet. */
const MEAL_DEFAULT_TIME = {
  breakfast: "08:00",
  lunch: "12:30",
  dinner: "19:00",
  snack: "16:00",
};

function isValidDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""));
}

function dayRangeFromDateKey(dateKey) {
  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { $gte: start, $lt: end };
}

function formatDateKeyFromDate(value) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatMealTypeTitleCase(mealType) {
  const key = String(mealType || "").toLowerCase();
  if (key === "breakfast") return "Breakfast";
  if (key === "lunch") return "Lunch";
  if (key === "dinner") return "Dinner";
  return "Snack";
}

function normalizeHHmm(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function toObjectId(userId) {
  const s = String(userId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/**
 * Earliest wall time among diet rows for this meal (recordedTimeLocal only).
 * Rows without a valid time are ignored for the min; if none have a time, use meal default.
 */
function earliestTimeFromDiets(meal, dietsForMeal) {
  let bestMin = null;
  for (const d of dietsForMeal) {
    const t = normalizeHHmm(d.recordedTimeLocal);
    if (!t) continue;
    const m = scheduleTime.parseTimeToMinutes(t);
    if (!Number.isFinite(m)) continue;
    if (bestMin == null || m < bestMin) bestMin = m;
  }
  if (bestMin != null) return scheduleTime.minutesToHHmm(bestMin);
  return MEAL_DEFAULT_TIME[meal] || "12:00";
}

/**
 * One ScheduleItem per (user, date, meal) for scheduleSource=diet_log_sync.
 * totalCalories = sum of diet rows (decimals allowed); title/subtitle use Math.round for labels.
 * linkedDietId is always null (aggregate row).
 */
async function upsertAggregatedDietLogRow(userId, dateKeyStr, meal, dietsForMeal) {
  const durationMinutes = 15;
  const sumKcal = dietsForMeal.reduce((s, d) => {
    const k = Number(d?.calories);
    return s + (Number.isFinite(k) ? k : 0);
  }, 0);
  const baseTime = earliestTimeFromDiets(meal, dietsForMeal);

  const dupRows = await ScheduleItem.find({
    userId,
    date: dateKeyStr,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
    meal,
  })
    .sort({ createdAt: 1 })
    .lean();

  if (dupRows.length > 1) {
    dupRows.sort((a, b) => {
      const aAgg = a.linkedDietId ? 1 : 0;
      const bAgg = b.linkedDietId ? 1 : 0;
      if (aAgg !== bAgg) return aAgg - bAgg;
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a._id).localeCompare(String(b._id));
    });
    const keeperId = dupRows[0]._id;
    const dupIds = dupRows.slice(1).map((r) => r._id);
    if (dupIds.length) {
      await ScheduleItem.deleteMany({ _id: { $in: dupIds }, userId });
    }
  }

  const existing = await ScheduleItem.findOne({
    userId,
    date: dateKeyStr,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
    meal,
  }).lean();

  const dayRows = await ScheduleItem.find({ userId, date: dateKeyStr }).lean();
  const excludeId = existing ? String(existing._id) : null;

  let chosenTime = baseTime;
  const candidate = {
    date: dateKeyStr,
    time: chosenTime,
    durationMinutes,
    itemType: "diet",
    title: "🥗 Diet",
    meal,
  };

  if (!existing) {
    if (scheduleTime.hasScheduleConflict(candidate, dayRows, null)) {
      const slot = scheduleTime.findSlotForDietMeal(dateKeyStr, dayRows, meal, durationMinutes, null);
      chosenTime = slot || baseTime;
    }
  } else if (
    scheduleTime.hasScheduleConflict({ ...candidate, time: chosenTime }, dayRows, excludeId)
  ) {
    const slot = scheduleTime.findSlotForDietMeal(dateKeyStr, dayRows, meal, durationMinutes, excludeId);
    chosenTime = slot || chosenTime;
  }

  const roundedLabel = Math.round(sumKcal);
  const mealLabel = formatMealTypeTitleCase(meal);
  const patch = {
    userId,
    date: dateKeyStr,
    time: String(chosenTime).slice(0, 5),
    title: "🥗 Diet",
    subtitle: `${mealLabel} · ${roundedLabel} kcal`,
    meal,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
    totalCalories: Math.max(0, sumKcal),
    durationMinutes,
    note: "",
    category: "",
    planName: "",
    dietPlanId: "",
    planId: null,
    courseId: null,
    linkedDietId: null,
    overlapAccepted: false,
  };

  if (existing) {
    const full = await ScheduleItem.findById(existing._id).lean();
    if (full?.is_completed) {
      patch.is_completed = true;
      patch.completed_at = full.completed_at || null;
    } else {
      patch.is_completed = false;
      patch.completed_at = null;
    }
    await ScheduleItem.updateOne({ _id: existing._id, userId }, { $set: patch });
    const scheduleItemId = existing._id;
    const dietIds = dietsForMeal.map((d) => d._id).filter(Boolean);
    if (dietIds.length) {
      await Diet.updateMany({ _id: { $in: dietIds }, userId }, { $set: { scheduleItemId } });
    }
    return scheduleItemId;
  }

  const created = await ScheduleItem.create({
    ...patch,
    is_completed: false,
    completed_at: null,
  });
  const dietIds = dietsForMeal.map((d) => d._id).filter(Boolean);
  if (dietIds.length) {
    await Diet.updateMany({ _id: { $in: dietIds }, userId }, { $set: { scheduleItemId: created._id } });
  }
  return created._id;
}

/**
 * Rebuild diet_log_sync schedule rows from Diet records for one calendar day.
 * Removes legacy per-record diet_log_sync rows and empty meals.
 */
async function reconcileDietSchedulesForDate(userId, dateKey) {
  const uid = toObjectId(userId);
  const dateKeyStr = String(dateKey || "").trim();
  if (!uid || !isValidDateKey(dateKeyStr)) return;

  const diets = await Diet.find({ userId: uid, date: dayRangeFromDateKey(dateKeyStr) }).lean();
  const byMeal = new Map();
  for (const d of diets) {
    const meal = String(d.mealType || "").toLowerCase();
    if (!MEAL_TYPES.has(meal)) continue;
    if (!byMeal.has(meal)) byMeal.set(meal, []);
    byMeal.get(meal).push(d);
  }

  const keptIds = [];
  for (const [meal, list] of byMeal) {
    const id = await upsertAggregatedDietLogRow(uid, dateKeyStr, meal, list);
    if (id) keptIds.push(id);
  }

  const filterOrphans = {
    userId: uid,
    date: dateKeyStr,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
  };

  if (!keptIds.length) {
    await ScheduleItem.deleteMany(filterOrphans);
    return;
  }

  await ScheduleItem.deleteMany({
    ...filterOrphans,
    _id: { $nin: keptIds },
  });
}

/**
 * @deprecated Prefer reconcileDietSchedulesForDate — kept for backward-compatible imports.
 */
async function syncDietLogScheduleForMeal(userId, dateKey) {
  await reconcileDietSchedulesForDate(userId, dateKey);
}

module.exports = {
  reconcileDietSchedulesForDate,
  syncDietLogScheduleForMeal,
  formatDateKeyFromDate,
  dayRangeFromDateKey,
  DIET_LOG_SOURCE,
  MEAL_TYPES,
  isValidDateKey,
};
