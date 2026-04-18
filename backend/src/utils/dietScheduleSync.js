const Diet = require("../models/Diet");
const ScheduleItem = require("../models/ScheduleItem");
const scheduleTime = require("./scheduleTime");

const DIET_LOG_SOURCE = "diet_log_sync";
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

/** Fixed default start times for diet_log_sync meal blocks (not derived from record timestamps). */
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

function dietRowsChronological(a, b) {
  const ta = new Date(a.recordedAt || a.createdAt || 0).getTime();
  const tb = new Date(b.recordedAt || b.createdAt || 0).getTime();
  if (ta !== tb) return ta - tb;
  return String(a._id).localeCompare(String(b._id));
}

/**
 * Placement time for a **new** diet meal block only: meal-type default, then meal-window / conflict helpers.
 * Does not use Diet record wall-clock times.
 */
function resolveNewDietMealBlockTime({ dateKeyStr, mealKey, durationMinutes, dayRows }) {
  const baseTime = MEAL_DEFAULT_TIME[mealKey] || "12:00";
  const candidate = {
    date: dateKeyStr,
    time: baseTime,
    durationMinutes,
    itemType: "diet",
    title: "Diet",
    meal: mealKey,
  };
  if (!scheduleTime.hasScheduleConflict(candidate, dayRows, null)) {
    return baseTime;
  }
  const slot = scheduleTime.findSlotForDietMeal(dateKeyStr, dayRows, mealKey, durationMinutes, null);
  return slot || baseTime;
}

/**
 * One ScheduleItem per user + calendar date + mealType, backed by real Diet rows only.
 * On updates, `time` is not overwritten so user-edited schedule times persist across record syncs.
 */
async function syncDietLogScheduleForMeal(userId, dateKey, mealType) {
  const m = String(mealType || "").toLowerCase();
  if (!MEAL_TYPES.has(m) || !isValidDateKey(dateKey)) return;

  const dateKeyStr = String(dateKey).trim();

  const rows = (await Diet.find({ userId, mealType: m, date: dayRangeFromDateKey(dateKeyStr) }).lean()).sort(dietRowsChronological);

  const filter = {
    userId,
    date: dateKeyStr,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
    meal: m,
  };

  if (!rows.length) {
    await ScheduleItem.deleteMany(filter);
    return;
  }

  const totalCals = rows.reduce((acc, r) => {
    const c = Number(r.calories);
    return acc + (Number.isFinite(c) ? c : 0);
  }, 0);

  const earliest = rows[0];
  const mealLabel = formatMealTypeTitleCase(m);
  const title = `${mealLabel} · ${formatTotalKcalLabel(totalCals)} kcal`;
  const durationMinutes = 15;

  const existing = await ScheduleItem.find(filter).sort({ createdAt: 1 }).lean();
  const keepId = existing[0]?._id;
  if (existing.length > 1) {
    const extras = existing.slice(1).map((x) => x._id);
    await ScheduleItem.deleteMany({ _id: { $in: extras } });
  }

  const dayRows = await ScheduleItem.find({ userId, date: dateKeyStr }).lean();

  const patch = {
    date: dateKeyStr,
    title,
    subtitle: "",
    meal: m,
    itemType: "diet",
    scheduleSource: DIET_LOG_SOURCE,
    totalCalories: totalCals,
    durationMinutes,
    note: "",
    category: "",
    planName: "",
    dietPlanId: "",
    planId: null,
    courseId: null,
    linkedDietId: earliest._id,
    overlapAccepted: false,
  };

  if (!keepId) {
    patch.time = resolveNewDietMealBlockTime({
      dateKeyStr,
      mealKey: m,
      durationMinutes,
      dayRows,
    });
  }

  if (keepId) {
    await ScheduleItem.updateOne({ _id: keepId, userId }, { $set: patch });
  } else {
    await ScheduleItem.create({ userId, ...patch });
  }
}

module.exports = {
  syncDietLogScheduleForMeal,
  formatDateKeyFromDate,
  dayRangeFromDateKey,
  DIET_LOG_SOURCE,
};
