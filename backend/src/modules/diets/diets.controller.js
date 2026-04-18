const https = require("https");
const asyncHandler = require("../../utils/asyncHandler");
const Diet = require("../../models/Diet");
const User = require("../../models/User");
const { reconcileDietSchedulesForDate } = require("../../utils/dietScheduleSync");
const FOOD_LIBRARY = require("./foodLibrary");

const ALLOWED_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
const ACTIVITY_FACTOR = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function roundOne(value) {
  return Math.round(toNumber(value) * 10) / 10;
}

function roundInt(value) {
  return Math.round(toNumber(value));
}

function isValidDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""));
}

function dayRangeFromDateKey(dateKey) {
  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { $gte: start, $lt: end };
}

function safeDateKey(value) {
  if (isValidDateKey(value)) return value;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateKeyFromDate(value) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return safeDateKey();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatTimeKeyFromDate(value) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "12:00";
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function normalizeRecordedTimeLocal(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function formatMealTypeLabel(mealType) {
  const key = String(mealType || "").toLowerCase();
  if (key === "breakfast") return "Breakfast";
  if (key === "lunch") return "Lunch";
  if (key === "dinner") return "Dinner";
  return "Snack";
}

function formatKcal(value) {
  const n = roundOne(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function buildDietSubtitle(row) {
  const mealLabel = formatMealTypeLabel(row?.mealType);
  const kcal = roundInt(row?.calories);
  return `${mealLabel} - ${kcal} kcal`;
}

function localFoodRows(query, limit) {
  const keyword = String(query || "").trim().toLowerCase();
  const rows = keyword ? FOOD_LIBRARY.filter((x) => x.name.toLowerCase().includes(keyword)) : FOOD_LIBRARY;
  return rows.slice(0, limit).map((food) => ({
    id: food.id,
    name: food.name,
    caloriesPer100g: roundOne(food.caloriesPer100g),
    proteinPer100g: roundOne(food.proteinPer100g),
    carbsPer100g: roundOne(food.carbsPer100g),
    fatPer100g: roundOne(food.fatPer100g),
    category: food.category || "other",
    mealTypes: food.mealTypes || [],
    source: "local",
    fdcId: null,
    calories: roundOne(food.caloriesPer100g),
    protein: roundOne(food.proteinPer100g),
    carbs: roundOne(food.carbsPer100g),
    fat: roundOne(food.fatPer100g),
  }));
}

function extractNutrient(foodNutrients, keyword) {
  const rows = Array.isArray(foodNutrients) ? foodNutrients : [];
  const found = rows.find((nutrient) => String(nutrient?.nutrientName || "").toLowerCase().includes(keyword));
  const value = Number(found?.value);
  return Number.isFinite(value) ? value : 0;
}

function buildUsdaDisplayName(item) {
  const base = String(item?.description || "").replace(/\s+/g, " ").trim();
  if (!base) return "Unknown food";

  const tokenCount = base.split(/[\s,/-]+/).filter(Boolean).length;
  const qualifierCandidates = [item?.additionalDescriptions, item?.foodCategory, item?.dataType, item?.brandOwner]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const qualifier = qualifierCandidates[0] || "";

  // USDA often returns generic one-word names (e.g. "BEEF").
  // Append a stable USDA qualifier so users can distinguish entries.
  if (qualifier && tokenCount <= 1) return `${base}, ${qualifier}`;
  return base;
}

function mapUsdaFoodItem(item) {
  const caloriesPer100g = extractNutrient(item.foodNutrients, "energy");
  const proteinPer100g = extractNutrient(item.foodNutrients, "protein");
  const carbsPer100g = extractNutrient(item.foodNutrients, "carbohydrate");
  const fatPer100g = extractNutrient(item.foodNutrients, "total lipid");
  return {
    id: `usda-${item.fdcId}`,
    fdcId: item.fdcId || null,
    name: buildUsdaDisplayName(item),
    caloriesPer100g: roundOne(caloriesPer100g),
    proteinPer100g: roundOne(proteinPer100g),
    carbsPer100g: roundOne(carbsPer100g),
    fatPer100g: roundOne(fatPer100g),
    category: "usda",
    mealTypes: [],
    source: "usda",
    calories: roundOne(caloriesPer100g),
    protein: roundOne(proteinPer100g),
    carbs: roundOne(carbsPer100g),
    fat: roundOne(fatPer100g),
  };
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const target = new URL(url);
    const req = https.request(
      {
        method: "POST",
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const statusCode = Number(res.statusCode || 0);
          console.log("[Diet][USDA] response status", { statusCode, ok: statusCode >= 200 && statusCode < 300 });
          if (statusCode < 200 || statusCode >= 300) {
            const error = new Error(`USDA request failed with status ${statusCode}`);
            error.statusCode = statusCode;
            error.responseSnippet = String(data || "").slice(0, 240);
            return reject(error);
          }
          try {
            resolve(JSON.parse(data || "{}"));
          } catch {
            reject(new Error("Failed to parse USDA response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function searchUsdaFoods({ query, limit }) {
  const apiKey = String(process.env.USDA_API_KEY || "").trim();
  console.log("[Diet][USDA] env check", {
    hasApiKey: Boolean(apiKey),
    apiKeyLength: apiKey.length,
  });
  if (!apiKey) return [];
  const keyword = String(query || "").trim() || "healthy";
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`;
  const payload = {
    query: keyword,
    pageSize: Math.min(Math.max(limit, 1), 50),
    dataType: ["Foundation", "SR Legacy", "Branded", "Survey (FNDDS)"],
  };
  console.log("[Diet][USDA] request", { keyword, pageSize: payload.pageSize, keyAttachedInUrl: url.includes("api_key=") });
  const response = await postJson(url, payload);
  const foods = Array.isArray(response?.foods) ? response.foods : [];
  console.log("[Diet][USDA] payload result", { keyword, totalHits: Number(response?.totalHits || 0), foodsLength: foods.length });
  return foods.map(mapUsdaFoodItem).filter((item) => item.name);
}

function estimateTargets(user) {
  const weight = toNumber(user?.weight);
  const targetWeight = toNumber(user?.targetWeight);
  const height = toNumber(user?.height);
  const age = toNumber(user?.age);
  const gender = String(user?.gender || "prefer_not_to_say");
  const activityLevel = String(user?.activityLevel || "moderate");
  const factor = ACTIVITY_FACTOR[activityLevel] || ACTIVITY_FACTOR.moderate;

  let bmr = 0;
  if (weight > 0 && height > 0 && age > 0) {
    const sexAdjust = gender === "male" ? 5 : gender === "female" ? -161 : -78;
    bmr = 10 * weight + 6.25 * height - 5 * age + sexAdjust;
  } else if (weight > 0) {
    bmr = weight * 22;
  } else {
    bmr = 1500;
  }

  const maintenanceCalories = roundInt(Math.max(1300, bmr * factor));
  const weightGap = targetWeight > 0 && weight > 0 ? targetWeight - weight : 0;
  const hasCustomGoal = Number.isFinite(Number(user?.calorieGoal)) && Number(user?.calorieGoal) > 0;
  let dailyTargetCalories = hasCustomGoal ? roundInt(Number(user.calorieGoal)) : maintenanceCalories;
  if (!hasCustomGoal && Math.abs(weightGap) >= 0.5) dailyTargetCalories += weightGap < 0 ? -350 : 280;
  dailyTargetCalories = Math.min(3800, Math.max(1200, dailyTargetCalories));

  const suggestedWorkoutBurn = weightGap < -0.5 ? 220 : weightGap > 0.5 ? 120 : 160;
  const proteinTarget = weight > 0 ? roundInt(weight * (weightGap < 0 ? 1.8 : 1.6)) : roundInt((dailyTargetCalories * 0.3) / 4);
  const fatTarget = weight > 0 ? roundInt(weight * 0.8) : roundInt((dailyTargetCalories * 0.25) / 9);
  const carbsTarget = Math.max(80, roundInt((dailyTargetCalories - proteinTarget * 4 - fatTarget * 9) / 4));

  return {
    maintenanceCalories,
    dailyTargetCalories,
    suggestedWorkoutBurn,
    proteinTarget,
    carbsTarget,
    fatTarget,
    activityLevel,
    weightGap: roundOne(weightGap),
  };
}

function summarizeRows(rows) {
  return rows.reduce(
    (acc, row) => ({
      calories: acc.calories + toNumber(row.calories),
      protein: acc.protein + toNumber(row.protein),
      carbs: acc.carbs + toNumber(row.carbs),
      fat: acc.fat + toNumber(row.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function sanitizePayload(payload) {
  const errors = [];
  const foodName = String(payload.foodName || "").trim();
  const mealType = String(payload.mealType || "").trim() || "lunch";
  const date = payload.date ? new Date(payload.date) : new Date();
  const amountInGrams = Number(payload.amountInGrams ?? payload.amount);
  const calories = Number(payload.calories);
  const protein = payload.protein == null ? 0 : Number(payload.protein);
  const carbs = payload.carbs == null ? 0 : Number(payload.carbs);
  const fat = payload.fat == null ? 0 : Number(payload.fat);
  const note = String(payload.note || "").trim();
  const sourceType = payload.sourceType === "recommended" ? "recommended" : "manual";
  const foodId = String(payload.foodId || "").trim();
  const recommendationId = String(payload.recommendationId || "").trim();
  const dietPlanId = String(payload.dietPlanId || "").trim().slice(0, 64);
  const planName = String(payload.planName || "").trim().slice(0, 120);
  const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : null;
  const recordedTimeLocalNorm = normalizeRecordedTimeLocal(payload.recordedTimeLocal);

  if (!foodName) errors.push("foodName is required");
  if (!ALLOWED_MEAL_TYPES.has(mealType)) errors.push("mealType is invalid");
  if (!Number.isFinite(amountInGrams) || amountInGrams <= 0) errors.push("amountInGrams must be a positive number");
  if (!Number.isFinite(calories) || calories < 0) errors.push("calories must be a non-negative number");
  if (!Number.isFinite(protein) || protein < 0) errors.push("protein must be a non-negative number");
  if (!Number.isFinite(carbs) || carbs < 0) errors.push("carbs must be a non-negative number");
  if (!Number.isFinite(fat) || fat < 0) errors.push("fat must be a non-negative number");
  if (Number.isNaN(date.getTime())) errors.push("date is invalid");
  if (payload.recordedAt && Number.isNaN(recordedAt.getTime())) errors.push("recordedAt is invalid");

  const data = {
    foodName,
    mealType,
    amount: amountInGrams,
    amountInGrams,
    calories,
    protein,
    carbs,
    fat,
    date,
    note,
    unit: "g",
    sourceType,
    foodId,
    recommendationId,
  };
  if (recordedAt) data.recordedAt = recordedAt;
  if (recordedTimeLocalNorm) data.recordedTimeLocal = recordedTimeLocalNorm;
  if (dietPlanId) data.dietPlanId = dietPlanId;
  if (planName) data.planName = planName;

  return { errors, data };
}

function serializeDiet(row) {
  const grams = toNumber(row.amountInGrams, toNumber(row.amount, 100));
  const dateKey = formatDateKeyFromDate(row.date);
  const timeKey = row.recordedTimeLocal
    ? String(row.recordedTimeLocal).trim().slice(0, 5)
    : formatTimeKeyFromDate(row.recordedAt || row.createdAt);
  return {
    id: String(row._id || row.id || ""),
    ...row,
    date: dateKey,
    time: timeKey,
    amount: grams,
    amountInGrams: grams,
    calories: toNumber(row.calories),
    protein: toNumber(row.protein),
    carbs: toNumber(row.carbs),
    fat: toNumber(row.fat),
    unit: row.unit || "g",
    sourceType: row.sourceType || "manual",
    foodId: row.foodId || "",
    recommendationId: row.recommendationId || "",
    scheduleItemId: row.scheduleItemId ? String(row.scheduleItemId) : "",
    recordedAt: row.recordedAt || row.createdAt || null,
    recordedTimeLocal: timeKey,
    dietPlanId: row.dietPlanId ? String(row.dietPlanId).trim() : "",
    planId: row.dietPlanId ? String(row.dietPlanId).trim() : "",
    source: row.sourceType === "recommended" ? "plan" : "manual",
    planName: row.planName ? String(row.planName).trim() : "",
  };
}

const searchFoods = asyncHandler(async (req, res) => {
  const rawQuery = String(req.query.query || req.query.q || "").trim();
  const query = rawQuery.toLowerCase();
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 60);
  const source = String(req.query.source || "").trim().toLowerCase();
  console.log("[Diet][FoodSearch] incoming", { rawQuery, normalizedQuery: query, limit, source: source || "default" });

  if (source === "local") {
    const localRows = localFoodRows(query, limit);
    console.log("[Diet][FoodSearch] final source", { rawQuery, source: "local_forced", count: localRows.length });
    return res.json(localRows);
  }

  const fallbackRows = localFoodRows(query, limit);
  try {
    const usdaRows = await searchUsdaFoods({ query, limit });
    if (usdaRows.length) {
      const out = usdaRows.slice(0, limit);
      console.log("[Diet][FoodSearch] final source", { rawQuery, source: "usda", count: out.length });
      return res.json(out);
    }
    console.log("[Diet][FoodSearch] final source", { rawQuery, source: "local_fallback", count: fallbackRows.length });
    return res.json(fallbackRows);
  } catch (error) {
    console.warn("[Diet][FoodSearch] USDA failed", {
      rawQuery,
      statusCode: Number(error?.statusCode || 0) || null,
      reason: error?.message || "unknown",
    });
    console.log("[Diet][FoodSearch] final source", { rawQuery, source: "local_fallback", count: fallbackRows.length });
    return res.json(fallbackRows);
  }
});

const getOverview = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const dateKey = safeDateKey(req.query.date);
  const [user, rows] = await Promise.all([
    User.findById(userId).select("gender age height weight targetWeight activityLevel calorieGoal").lean(),
    Diet.find({ userId, date: dayRangeFromDateKey(dateKey) }).sort({ createdAt: -1 }).lean(),
  ]);
  const targets = estimateTargets(user);
  const consumed = summarizeRows(rows);
  res.json({
    date: dateKey,
    target: {
      calories: targets.dailyTargetCalories,
      maintenanceCalories: targets.maintenanceCalories,
      suggestedWorkoutBurn: targets.suggestedWorkoutBurn,
      protein: targets.proteinTarget,
      carbs: targets.carbsTarget,
      fat: targets.fatTarget,
      activityLevel: targets.activityLevel,
      weightGap: targets.weightGap,
    },
    consumed: {
      calories: roundOne(consumed.calories),
      protein: roundOne(consumed.protein),
      carbs: roundOne(consumed.carbs),
      fat: roundOne(consumed.fat),
    },
    remaining: {
      calories: roundOne(targets.dailyTargetCalories - consumed.calories),
      protein: roundOne(targets.proteinTarget - consumed.protein),
      carbs: roundOne(targets.carbsTarget - consumed.carbs),
      fat: roundOne(targets.fatTarget - consumed.fat),
    },
  });
});

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const match = { userId };
  if (isValidDateKey(req.query.date)) match.date = dayRangeFromDateKey(req.query.date);
  const rows = await Diet.find(match).sort({ date: -1, recordedAt: -1, createdAt: -1 }).lean();
  res.json(rows.map(serializeDiet));
});

const create = asyncHandler(async (req, res) => {
  const uid = req.body.userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const { errors, data } = sanitizePayload(req.body);
  if (errors.length) return res.status(400).json({ message: errors[0] });
  const row = await Diet.create({ userId: uid, ...data, recordedAt: data.recordedAt || new Date() });
  const fresh = await Diet.findById(row._id).lean();
  const out = serializeDiet(fresh || row.toObject());
  const dk = formatDateKeyFromDate((fresh || row).date);
  if (dk) await reconcileDietSchedulesForDate(uid, dk);
  res.status(201).json(out);
});

const update = asyncHandler(async (req, res) => {
  const row = await Diet.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Diet record not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const prevDateKey = formatDateKeyFromDate(row.date);
  const { errors, data } = sanitizePayload(req.body);
  if (errors.length) return res.status(400).json({ message: errors[0] });
  Object.assign(row, data);
  await row.save();
  const fresh = await Diet.findById(row._id).lean();
  const out = serializeDiet(fresh || row.toObject());
  const nextDateKey = formatDateKeyFromDate((fresh || row).date);
  if (nextDateKey) await reconcileDietSchedulesForDate(req.user.id, nextDateKey);
  if (prevDateKey && prevDateKey !== nextDateKey) {
    await reconcileDietSchedulesForDate(req.user.id, prevDateKey);
  }
  res.json(out);
});

const remove = asyncHandler(async (req, res) => {
  const row = await Diet.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Diet record not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const prevDateKey = formatDateKeyFromDate(row.date);
  await row.deleteOne();
  if (prevDateKey) await reconcileDietSchedulesForDate(req.user.id, prevDateKey);
  res.json({ success: true });
});

module.exports = { list, create, update, remove, searchFoods, getOverview };
