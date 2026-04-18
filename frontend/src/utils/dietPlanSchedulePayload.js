/** Meal calorie shares by plan type (aligned with DietView PLAN_MEAL_DISTRIBUTION). */
const PLAN_MEAL_DISTRIBUTION = {
  hot: { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 },
  fat_loss: { breakfast: 0.24, lunch: 0.34, dinner: 0.31, snack: 0.11 },
  weight_loss: { breakfast: 0.24, lunch: 0.34, dinner: 0.31, snack: 0.11 },
  muscle_gain: { breakfast: 0.26, lunch: 0.35, dinner: 0.29, snack: 0.1 },
  high_protein: { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 },
  balanced: { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 },
};

export const DIET_PLAN_MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];

/** Schedule rows created by Diet "Apply plan" (whole-day meal plan). */
export const DIET_PLAN_APPLY_SOURCE = "diet_plan_apply";

/** Legacy rows that mirrored food logs on the calendar — hidden from Schedule / Upcoming. */
export const DIET_FOOD_LOG_SCHEDULE_SOURCE = "diet_log_sync";

export function isDietFoodLogScheduleRow(item) {
  return (
    String(item?.itemType || "").toLowerCase() === "diet" &&
    String(item?.scheduleSource || "").trim() === DIET_FOOD_LOG_SCHEDULE_SOURCE
  );
}

/** Diet block from whole-day Apply Plan (four meals) — the only diet rows intended for Dashboard Upcoming. */
export function isDietMealPlanApplyRow(item) {
  return (
    String(item?.itemType || "").toLowerCase() === "diet" &&
    String(item?.scheduleSource || "").trim() === DIET_PLAN_APPLY_SOURCE
  );
}

const MEAL_ORDER = DIET_PLAN_MEAL_ORDER;

/**
 * True when the given plan has exactly four diet_plan_apply rows (one per meal) on that date.
 * @param {object[]} rows schedule items from API
 * @param {string} date YYYY-MM-DD
 * @param {string} dietPlanId stable plan id (e.g. PLAN_DEFINITIONS id)
 */
export function isDietPlanFullyOnSchedule(rows, date, dietPlanId) {
  const pid = String(dietPlanId || "").trim();
  const d = String(date || "").trim();
  if (!pid || !d) return false;
  const rel = (rows || []).filter(
    (r) =>
      String(r?.date || "") === d &&
      String(r?.itemType || "").toLowerCase() === "diet" &&
      String(r?.scheduleSource || "") === DIET_PLAN_APPLY_SOURCE &&
      String(r?.dietPlanId || "").trim() === pid
  );
  if (rel.length !== 4) return false;
  const meals = new Set(rel.map((r) => String(r?.meal || "").toLowerCase()));
  return MEAL_ORDER.every((m) => meals.has(m));
}

export function buildDietPlanMealsPayload(targetTotalKcal, planType) {
  const total = Math.max(1200, Math.round(Number(targetTotalKcal) || 2000));
  const dist = PLAN_MEAL_DISTRIBUTION[String(planType || "").trim()] || PLAN_MEAL_DISTRIBUTION.balanced;
  return MEAL_ORDER.map((m) => ({
    mealType: m,
    calories: Math.round(total * (dist[m] || 0.25)),
  }));
}
