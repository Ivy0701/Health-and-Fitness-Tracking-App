/**
 * Single source for personalized daily calories + macro targets (Diet + Dashboard).
 * Based on current/target weight, targetDays pace, optional calorieGoal, activity tier, and plan nudge.
 * Macro grams: 30% protein, 40% carbs, 30% fat of total kcal (4 kcal/g protein & carbs, 9 kcal/g fat).
 */

import { PLAN_DEFINITIONS } from "../constants/dietPlans";

export const RECORD_MODE_MEAL_SHARES = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.25,
  snack: 0.15,
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundToInt(value) {
  return Math.round(toNumber(value));
}

function roundToOne(value) {
  return Math.round(toNumber(value) * 10) / 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function activityKcalPerKg(activityLevel) {
  const map = { sedentary: 28, light: 30, moderate: 32, active: 34, very_active: 36 };
  const key = String(activityLevel || "moderate");
  return map[key] ?? 32;
}

export function estimateGoalDaysFromUser(user) {
  const profileDays = Number(user?.targetDays);
  if (Number.isFinite(profileDays) && profileDays > 0) return clamp(Math.round(profileDays), 7, 3650);
  return 90;
}

export function planTypeCalorieNudge(planType) {
  const t = String(planType || "balanced");
  if (t === "muscle_gain") return 120;
  if (t === "fat_loss" || t === "weight_loss") return -90;
  if (t === "high_protein") return -50;
  return 0;
}

/** Unified macro split from daily calorie total (fixed calorie ratios). */
export function macroTargetsFromTotalCalories(dailyCalories) {
  const daily = Math.max(1, roundToInt(dailyCalories));
  return {
    protein: roundToInt((daily * 0.3) / 4),
    carbs: roundToInt((daily * 0.4) / 4),
    fat: roundToInt((daily * 0.3) / 9),
  };
}

export function computePersonalizedDietTargetsCore(user, planType) {
  if (!user) return null;
  const weight = toNumber(user.weight);
  const targetW = toNumber(user.targetWeight);
  const calorieGoal = Number(user.calorieGoal);
  if (Number.isFinite(calorieGoal) && calorieGoal > 0) {
    const daily = clamp(roundToInt(calorieGoal), 1200, 3800);
    const wg = targetW > 0 && weight > 0 ? targetW - weight : 0;
    const suggestedWorkoutBurn = wg < -0.5 ? 220 : wg > 0.5 ? 120 : 160;
    return {
      dailyCalories: daily,
      suggestedWorkoutBurn,
      ...macroTargetsFromTotalCalories(daily),
    };
  }
  if (!(weight > 0 && targetW > 0)) return null;

  const days = estimateGoalDaysFromUser(user);
  const maintenance = clamp(roundToInt(weight * activityKcalPerKg(user.activityLevel)), 1300, 3800);
  const weightGap = targetW - weight;
  const gapAbsKg = Math.abs(weightGap);
  const pace = gapAbsKg >= 0.5 ? clamp((gapAbsKg * 7700) / Math.max(days, 1), 0, 500) : 0;

  let daily = maintenance;
  if (weightGap < -0.5) daily = maintenance - pace;
  else if (weightGap > 0.5) daily = maintenance + Math.min(pace, 400);

  daily = clamp(roundToInt(daily + planTypeCalorieNudge(planType)), 1200, 3800);
  const suggestedWorkoutBurn = weightGap < -0.5 ? 220 : weightGap > 0.5 ? 120 : 160;
  return {
    dailyCalories: daily,
    suggestedWorkoutBurn,
    ...macroTargetsFromTotalCalories(daily),
  };
}

export function allocateMealCaloriesFromTotal(targetTotal, shares = RECORD_MODE_MEAL_SHARES) {
  const t = Math.max(0, roundToInt(targetTotal));
  if (t <= 0) {
    return { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  }
  const keys = ["breakfast", "lunch", "dinner", "snack"];
  const parts = keys.map((k) => roundToInt(t * (shares[k] || 0)));
  const diff = t - parts.reduce((a, b) => a + b, 0);
  parts[3] += diff;
  return { breakfast: parts[0], lunch: parts[1], dinner: parts[2], snack: parts[3] };
}

/**
 * Split daily macro gram targets across meals using the same meal shares as calories.
 * Rounds each meal to 0.1 g and applies the remainder to snack so row sums match the daily target.
 */
export function allocateMealMacrosFromDaily(dailyProtein, dailyCarbs, dailyFat, shares = RECORD_MODE_MEAL_SHARES) {
  const keys = ["breakfast", "lunch", "dinner", "snack"];
  const allocateOne = (daily) => {
    const d = Math.max(0, toNumber(daily));
    if (d <= 0) return keys.map(() => 0);
    const parts = keys.map((k) => roundToOne(d * (shares[k] || 0)));
    const sum = roundToOne(parts.reduce((a, b) => a + b, 0));
    const diff = roundToOne(d - sum);
    parts[3] = roundToOne(parts[3] + diff);
    return parts;
  };
  const p = allocateOne(dailyProtein);
  const c = allocateOne(dailyCarbs);
  const f = allocateOne(dailyFat);
  const out = {};
  keys.forEach((k, i) => {
    out[k] = { protein: p[i], carbs: c[i], fat: f[i] };
  });
  return out;
}

export function personalizedPlanTypeFromProfile(user) {
  const w = toNumber(user?.weight);
  const t = toNumber(user?.targetWeight);
  if (!(w > 0 && t > 0)) return "balanced";
  if (t < w - 0.5) return "weight_loss";
  if (t > w + 0.5) return "muscle_gain";
  return "balanced";
}

export function planTypeForDashboard(profile) {
  if (!profile) return "balanced";
  const uid = String(profile.id || profile._id || "").trim();
  let appliedId = "";
  try {
    const key = uid ? `diet:applied-plan:${uid}` : "";
    appliedId = key ? String(window.localStorage.getItem(key) || "").trim() : "";
  } catch {
    appliedId = "";
  }
  const def = PLAN_DEFINITIONS.find((p) => p.id === appliedId);
  if (def?.type) return def.type;
  return personalizedPlanTypeFromProfile(profile);
}
