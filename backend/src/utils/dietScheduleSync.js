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

function formatTotalKcalLabel(sum) {
  const n = Math.round(Number(sum) * 10) / 10;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
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

function dietTitleFromRow(d) {
  const name = String(d?.foodName || "Diet").trim() || "Diet";
  const kcal = Number(d?.calories);
  const k = Number.isFinite(kcal) ? kcal : 0;
  return `${name} · ${formatTotalKcalLabel(k)} kcal`;
}

/**
 * One ScheduleItem per Diet document (linkedDietId), scheduleSource=diet_log_sync.
 * Removes orphan diet_log_sync rows for the calendar day (no matching Diet).
 */
async function reconcileDietSchedulesForDate(userId, dateKey) {
  const uid = toObjectId(userId);
  const dateKeyStr = String(dateKey || "").trim();
  if (!uid || !isValidDateKey(dateKeyStr)) return;

  const diets = await Diet.find({ userId: uid, date: dayRangeFromDateKey(dateKeyStr) }).lean();
  const dietIds = diets.map((d) => d._id).filter(Boolean);

  for (const d of diets) {
    await upsertDietLogScheduleRow(uid, d, dateKeyStr);
  }

  const filterOrphans = {
    userId: uid,
    date: dateKeyStr,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
  };

  if (!dietIds.length) {
    await ScheduleItem.deleteMany(filterOrphans);
    return;
  }

  await ScheduleItem.deleteMany({
    ...filterOrphans,
    $or: [{ linkedDietId: null }, { linkedDietId: { $nin: dietIds } }],
  });
}

async function upsertDietLogScheduleRow(userId, diet, dateKeyStr) {
  const meal = String(diet.mealType || "").toLowerCase();
  if (!MEAL_TYPES.has(meal)) return;

  const durationMinutes = 15;
  const timeFromDiet = normalizeHHmm(diet.recordedTimeLocal);
  const baseTime = timeFromDiet || MEAL_DEFAULT_TIME[meal] || "12:00";

  const filter = {
    userId,
    linkedDietId: diet._id,
    scheduleSource: DIET_LOG_SOURCE,
  };

  let existing = await ScheduleItem.findOne(filter).lean();
  const dayRows = await ScheduleItem.find({ userId, date: dateKeyStr }).lean();

  let chosenTime = baseTime;
  if (!existing) {
    const candidate = {
      date: dateKeyStr,
      time: baseTime,
      durationMinutes,
      itemType: "diet",
      title: "Diet",
      meal,
    };
    if (scheduleTime.hasScheduleConflict(candidate, dayRows, null)) {
      const slot = scheduleTime.findSlotForDietMeal(dateKeyStr, dayRows, meal, durationMinutes, null);
      chosenTime = slot || baseTime;
    }
  } else {
    chosenTime = baseTime;
    const candidate = {
      date: dateKeyStr,
      time: chosenTime,
      durationMinutes,
      itemType: "diet",
      title: "Diet",
      meal,
    };
    if (scheduleTime.hasScheduleConflict(candidate, dayRows, String(existing._id))) {
      const slot = scheduleTime.findSlotForDietMeal(dateKeyStr, dayRows, meal, durationMinutes, String(existing._id));
      chosenTime = slot || chosenTime;
    }
  }

  const patch = {
    userId,
    date: dateKeyStr,
    time: String(chosenTime).slice(0, 5),
    title: dietTitleFromRow(diet),
    subtitle: formatMealTypeTitleCase(meal),
    meal,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
    totalCalories: Math.max(0, Number(diet.calories) || 0),
    durationMinutes,
    note: "",
    category: "",
    planName: String(diet.planName || "").trim(),
    dietPlanId: String(diet.dietPlanId || "").trim(),
    planId: null,
    courseId: null,
    linkedDietId: diet._id,
    overlapAccepted: false,
  };

  if (existing) {
    await ScheduleItem.updateOne({ _id: existing._id, userId }, { $set: patch });
    await Diet.updateOne({ _id: diet._id, userId }, { $set: { scheduleItemId: existing._id } });
    return;
  }

  const created = await ScheduleItem.create(patch);
  await Diet.updateOne({ _id: diet._id, userId }, { $set: { scheduleItemId: created._id } });
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
};
