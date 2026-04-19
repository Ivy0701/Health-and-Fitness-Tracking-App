<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import VipPromptModal from "../components/common/VipPromptModal.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";
import { useFavorites } from "../services/favorites";
import { getTodayLocalDate } from "../utils/dateLocal";
import { PLAN_DEFINITIONS } from "../constants/dietPlans";
import {
  allocateMealCaloriesFromTotal,
  allocateMealMacrosFromDaily,
  computePersonalizedDietTargetsCore,
  macroTargetsFromTotalCalories,
} from "../utils/personalizedDietTargets";

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

/** Plausible local clock windows for “is this time unusual for this meal?” (minutes from midnight, inclusive). */
const MEAL_TIME_WINDOWS = {
  breakfast: { start: 4 * 60, end: 12 * 60 },
  lunch: { start: 11 * 60, end: 15 * 60 + 30 },
  dinner: { start: 16 * 60, end: 23 * 60 + 59 },
  snack: { start: 10 * 60, end: 22 * 60 },
};

const DEFAULT_TIME_FOR_MEAL = {
  breakfast: "08:00",
  lunch: "12:30",
  dinner: "19:00",
  snack: "16:00",
};

const LOCK_FREE_PLAN_COUNT = 4;

const PLAN_CATEGORY_BLUEPRINT = {
  hot: {
    breakfast: ["carb", "protein", "fruit"],
    lunch: ["protein", "carb", "vegetable"],
    dinner: ["protein", "carb", "vegetable"],
    snack: ["protein", "fruit"],
  },
  fat_loss: {
    breakfast: ["protein", "carb", "fruit"],
    lunch: ["protein", "vegetable", "carb"],
    dinner: ["protein", "vegetable", "carb"],
    snack: ["protein", "fruit"],
  },
  weight_loss: {
    breakfast: ["protein", "carb", "fruit"],
    lunch: ["protein", "vegetable", "carb"],
    dinner: ["protein", "vegetable", "carb"],
    snack: ["protein", "fruit"],
  },
  muscle_gain: {
    breakfast: ["carb", "protein", "fat"],
    lunch: ["protein", "carb", "vegetable"],
    dinner: ["protein", "carb", "vegetable"],
    snack: ["protein", "carb"],
  },
  high_protein: {
    breakfast: ["protein", "carb", "fruit"],
    lunch: ["protein", "protein", "vegetable"],
    dinner: ["protein", "carb", "vegetable"],
    snack: ["protein", "protein"],
  },
  balanced: {
    breakfast: ["carb", "protein", "fruit"],
    lunch: ["protein", "carb", "vegetable"],
    dinner: ["protein", "carb", "vegetable"],
    snack: ["protein", "fruit"],
  },
};

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [y, m, d] = String(key || "").split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function shiftDateKey(key, days) {
  const dt = parseDateKey(key);
  dt.setDate(dt.getDate() + days);
  return formatDateKey(dt);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundToOne(value) {
  return Math.round(toNumber(value) * 10) / 10;
}

function roundToInt(value) {
  return Math.round(toNumber(value));
}

function formatCalories(value) {
  return `${roundToInt(value)} kcal`;
}

function formatCaloriesNumber(value) {
  return roundToInt(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input) {
  return String(input || "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function formatRecordTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Local HH:mm for Schedule sync (browser wall clock). */
function localHHmmNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localHHmmFromRecordedAt(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return localHHmmNow();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeStrToMinutes(hhmm) {
  const s = String(hhmm || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

function normalizeHHmmClient(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function isTimePlausibleForMeal(mealType, hhmm) {
  const w = MEAL_TIME_WINDOWS[String(mealType || "").toLowerCase()];
  if (!w) return true;
  const t = timeStrToMinutes(normalizeHHmmClient(hhmm));
  if (!Number.isFinite(t)) return false;
  return t >= w.start && t <= w.end;
}

function isLocalWeeHours() {
  const h = new Date().getHours();
  return h >= 0 && h <= 5;
}

function defaultSuggestedTimeForMeal(mealType) {
  return DEFAULT_TIME_FOR_MEAL[String(mealType || "").toLowerCase()] || "12:00";
}

/** When true, show retroactive-time modal before saving (manual or recommended add). */
function shouldPromptRetroactiveMeal(mealType, hhmm) {
  const key = String(mealType || "").toLowerCase();
  const norm = normalizeHHmmClient(hhmm);
  if (!norm) return false;
  if (isLocalWeeHours() && (key === "breakfast" || key === "lunch")) return true;
  return !isTimePlausibleForMeal(key, norm);
}

function recordedTimeLocalForSavePayload() {
  const fromForm = normalizeHHmmClient(form.recordedTimeLocal);
  if (fromForm) return fromForm;
  if (isEditing.value) {
    const editRow = records.value.find((r) => String(r._id) === String(editingId.value));
    if (editRow?.recordedTimeLocal) return normalizeHHmmClient(editRow.recordedTimeLocal) || String(editRow.recordedTimeLocal).trim().slice(0, 5);
    return localHHmmFromRecordedAt(editRow?.recordedAt || editRow?.createdAt);
  }
  return localHHmmNow();
}

function macroForFood(food, grams) {
  const ratio = toNumber(grams) / 100;
  return {
    calories: roundToOne(toNumber(food.caloriesPer100g) * ratio),
    protein: roundToOne(toNumber(food.proteinPer100g) * ratio),
    carbs: roundToOne(toNumber(food.carbsPer100g) * ratio),
    fat: roundToOne(toNumber(food.fatPer100g) * ratio),
  };
}

const DEFAULT_MEAL_MACRO_TARGETS = { protein: 0, carbs: 0, fat: 0 };

function syncRecoItemNutrition(item) {
  const nutrition = macroForFood(item, item.recommendedGrams);
  item.estimatedCalories = nutrition.calories;
  item.estimatedProtein = nutrition.protein;
  item.estimatedCarbs = nutrition.carbs;
  item.estimatedFat = nutrition.fat;
}

function sumDisplayedMealCaloriesInt(items) {
  return items.reduce((sum, it) => sum + roundToInt(it.estimatedCalories), 0);
}

function displayedIntCaloriesAtGrams(item, grams) {
  return roundToInt(macroForFood(item, roundToOne(grams)).calories);
}

function correctMealVisibleKcalDeltaStrict(items, mealTargetInt) {
  const T = roundToInt(mealTargetInt);
  if (!Array.isArray(items) || !items.length || T <= 0) return;
  const G_MIN = 12;
  const G_MAX = 520;
  const MAX_PASS = 6;
  for (let pass = 0; pass < MAX_PASS; pass += 1) {
    if (sumDisplayedMealCaloriesInt(items) === T) return;
    const n = items.length;
    const order = [];
    for (let k = n - 1; k >= 0; k -= 1) order.push(k);
    let improved = false;
    for (let oi = 0; oi < order.length; oi += 1) {
      const idx = order[oi];
      const it = items[idx];
      let otherSum = 0;
      for (let j = 0; j < n; j += 1) {
        if (j !== idx) otherSum += roundToInt(items[j].estimatedCalories);
      }
      const neededInt = T - otherSum;
      const curG = toNumber(it.recommendedGrams);
      let bestG = curG;
      let bestDist = Math.abs(displayedIntCaloriesAtGrams(it, curG) - neededInt);
      for (let g10 = Math.round(G_MIN * 10); g10 <= Math.round(G_MAX * 10); g10 += 1) {
        const g = roundToOne(g10 / 10);
        const d = Math.abs(displayedIntCaloriesAtGrams(it, g) - neededInt);
        if (d < bestDist || (d === bestDist && Math.abs(g - curG) < Math.abs(bestG - curG))) {
          bestDist = d;
          bestG = g;
          if (d === 0) break;
        }
      }
      const curLineErr = Math.abs(displayedIntCaloriesAtGrams(it, curG) - neededInt);
      if (bestDist < curLineErr || (bestDist === 0 && curLineErr > 0)) {
        it.recommendedGrams = bestG;
        syncRecoItemNutrition(it);
        improved = true;
        if (sumDisplayedMealCaloriesInt(items) === T) return;
      }
    }
    if (!improved) break;
  }
}

function alignMealIntegerCaloriesStrict(items, mealTargetInt) {
  const T = roundToInt(mealTargetInt);
  if (!Array.isArray(items) || !items.length || T <= 0) return;
  const CAP = 520;
  const FLOOR = 12;
  const MAX = 4000;
  function intSum() {
    return sumDisplayedMealCaloriesInt(items);
  }
  function score() {
    return Math.abs(intSum() - T);
  }
  for (let u = 0; u < MAX; u += 1) {
    if (intSum() === T) return;
    const diff = T - intSum();
    const step = diff > 0 ? 0.5 : -0.5;
    let bestIdx = -1;
    let bestScore = Infinity;
    for (let i = 0; i < items.length; i += 1) {
      const g = toNumber(items[i].recommendedGrams);
      if (diff > 0 && g >= CAP - 0.01) continue;
      if (diff < 0 && g <= FLOOR + 0.01) continue;
      const prevG = items[i].recommendedGrams;
      items[i].recommendedGrams = roundToOne(g + step);
      syncRecoItemNutrition(items[i]);
      const sc = score();
      items[i].recommendedGrams = prevG;
      syncRecoItemNutrition(items[i]);
      if (sc < bestScore) {
        bestScore = sc;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestScore >= score()) {
      const step2 = diff > 0 ? 1 : -1;
      let found = false;
      for (let i = 0; i < items.length; i += 1) {
        const g = toNumber(items[i].recommendedGrams);
        if (diff > 0 && g >= CAP - 0.01) continue;
        if (diff < 0 && g <= FLOOR + 0.01) continue;
        const prevG = items[i].recommendedGrams;
        items[i].recommendedGrams = roundToOne(g + step2);
        syncRecoItemNutrition(items[i]);
        const sc = score();
        items[i].recommendedGrams = prevG;
        syncRecoItemNutrition(items[i]);
        if (sc < score()) {
          items[i].recommendedGrams = roundToOne(toNumber(items[i].recommendedGrams) + step2);
          syncRecoItemNutrition(items[i]);
          found = true;
          break;
        }
        items[i].recommendedGrams = prevG;
        syncRecoItemNutrition(items[i]);
      }
      if (!found) break;
      continue;
    }
    const g0 = toNumber(items[bestIdx].recommendedGrams);
    items[bestIdx].recommendedGrams = roundToOne(g0 + step);
    syncRecoItemNutrition(items[bestIdx]);
  }
}

function mealIcon(mealType) {
  if (mealType === "breakfast") return "🍳";
  if (mealType === "lunch") return "🥗";
  if (mealType === "dinner") return "🍽️";
  return "🍎";
}

function detectFoodCategoryByName(foodName) {
  const name = String(foodName || "").trim().toLowerCase();
  if (!name) return "";
  if (/(rice|oat|bread|noodle|pasta|cereal|grain|quinoa|potato)/.test(name)) return "grain";
  if (/(chicken|beef|pork|meat|turkey|fish|salmon|shrimp|tuna|lamb)/.test(name)) return "meat";
  if (/(egg|omelet)/.test(name)) return "egg";
  if (/(broccoli|spinach|lettuce|cabbage|carrot|tomato|pepper|cucumber|vegetable)/.test(name)) return "vegetable";
  if (/(apple|banana|orange|berry|grape|fruit|mango|pear|kiwi|pineapple)/.test(name)) return "fruit";
  if (/(milk|cheese|yogurt|dairy|cream)/.test(name)) return "dairy";
  if (/(cookie|biscuit|cake|chocolate|chip|snack|cracker)/.test(name)) return "snack";
  return "";
}

function getFoodEmoji(food) {
  const foodId = String(food?.foodId || food?.id || "").trim().toLowerCase();
  const foodName = String(food?.foodName || food?.name || "").trim().toLowerCase();
  const signature = `${foodId} ${foodName}`;
  if (/(greek_yogurt|yogurt|yoghurt)/.test(signature)) return "🥣";
  if (/(oats|oatmeal)/.test(signature)) return "🥣";
  if (/(brown_rice|rice)/.test(signature)) return "🍚";
  if (/(whole_wheat_bread|bread|toast)/.test(signature)) return "🍞";
  if (/(sweet_potato|potato)/.test(signature)) return "🍠";
  if (/(quinoa)/.test(signature)) return "🌾";
  if (/(chicken_breast|chicken)/.test(signature)) return "🍗";
  if (/(salmon)/.test(signature)) return "🐟";
  if (/(tofu)/.test(signature)) return "🫘";
  if (/(egg|omelet)/.test(signature)) return "🥚";
  if (/(broccoli)/.test(signature)) return "🥦";
  if (/(spinach)/.test(signature)) return "🥬";
  if (/(carrot)/.test(signature)) return "🥕";
  if (/(tomato)/.test(signature)) return "🍅";
  if (/(banana)/.test(signature)) return "🍌";
  if (/(apple)/.test(signature)) return "🍎";
  if (/(berries|berry)/.test(signature)) return "🍓";
  if (/(avocado)/.test(signature)) return "🥑";
  if (/(almonds|almond)/.test(signature)) return "🌰";
  if (/(peanut_butter|peanut butter)/.test(signature)) return "🥜";
  if (/(milk|cheese|yogurt|yoghurt|dairy|cream)/.test(foodName)) return "🥛";
  if (/(egg|omelet)/.test(foodName)) return "🥚";

  const explicitCategory = String(food?.category || "").trim().toLowerCase();
  const category = explicitCategory || detectFoodCategoryByName(foodName);

  if (category === "grain" || category === "carb") return "🍚";
  if (category === "meat") return "🍗";
  if (category === "egg") return "🥚";
  if (category === "vegetable" || category === "veggie") return "🥦";
  if (category === "fruit") return "🍎";
  if (category === "dairy") return "🥛";
  if (category === "protein") return "🍽️";
  if (category === "snack") return "🍪";
  return "🍽️";
}

const todayKey = getTodayLocalDate();
const selectedDate = ref(todayKey);
const DATE_WINDOW_DAYS = 9;
const DATE_SHIFT_DAYS = 7;
const dateWindowStart = ref(shiftDateKey(todayKey, -Math.floor(DATE_WINDOW_DAYS / 2)));
const me = ref(null);
const loading = ref(false);
const isOverviewLoading = ref(true);
const searchingFoods = ref(false);
const submitting = ref(false);
const showRetroactiveModal = ref(false);
const retroModalTime = ref("08:00");
const retroModalMode = ref("");
const retroModalMealType = ref("breakfast");
const retroModalOpenedAtLabel = ref("");
const retroModalError = ref("");
const pendingRecommendedPayload = ref(null);
const suppressRetroPromptOnce = ref(false);
const retroModalMealLabel = computed(() => MEAL_TYPES.find((m) => m.value === retroModalMealType.value)?.label || "Meal");
const records = ref([]);
const isSearchDropdownOpen = ref(false);
const showFoodOverview = ref(false);
const foodResults = ref([]);
const foodLibraryRows = ref([]);
const overviewFoodRows = ref([]);
const overviewFoodQuery = ref("");
const overviewLoading = ref(false);
const overviewFoodError = ref("");
const overviewHasSearched = ref(false);
const expandedOverviewFoodId = ref("");
const pageError = ref("");
const pageSuccess = ref("");
const formError = ref("");
const editingId = ref("");
const selectedFoodTemplate = ref(null);
const selectedPlanId = ref(null);
const appliedPlanId = ref("");
const recordMode = ref("recommended");
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { ensureFavoritesLoaded, addFavorite, removeFavoriteByItem, byKey, refreshFavorites } = useFavorites();
const focusedPlanCardId = ref("");
const showVipUpgradeModal = ref(false);
let searchTimer = null;
let focusSyncHandler = null;
let suppressFoodSearchOnce = false;
let loadRequestSeq = 0;
let focusPlanTimer = null;

function createEmptyOverview() {
  return {
    target: { calories: null, suggestedWorkoutBurn: null, protein: null, carbs: null, fat: null },
    consumed: { calories: null, protein: null, carbs: null, fat: null },
    remaining: { calories: null, protein: null, carbs: null, fat: null },
  };
}

const overview = ref(createEmptyOverview());

function normalizeOverviewPayload(data) {
  const targetCalories = Math.max(0, roundToOne(data?.target?.calories));
  const targetProtein = Math.max(0, roundToOne(data?.target?.protein));
  const targetCarbs = Math.max(0, roundToOne(data?.target?.carbs));
  const targetFat = Math.max(0, roundToOne(data?.target?.fat));
  const consumedCalories = Math.max(0, roundToOne(data?.consumed?.calories));
  const consumedProtein = Math.max(0, roundToOne(data?.consumed?.protein));
  const consumedCarbs = Math.max(0, roundToOne(data?.consumed?.carbs));
  const consumedFat = Math.max(0, roundToOne(data?.consumed?.fat));
  return {
    target: {
      calories: targetCalories,
      suggestedWorkoutBurn: Math.max(0, roundToOne(data?.target?.suggestedWorkoutBurn)),
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
    },
    consumed: {
      calories: consumedCalories,
      protein: consumedProtein,
      carbs: consumedCarbs,
      fat: consumedFat,
    },
    remaining: {
      calories: roundToOne(targetCalories - consumedCalories),
      protein: roundToOne(targetProtein - consumedProtein),
      carbs: roundToOne(targetCarbs - consumedCarbs),
      fat: roundToOne(targetFat - consumedFat),
    },
  };
}

function deriveZeroedOverviewFromTarget(target) {
  const targetCalories = Math.max(0, roundToOne(target?.calories));
  const targetProtein = Math.max(0, roundToOne(target?.protein));
  const targetCarbs = Math.max(0, roundToOne(target?.carbs));
  const targetFat = Math.max(0, roundToOne(target?.fat));
  return {
    target: {
      calories: targetCalories,
      suggestedWorkoutBurn: Math.max(0, roundToOne(target?.suggestedWorkoutBurn)),
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
    },
    consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    remaining: {
      calories: targetCalories,
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat,
    },
  };
}

const form = reactive({
  date: todayKey,
  mealType: "breakfast",
  foodName: "",
  amountInGrams: 100,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  note: "",
  sourceType: "manual",
  foodId: "",
  recommendationId: "",
  recordedTimeLocal: "",
});

const foodQuery = ref("");
const isEditing = computed(() => Boolean(editingId.value));
const selectedPlan = computed(() => PLAN_DEFINITIONS.find((x) => x.id === selectedPlanId.value) || null);
const appliedPlan = computed(() => PLAN_DEFINITIONS.find((x) => x.id === appliedPlanId.value) || null);
/** Selected plan card is the same as the applied recommendation source (not related to Schedule). */
const isAppliedPlanForSelectedCard = computed(
  () => Boolean(selectedPlan.value && String(appliedPlanId.value || "").trim() === String(selectedPlan.value.id))
);

const defaultDynamicPlanType = computed(() => {
  const direction = estimateGoalDirection();
  if (direction === "loss") return "weight_loss";
  if (direction === "gain") return "muscle_gain";
  return "balanced";
});

const personalizedPlanType = computed(() => appliedPlan.value?.type || defaultDynamicPlanType.value);

const personalizedDietTargets = computed(() => computePersonalizedDietTargetsCore(me.value, personalizedPlanType.value));

const dietDayTargetsBlueprint = computed(() => {
  const t = personalizedDietTargets.value;
  if (!t || !Number.isFinite(t.dailyCalories) || t.dailyCalories <= 0) return null;
  const daily = roundToInt(t.dailyCalories);
  const macrosDaily = macroTargetsFromTotalCalories(daily);
  return {
    dailyCalories: daily,
    protein: macrosDaily.protein,
    carbs: macrosDaily.carbs,
    fat: macrosDaily.fat,
    suggestedWorkoutBurn: t.suggestedWorkoutBurn,
    mealCalories: allocateMealCaloriesFromTotal(daily),
    mealMacros: allocateMealMacrosFromDaily(macrosDaily.protein, macrosDaily.carbs, macrosDaily.fat),
  };
});

const defaultDynamicPlan = computed(() => ({
  id: "default_dynamic",
  name: "Daily Intake Target",
  type: defaultDynamicPlanType.value,
  description: "Uses your weight goal pace (current weight, target weight, and timeline).",
  dailyCalories: dietDayTargetsBlueprint.value?.dailyCalories || 0,
}));
const isVipUser = computed(() => auth.vipStatus);
const selectedPlanFavoriteId = computed(() => (selectedPlan.value ? `diet-plan-${selectedPlan.value.id}` : ""));
const isSelectedPlanFavorited = computed(() => Boolean(selectedPlanFavoriteId.value && byKey.value.get(`diet::${selectedPlanFavoriteId.value}`)?._id));
const displayedOverviewFoods = computed(() => overviewFoodRows.value.slice(0, 10));
const dateSliderMonthLabel = computed(() =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(parseDateKey(selectedDate.value))
);
const dateSliderItems = computed(() =>
  Array.from({ length: DATE_WINDOW_DAYS }).map((_, idx) => {
    const key = shiftDateKey(dateWindowStart.value, idx);
    const dt = parseDateKey(key);
    return {
      key,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(dt),
      dayNum: dt.getDate(),
      isToday: key === todayKey,
      isSelected: key === selectedDate.value,
    };
  })
);

function appliedPlanStorageKey() {
  const userId = String(me.value?.id || "").trim();
  return userId ? `diet:applied-plan:${userId}` : "";
}

function restoreAppliedPlanFromStorage() {
  const key = appliedPlanStorageKey();
  if (!key) return;
  const saved = String(window.localStorage.getItem(key) || "").trim();
  appliedPlanId.value = PLAN_DEFINITIONS.some((plan) => plan.id === saved) ? saved : "";
}

function persistAppliedPlanToStorage() {
  const key = appliedPlanStorageKey();
  if (!key) return;
  if (appliedPlanId.value) {
    window.localStorage.setItem(key, appliedPlanId.value);
  } else {
    window.localStorage.removeItem(key);
  }
}

const hasOverviewData = computed(
  () => Number.isFinite(Number(personalizedDietTargets.value?.dailyCalories)) && personalizedDietTargets.value.dailyCalories > 0
);

function formatCaloriesOrDash(value) {
  return Number.isFinite(Number(value)) ? formatCalories(value) : "--";
}

function formatCaloriesNumberOrDash(value) {
  return Number.isFinite(Number(value)) ? formatCaloriesNumber(value) : "--";
}

const calorieRatio = computed(() => {
  if (!hasOverviewData.value) return null;
  const target = Math.max(1, toNumber(personalizedDietTargets.value?.dailyCalories, 1));
  const consumed = toNumber(overview.value.consumed?.calories);
  return consumed / target;
});
const caloriePercent = computed(() => (calorieRatio.value == null ? null : roundToOne(calorieRatio.value * 100)));
const donutFillPercent = computed(() => (caloriePercent.value == null ? 0 : clamp(caloriePercent.value, 0, 100)));

const calorieStatus = computed(() => {
  if (!hasOverviewData.value) {
    return {
      key: "normal",
      color: "var(--c4)",
      hint: "Loading data...",
      extra: "",
    };
  }
  const consumed = toNumber(overview.value.consumed?.calories);
  const target = Math.max(1, toNumber(personalizedDietTargets.value?.dailyCalories, 1));
  const exceeded = Math.max(0, roundToInt(consumed - target));
  if (calorieRatio.value >= 1) {
    return {
      key: "danger",
      color: "#be3b3b",
      hint: `You're over today's target by ${formatCalories(exceeded)}. Go easy on high-calorie foods for the rest of the day.`,
      extra: `(+${formatCalories(exceeded)})`,
    };
  }
  if (calorieRatio.value >= 0.8) {
    return {
      key: "warn",
      color: "#d69a1e",
      hint: "You're close to today's calorie limit—watch what you eat for the rest of the day.",
      extra: "",
    };
  }
  return {
    key: "normal",
    color: "var(--c4)",
    hint: "You're on track for today's target 👍",
    extra: "",
  };
});

const donutStyle = computed(() => ({
  background: `conic-gradient(${calorieStatus.value.color} 0% ${donutFillPercent.value}%, #dfeceb ${donutFillPercent.value}% 100%)`,
}));

function macroPct(card) {
  const tgt = Number(card?.target);
  if (!Number.isFinite(tgt) || tgt <= 0) return 0;
  const consumed = Math.max(0, toNumber(card.consumed));
  return Math.min(roundToOne((consumed / tgt) * 100), 100);
}

function moveDateWindow(step) {
  dateWindowStart.value = shiftDateKey(dateWindowStart.value, step);
}

function selectDateFromSlider(dateKey) {
  if (dateKey === selectedDate.value) return;
  selectedDate.value = dateKey;
  loadForDate();
}

function resetManualForm() {
  form.date = selectedDate.value;
  form.mealType = "breakfast";
  form.foodName = "";
  form.amountInGrams = 100;
  form.calories = 0;
  form.protein = 0;
  form.carbs = 0;
  form.fat = 0;
  form.note = "";
  form.sourceType = "manual";
  form.foodId = "";
  form.recommendationId = "";
  form.recordedTimeLocal = "";
  editingId.value = "";
  formError.value = "";
  selectedFoodTemplate.value = null;
}

function validateManualForm() {
  if (!form.foodName.trim()) return "Food name cannot be empty.";
  if (!/^\d{1,2}:\d{2}$/.test(String(form.recordedTimeLocal || "").trim())) return "Please select a valid time (HH:mm).";
  if (!Number.isFinite(Number(form.amountInGrams)) || Number(form.amountInGrams) <= 0) return "Amount (g) must be positive.";
  if (!Number.isFinite(Number(form.calories)) || Number(form.calories) < 0) return "Calories must be a non-negative number.";
  if (!Number.isFinite(Number(form.protein)) || Number(form.protein) < 0) return "Protein must be a non-negative number.";
  if (!Number.isFinite(Number(form.carbs)) || Number(form.carbs) < 0) return "Carbs must be a non-negative number.";
  if (!Number.isFinite(Number(form.fat)) || Number(form.fat) < 0) return "Fat must be a non-negative number.";
  return "";
}

function applyFoodTemplate(item) {
  suppressFoodSearchOnce = true;
  selectedFoodTemplate.value = item;
  form.foodName = item.name;
  form.foodId = item.id || "";
  foodQuery.value = item.name;
  recalcNutritionByGrams();
  isSearchDropdownOpen.value = false;
}

function recalcNutritionByGrams() {
  if (!selectedFoodTemplate.value) return;
  const ratio = Number(form.amountInGrams) / 100;
  form.calories = roundToOne(toNumber(selectedFoodTemplate.value.caloriesPer100g) * ratio);
  form.protein = roundToOne(toNumber(selectedFoodTemplate.value.proteinPer100g) * ratio);
  form.carbs = roundToOne(toNumber(selectedFoodTemplate.value.carbsPer100g) * ratio);
  form.fat = roundToOne(toNumber(selectedFoodTemplate.value.fatPer100g) * ratio);
}

async function loadPlanFoodLibraryIfNeeded() {
  if (foodLibraryRows.value.length) return;
  const { data } = await api.get("/diets/foods/search", { params: { limit: 200, source: "local" } });
  foodLibraryRows.value = Array.isArray(data) ? data : [];
}

async function loadRecords(dateKey = selectedDate.value) {
  const { data } = await api.get(`/diets/${me.value.id}`, {
    params: { date: dateKey, _ts: Date.now() },
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
  records.value = Array.isArray(data) ? data : [];
}

async function loadOverview(dateKey = selectedDate.value) {
  console.debug("[Diet][Overview] request", {
    userId: me.value?.id || "",
    selectedDate: selectedDate.value,
    requestDate: dateKey,
  });
  const { data } = await api.get(`/diets/${me.value.id}/overview`, {
    params: { date: dateKey, _ts: Date.now() },
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
  console.debug("[Diet][Overview] response", {
    requestDate: dateKey,
    responseDate: data?.date || "",
    raw: data,
  });
  overview.value = normalizeOverviewPayload(data || {});
  syncOverviewWithPersonalizedTargets();
}

async function loadForDate() {
  if (!me.value?.id) return;
  const dateKey = selectedDate.value;
  const requestId = ++loadRequestSeq;
  loading.value = true;
  isOverviewLoading.value = true;
  pageError.value = "";
  console.debug("[Diet][LoadForDate] start", {
    requestId,
    userId: me.value?.id || "",
    selectedDate: selectedDate.value,
    requestDate: dateKey,
  });
  try {
    const [recordsRes, overviewRes, libraryRes] = await Promise.allSettled([
      loadRecords(dateKey),
      loadOverview(dateKey),
      loadPlanFoodLibraryIfNeeded(),
    ]);
    if (requestId !== loadRequestSeq) return;
    if (recordsRes.status === "rejected") {
      throw recordsRes.reason;
    }
    if (overviewRes.status === "rejected") {
      throw overviewRes.reason;
    }
    syncOverviewWithPersonalizedTargets();
    if (!records.value.length) {
      overview.value = deriveZeroedOverviewFromTarget(overview.value.target);
      console.debug("[Diet][Overview] reconciled to zero from records", {
        requestId,
        dateKey,
        reason: "no diet records for current user/date",
      });
    }
    if (libraryRes.status === "rejected") {
      console.debug("[Diet][LoadForDate] food library load failed", {
        requestId,
        reason: libraryRes.reason?.message || "unknown",
      });
    }
    console.debug("[Diet][LoadForDate] done", {
      requestId,
      selectedDate: selectedDate.value,
      renderedOverview: overview.value,
    });
  } catch (error) {
    if (requestId !== loadRequestSeq) return;
    pageError.value = error?.response?.data?.message || "Failed to load diet data.";
    overview.value = createEmptyOverview();
    console.debug("[Diet][LoadForDate] failed", {
      requestId,
      selectedDate: selectedDate.value,
      message: pageError.value,
    });
  } finally {
    if (requestId === loadRequestSeq) {
      loading.value = false;
      isOverviewLoading.value = false;
    }
  }
}

async function fetchOverviewFoods(query = "") {
  overviewHasSearched.value = true;
  expandedOverviewFoodId.value = "";
  overviewLoading.value = true;
  overviewFoodError.value = "";
  try {
    const { data } = await api.get("/diets/foods/search", { params: { query: query.trim(), limit: 10 } });
    overviewFoodRows.value = Array.isArray(data) ? data : [];
  } catch (error) {
    overviewFoodRows.value = [];
    overviewFoodError.value = error?.response?.data?.message || "Unable to load food data right now. Please try again.";
  } finally {
    overviewLoading.value = false;
  }
}

async function toggleFoodOverview() {
  showFoodOverview.value = !showFoodOverview.value;
}

async function searchOverviewFoods() {
  const keyword = overviewFoodQuery.value.trim();
  if (!keyword) {
    overviewHasSearched.value = false;
    overviewFoodRows.value = [];
    overviewFoodError.value = "";
    expandedOverviewFoodId.value = "";
    return;
  }
  await fetchOverviewFoods(overviewFoodQuery.value);
}

function toggleOverviewFoodDetails(food) {
  const key = String(food.id || food.fdcId || food.name || "");
  expandedOverviewFoodId.value = expandedOverviewFoodId.value === key ? "" : key;
}

async function searchFoods() {
  const keyword = foodQuery.value.trim();
  if (!keyword) {
    foodResults.value = [];
    isSearchDropdownOpen.value = false;
    return;
  }
  searchingFoods.value = true;
  try {
    const { data } = await api.get("/diets/foods/search", { params: { query: keyword, limit: 12 } });
    foodResults.value = Array.isArray(data) ? data : [];
    isSearchDropdownOpen.value = foodResults.value.length > 0;
  } catch {
    foodResults.value = [];
    isSearchDropdownOpen.value = false;
  } finally {
    searchingFoods.value = false;
  }
}

function handleFoodQueryFocus() {
  if (foodQuery.value.trim() && foodResults.value.length) {
    isSearchDropdownOpen.value = true;
  }
}

function estimateGoalDirection() {
  const current = toNumber(me.value?.weight);
  const target = toNumber(me.value?.targetWeight);
  if (current <= 0 || target <= 0) return "maintain";
  if (target < current) return "loss";
  if (target > current) return "gain";
  return "maintain";
}

const recommendedSourceMeta = computed(() => {
  if (appliedPlan.value) {
    return {
      source: "applied",
      name: appliedPlan.value.name,
      tip: `${appliedPlan.value.name} is your active recipe source. Daily calories match your profile-based intake target.`,
    };
  }
  return {
    source: "default",
    name: defaultDynamicPlan.value.name,
    tip: "Based on your personalized daily intake target. Meals use a 25% / 35% / 25% / 15% split.",
  };
});

const planCards = computed(() =>
  PLAN_DEFINITIONS.map((plan, idx) => {
    const dailyCalories = dietDayTargetsBlueprint.value?.dailyCalories || 0;
    return {
      ...plan,
      isLocked: !isVipUser.value && idx >= LOCK_FREE_PLAN_COUNT,
      dailyCalories,
      goalTag:
        plan.type === "muscle_gain"
          ? "Muscle Gain"
          : plan.type === "fat_loss" || plan.type === "weight_loss"
          ? "Fat / Weight Loss"
          : plan.type === "high_protein"
          ? "High Protein"
          : "Balanced",
    };
  })
);
const selectedPlanCard = computed(() => planCards.value.find((x) => x.id === selectedPlanId.value) || null);
const appliedPlanCard = computed(() => planCards.value.find((x) => x.id === appliedPlanId.value) || null);
const selectedPlanMeta = computed(() => {
  const base = selectedPlanCard.value || selectedPlan.value;
  if (!base) return { suitableFor: [], notSuitableFor: [], recipeTags: [] };
  return {
    suitableFor: Array.isArray(base.suitableFor) ? base.suitableFor.filter(Boolean) : [],
    notSuitableFor: Array.isArray(base.notSuitableFor) ? base.notSuitableFor.filter(Boolean) : [],
    recipeTags: Array.isArray(base.recipeTags) ? base.recipeTags.filter(Boolean) : [],
  };
});

const MEAL_CAL_HARD_REL = 0.065;
const MEAL_CAL_HARD_MIN_HALF = 15;

function mealCalorieHardHalfWidth(targetKcal) {
  const t = Math.max(0, toNumber(targetKcal));
  return Math.max(MEAL_CAL_HARD_MIN_HALF, t * MEAL_CAL_HARD_REL);
}

function isMealCalorieWithinHardBand(actualKcal, targetKcal) {
  const t = Math.max(0, toNumber(targetKcal));
  if (t <= 0) return true;
  const w = mealCalorieHardHalfWidth(t);
  return Math.abs(toNumber(actualKcal) - t) <= w;
}

function sumMealItemsCalories(items) {
  return items.reduce((sum, it) => sum + toNumber(it.estimatedCalories), 0);
}

function enforceMealCalorieHardTarget(items, mealTargetKcal, mealMacroTargets) {
  if (!Array.isArray(items) || !items.length) return;
  const tgt = toNumber(mealTargetKcal);
  if (tgt <= 0) return;
  const macros = mealMacroTargets && typeof mealMacroTargets === "object" ? mealMacroTargets : DEFAULT_MEAL_MACRO_TARGETS;
  const GRAM_CAP = 400;
  const GRAM_FLOOR = 20;
  const MAX_STEPS = 3000;
  function actualCal() {
    return sumMealItemsCalories(items);
  }
  function stepForError(errAbs) {
    if (errAbs <= 10) return 0.5;
    if (errAbs <= 28) return 1;
    return 5;
  }
  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (isMealCalorieWithinHardBand(actualCal(), tgt)) break;
    const act = actualCal();
    const err = act - tgt;
    const STEP = stepForError(Math.abs(err));
    if (err < 0) {
      const s = items.reduce(
        (acc, it) => ({
          c: acc.c + toNumber(it.estimatedCarbs),
        }),
        { c: 0 }
      );
      const ec = s.c - toNumber(macros.carbs);
      let bestI = -1;
      let bestScore = -1;
      for (let i = 0; i < items.length; i += 1) {
        const g = toNumber(items[i].recommendedGrams);
        if (g >= GRAM_CAP - 0.01) continue;
        const k100 = toNumber(items[i].caloriesPer100g);
        const cp = toNumber(items[i].carbsPer100g);
        const gain = (k100 / 100) * STEP;
        const penalty = ec > 2 && cp > 30 ? 0.55 : 1;
        const score = gain * penalty;
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
        }
      }
      if (bestI < 0) break;
      items[bestI].recommendedGrams = roundToOne(Math.min(GRAM_CAP, items[bestI].recommendedGrams + STEP));
      syncRecoItemNutrition(items[bestI]);
      continue;
    }
    let bestI = -1;
    let bestMarginal = -1;
    for (let i = 0; i < items.length; i += 1) {
      const g = toNumber(items[i].recommendedGrams);
      if (g <= GRAM_FLOOR + 0.01) continue;
      const k100 = toNumber(items[i].caloriesPer100g);
      const marginal = (k100 / 100) * STEP;
      if (marginal > bestMarginal) {
        bestMarginal = marginal;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    items[bestI].recommendedGrams = roundToOne(Math.max(GRAM_FLOOR, items[bestI].recommendedGrams - STEP));
    syncRecoItemNutrition(items[bestI]);
  }
}

function pickFoodForSlot(mealType, category, seed, usedIds, accMacros, mealMacroTargets, carbHeavyCount) {
  const inMeal = foodLibraryRows.value.filter((x) => (x.mealTypes || []).includes(mealType));
  let pool = inMeal.filter((x) => x.category === category && !usedIds.has(x.id));
  if (!pool.length) pool = inMeal.filter((x) => !usedIds.has(x.id));
  if (!pool.length) pool = inMeal;
  if (!pool.length) return null;
  const carbTarget = Math.max(0.1, toNumber(mealMacroTargets.carbs));
  const protTarget = Math.max(0.1, toNumber(mealMacroTargets.protein));
  const accC = toNumber(accMacros.carbs);
  const accP = toNumber(accMacros.protein);
  const carbRatio = accC / carbTarget;
  const protRatio = accP / protTarget;
  if (category === "carb") {
    if (carbHeavyCount >= 1) {
      const low = pool.filter((f) => toNumber(f.carbsPer100g) < 32);
      if (low.length) pool = low;
    }
    if (carbRatio > 0.55) {
      const low = pool.filter((f) => toNumber(f.carbsPer100g) < 35);
      if (low.length) pool = low;
    }
    if (carbRatio > 0.72) {
      const low = pool.filter((f) => toNumber(f.carbsPer100g) < 22);
      if (low.length) pool = low;
    }
  }
  if (category === "fruit" && (carbRatio > 0.52 || accC > carbTarget * 0.58)) {
    const low = pool.filter((f) => toNumber(f.carbsPer100g) < 18);
    if (low.length) pool = low;
  }
  if (category === "protein" && protRatio < 0.42) {
    pool = [...pool].sort((a, b) => toNumber(b.proteinPer100g) - toNumber(a.proteinPer100g));
    pool = pool.slice(0, Math.max(4, Math.ceil(pool.length * 0.55)));
  }
  return pool[Math.abs(seed) % pool.length];
}

function createMealRecommendation(mealType, targetCalories, mealMacroTargets, planType, dateKey) {
  const macros =
    mealMacroTargets && typeof mealMacroTargets === "object" ? { ...DEFAULT_MEAL_MACRO_TARGETS, ...mealMacroTargets } : { ...DEFAULT_MEAL_MACRO_TARGETS };
  const tgtCal = Math.max(0, toNumber(targetCalories));
  if (tgtCal <= 0) return [];
  const categories = PLAN_CATEGORY_BLUEPRINT[planType]?.[mealType] || PLAN_CATEGORY_BLUEPRINT.balanced[mealType];
  const usedIds = new Set();
  const shares = categories.length === 3 ? [0.4, 0.35, 0.25] : [0.6, 0.4];
  const baseSeed = hashString(`${dateKey}-${planType}-${mealType}`);
  const accMacros = { protein: 0, carbs: 0, fat: 0 };
  let carbHeavyCount = 0;
  const rows = [];
  for (let idx = 0; idx < categories.length; idx += 1) {
    const category = categories[idx];
    const food = pickFoodForSlot(mealType, category, baseSeed + idx * 11, usedIds, accMacros, macros, carbHeavyCount);
    if (!food) continue;
    usedIds.add(food.id);
    if (category === "carb" && toNumber(food.carbsPer100g) >= 48) carbHeavyCount += 1;
    const slotCalories = tgtCal * (shares[idx] || 0.33);
    const grams = clamp(roundToOne((slotCalories / Math.max(1, toNumber(food.caloriesPer100g))) * 100), 20, 400);
    const nutrition = macroForFood(food, grams);
    accMacros.protein += nutrition.protein;
    accMacros.carbs += nutrition.carbs;
    accMacros.fat += nutrition.fat;
    rows.push({
      recommendationId: `${dateKey}-${planType}-${mealType}-${food.id}-${idx}`,
      mealType,
      foodId: food.id,
      foodName: food.name,
      category: String(food.category || "").toLowerCase(),
      caloriesPer100g: toNumber(food.caloriesPer100g),
      proteinPer100g: toNumber(food.proteinPer100g),
      carbsPer100g: toNumber(food.carbsPer100g),
      fatPer100g: toNumber(food.fatPer100g),
      recommendedGrams: grams,
      estimatedCalories: nutrition.calories,
      estimatedProtein: nutrition.protein,
      estimatedCarbs: nutrition.carbs,
      estimatedFat: nutrition.fat,
    });
  }
  if (!rows.length) return [];
  let adjusted = rows.map((item) => ({ ...item }));
  const totalCal = adjusted.reduce((sum, x) => sum + toNumber(x.estimatedCalories), 0);
  if (totalCal > 0) {
    const factor = clamp(tgtCal / totalCal, 0.82, 1.18);
    adjusted = adjusted.map((item) => {
      const grams = clamp(roundToOne(item.recommendedGrams * factor), 20, 400);
      const nutrition = macroForFood(item, grams);
      return {
        ...item,
        recommendedGrams: grams,
        estimatedCalories: nutrition.calories,
        estimatedProtein: nutrition.protein,
        estimatedCarbs: nutrition.carbs,
        estimatedFat: nutrition.fat,
      };
    });
  }
  enforceMealCalorieHardTarget(adjusted, tgtCal, macros);
  alignMealIntegerCaloriesStrict(adjusted, tgtCal);
  correctMealVisibleKcalDeltaStrict(adjusted, tgtCal);
  return adjusted;
}

function finalizeMealCalorieDisplay(mealRows) {
  for (const row of mealRows) {
    if (row.items?.length && row.targetCalories > 0) {
      alignMealIntegerCaloriesStrict(row.items, row.targetCalories);
      correctMealVisibleKcalDeltaStrict(row.items, row.targetCalories);
    }
  }
}

function buildPlanDetails(planType, dateKey) {
  const bp = dietDayTargetsBlueprint.value;
  if (!bp) {
    return {
      targetTotal: 0,
      meals: MEAL_TYPES.map((meal) => ({
        mealType: meal.value,
        label: meal.label,
        targetCalories: 0,
        macroTargets: { protein: 0, carbs: 0, fat: 0 },
        items: [],
      })),
    };
  }
  const targetTotal = bp.dailyCalories;
  const mealBudget = bp.mealCalories;
  const mealMacroBudget = bp.mealMacros;
  const mealRows = MEAL_TYPES.map((meal) => {
    const mealTarget = mealBudget[meal.value] ?? 0;
    const macroTargets = mealMacroBudget[meal.value] || { protein: 0, carbs: 0, fat: 0 };
    const items = createMealRecommendation(meal.value, mealTarget, macroTargets, planType, dateKey);
    return { mealType: meal.value, label: meal.label, targetCalories: mealTarget, macroTargets, items };
  });
  finalizeMealCalorieDisplay(mealRows);
  return { targetTotal, meals: mealRows };
}

const selectedPlanDetails = computed(() => {
  if (!selectedPlanCard.value) return { targetTotal: 0, meals: [] };
  return buildPlanDetails(selectedPlanCard.value.type, selectedDate.value);
});

const appliedPlanDetails = computed(() => {
  if (!appliedPlanCard.value) return { targetTotal: 0, meals: [] };
  return buildPlanDetails(appliedPlanCard.value.type, selectedDate.value);
});

const defaultDynamicPlanDetails = computed(() => buildPlanDetails(defaultDynamicPlanType.value, selectedDate.value));

const activeRecommendedPlan = computed(() => {
  if (appliedPlanCard.value) return appliedPlanCard.value;
  return defaultDynamicPlan.value;
});

const activeRecommendedPlanDetails = computed(() => {
  if (appliedPlan.value) return appliedPlanDetails.value;
  return defaultDynamicPlanDetails.value;
});

/** Totals from the currently active generated recommendation (same numbers as Nutrient Intake bar max). */
const recipePlanMacroTotals = computed(() => {
  const meals = activeRecommendedPlanDetails.value?.meals || [];
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const meal of meals) {
    for (const it of meal.items || []) {
      protein += toNumber(it.estimatedProtein);
      carbs += toNumber(it.estimatedCarbs);
      fat += toNumber(it.estimatedFat);
    }
  }
  return {
    protein: roundToOne(protein),
    carbs: roundToOne(carbs),
    fat: roundToOne(fat),
  };
});

function syncOverviewWithPersonalizedTargets() {
  const bp = dietDayTargetsBlueprint.value;
  const pdt = personalizedDietTargets.value;
  if (!bp || !pdt) return;
  const totals = recipePlanMacroTotals.value;
  const daily = roundToInt(bp.dailyCalories);
  const burn = Math.max(0, roundToOne(toNumber(pdt.suggestedWorkoutBurn)));
  const cons = overview.value.consumed || {};
  const cCal = toNumber(cons.calories);
  const cP = toNumber(cons.protein);
  const cCb = toNumber(cons.carbs);
  const cF = toNumber(cons.fat);

  overview.value.target.calories = daily;
  overview.value.target.suggestedWorkoutBurn = burn;
  overview.value.target.protein = totals.protein;
  overview.value.target.carbs = totals.carbs;
  overview.value.target.fat = totals.fat;

  overview.value.remaining.calories = roundToOne(daily - cCal);
  overview.value.remaining.protein = roundToOne(totals.protein - cP);
  overview.value.remaining.carbs = roundToOne(totals.carbs - cCb);
  overview.value.remaining.fat = roundToOne(totals.fat - cF);
}

const macroCards = computed(() => {
  const t = recipePlanMacroTotals.value;
  const c = overview.value?.consumed || {};
  const row = (key, label) => ({
    key,
    label,
    consumed: Number.isFinite(Number(c[key])) ? roundToOne(Number(c[key])) : null,
    target: t[key] > 0 ? roundToOne(t[key]) : null,
  });
  return [row("protein", "Protein"), row("carbs", "Carbohydrates"), row("fat", "Fat")];
});

function normalizeMealTypeKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return MEAL_TYPES.some((m) => m.value === key) ? key : "snack";
}

function recordAddedAtLabel(row) {
  const local = String(row?.recordedTimeLocal || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(local)) return local;
  return formatRecordTime(row?.recordedAt || row?.createdAt) || "--:--";
}

const recommendedModeMeals = computed(() => {
  const mealMap = new Map(
    MEAL_TYPES.map((meal) => {
      const baseMeal = activeRecommendedPlanDetails.value.meals.find((x) => x.mealType === meal.value);
      return [
        meal.value,
        {
          mealType: meal.value,
          label: meal.label,
          targetCalories: Number(baseMeal?.targetCalories || 0),
          records: [],
          pendingRecommendations: Array.isArray(baseMeal?.items) ? [...baseMeal.items] : [],
        },
      ];
    })
  );

  const rows = [...records.value].sort((a, b) => {
    const ta = new Date(a?.recordedAt || a?.createdAt || 0).getTime();
    const tb = new Date(b?.recordedAt || b?.createdAt || 0).getTime();
    return tb - ta;
  });

  for (const row of rows) {
    const key = normalizeMealTypeKey(row?.mealType);
    const bucket = mealMap.get(key);
    if (!bucket) continue;
    bucket.records.push(row);
  }

  for (const meal of mealMap.values()) {
    const loggedRecommendationIds = new Set(
      meal.records.map((row) => String(row?.recommendationId || "").trim()).filter(Boolean)
    );
    meal.pendingRecommendations = meal.pendingRecommendations.filter((item) => {
      const rid = `${activeRecommendedPlan.value.id}-${item.recommendationId}`;
      return !loggedRecommendationIds.has(rid);
    });
  }

  return MEAL_TYPES.map((meal) => mealMap.get(meal.value));
});

function mealAllocatedCalories(meal) {
  return sumDisplayedMealCaloriesInt(meal?.items || []);
}

function mealProgressPct(meal, dailyTarget) {
  const target = Math.max(1, toNumber(dailyTarget, 1));
  return clamp(roundToOne((mealAllocatedCalories(meal) / target) * 100), 0, 100);
}

function togglePlanCard(planId) {
  selectedPlanId.value = selectedPlanId.value === planId ? null : planId;
}

function handlePlanCardClick(plan) {
  if (plan?.isLocked) {
    showVipUpgradeModal.value = true;
    return;
  }
  togglePlanCard(plan.id);
}

function normalizeFocusPlanId(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("diet-plan-")) return value.slice("diet-plan-".length);
  return value;
}

async function focusPlanFromQuery() {
  const planId = normalizeFocusPlanId(route.query.focusItem);
  if (!planId) return;
  const exists = PLAN_DEFINITIONS.some((plan) => plan.id === planId);
  if (!exists) return;
  const targetPlan = planCards.value.find((plan) => plan.id === planId);
  if (targetPlan?.isLocked) return;
  selectedPlanId.value = planId;
  recordMode.value = "recommended";
  focusedPlanCardId.value = planId;

  if (String(route.query.applyAsSource || "").trim() === "1") {
    appliedPlanId.value = planId;
    persistAppliedPlanToStorage();
    pageSuccess.value = `${targetPlan?.name || "Plan"} is now your active recommendation source.`;
    const nextQuery = { ...route.query };
    delete nextQuery.applyAsSource;
    router.replace({ path: route.path, query: nextQuery });
  }

  await nextTick();
  const el = document.querySelector(`[data-plan-id="${planId}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focusPlanTimer) window.clearTimeout(focusPlanTimer);
  focusPlanTimer = window.setTimeout(() => {
    focusedPlanCardId.value = "";
  }, 2200);
}

async function applySelectedPlan() {
  if (!selectedPlan.value || !me.value?.id) return;
  pageError.value = "";
  pageSuccess.value = "";

  if (isAppliedPlanForSelectedCard.value) {
    appliedPlanId.value = "";
    persistAppliedPlanToStorage();
    pageSuccess.value = `${selectedPlan.value.name} is no longer your active recommendation source.`;
    return;
  }

  appliedPlanId.value = selectedPlan.value.id;
  persistAppliedPlanToStorage();
  recordMode.value = "recommended";
  pageSuccess.value = `${selectedPlan.value.name} is now your active plan for recommendations on ${selectedDate.value}. Add foods with “Add to Records” to log them and update your schedule.`;
}

async function toggleSelectedPlanFavorite() {
  if (!selectedPlan.value || !me.value?.id) return;
  pageError.value = "";
  try {
    if (isSelectedPlanFavorited.value) {
      await removeFavoriteByItem("diet", selectedPlanFavoriteId.value);
      pageSuccess.value = `${selectedPlan.value.name} removed from favorites.`;
      return;
    }

    await addFavorite({
      itemType: "diet",
      itemId: selectedPlanFavoriteId.value,
      title: selectedPlan.value.name,
      planType: selectedPlan.value.type,
      targetCalories: selectedPlanCard.value?.dailyCalories || 0,
      description: selectedPlan.value.description,
      metadata: { planType: selectedPlan.value.type },
      sourceType: "diet_plan",
    });
    pageSuccess.value = `${selectedPlan.value.name} added to favorites.`;
  } catch (error) {
    pageError.value = error?.response?.data?.message || "Failed to update favorite status.";
  }
}

function openRetroactiveModalForManual(effectiveTimeHHmm) {
  retroModalMealType.value = form.mealType;
  const plausible = isTimePlausibleForMeal(form.mealType, effectiveTimeHHmm);
  retroModalTime.value = plausible ? normalizeHHmmClient(effectiveTimeHHmm) : defaultSuggestedTimeForMeal(form.mealType);
  retroModalMode.value = "manual";
  retroModalOpenedAtLabel.value = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  retroModalError.value = "";
  showRetroactiveModal.value = true;
}

function openRetroactiveModalForRecommended(mealType, payload) {
  retroModalMealType.value = mealType;
  retroModalTime.value = defaultSuggestedTimeForMeal(mealType);
  pendingRecommendedPayload.value = payload;
  retroModalMode.value = "recommended";
  retroModalOpenedAtLabel.value = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  retroModalError.value = "";
  showRetroactiveModal.value = true;
}

function cancelRetroactiveModal() {
  showRetroactiveModal.value = false;
  retroModalMode.value = "";
  pendingRecommendedPayload.value = null;
  retroModalError.value = "";
}

async function postRecommendedDietPayload(p) {
  pageError.value = "";
  pageSuccess.value = "";
  submitting.value = true;
  try {
    await api.post("/diets", p);
    pageSuccess.value = "Recommended item added to records.";
    selectedDate.value = p.date || selectedDate.value;
    await loadForDate();
  } catch (err) {
    pageError.value = err?.response?.data?.message || "Failed to add recommended item.";
  } finally {
    submitting.value = false;
  }
}

async function confirmRetroactiveModal() {
  retroModalError.value = "";
  const t = normalizeHHmmClient(retroModalTime.value);
  if (!t) {
    retroModalError.value = "Please choose a valid time (HH:mm).";
    return;
  }
  const mode = retroModalMode.value;
  showRetroactiveModal.value = false;
  retroModalMode.value = "";
  if (mode === "recommended" && pendingRecommendedPayload.value) {
    const p = { ...pendingRecommendedPayload.value, recordedTimeLocal: t };
    pendingRecommendedPayload.value = null;
    await postRecommendedDietPayload(p);
    return;
  }
  form.recordedTimeLocal = t;
  suppressRetroPromptOnce.value = true;
  await performSaveManualRecord();
}

async function retroModalUseCurrentTime() {
  const t = localHHmmNow();
  retroModalError.value = "";
  const mode = retroModalMode.value;
  showRetroactiveModal.value = false;
  retroModalMode.value = "";
  if (mode === "recommended" && pendingRecommendedPayload.value) {
    const p = { ...pendingRecommendedPayload.value, recordedTimeLocal: t };
    pendingRecommendedPayload.value = null;
    await postRecommendedDietPayload(p);
    return;
  }
  form.recordedTimeLocal = t;
  suppressRetroPromptOnce.value = true;
  await performSaveManualRecord();
}

async function performSaveManualRecord() {
  formError.value = "";
  pageError.value = "";
  pageSuccess.value = "";
  const message = validateManualForm();
  if (message) {
    formError.value = message;
    suppressRetroPromptOnce.value = false;
    return;
  }
  if (!me.value?.id) {
    formError.value = "Not signed in.";
    suppressRetroPromptOnce.value = false;
    return;
  }
  submitting.value = true;
  const payload = {
    userId: me.value.id,
    date: form.date,
    mealType: form.mealType,
    foodName: form.foodName.trim(),
    amountInGrams: Number(form.amountInGrams),
    calories: roundToOne(form.calories),
    protein: roundToOne(form.protein),
    carbs: roundToOne(form.carbs),
    fat: roundToOne(form.fat),
    note: form.note.trim(),
    sourceType: form.sourceType,
    foodId: form.foodId,
    recommendationId: form.recommendationId,
    unit: "g",
    recordedTimeLocal: recordedTimeLocalForSavePayload(),
  };
  if (!isEditing.value) payload.recordedAt = new Date().toISOString();
  try {
    if (isEditing.value) {
      await api.put(`/diets/${editingId.value}`, payload);
      pageSuccess.value = "Diet record updated.";
    } else {
      await api.post("/diets", payload);
      pageSuccess.value = "Diet record added.";
    }
    selectedDate.value = form.date;
    await loadForDate();
    resetManualForm();
    suppressRetroPromptOnce.value = false;
  } catch (err) {
    formError.value = err?.response?.data?.message || "Failed to save diet record.";
    suppressRetroPromptOnce.value = false;
  } finally {
    submitting.value = false;
  }
}

async function saveManualRecord() {
  formError.value = "";
  pageError.value = "";
  pageSuccess.value = "";
  const message = validateManualForm();
  if (message) {
    formError.value = message;
    return;
  }
  const effective = recordedTimeLocalForSavePayload();
  if (!suppressRetroPromptOnce.value && shouldPromptRetroactiveMeal(form.mealType, effective)) {
    openRetroactiveModalForManual(effective);
    return;
  }
  await performSaveManualRecord();
}

async function addRecommendedItem(mealType, item, planId) {
  pageError.value = "";
  pageSuccess.value = "";
  const payload = {
    userId: me.value.id,
    date: selectedDate.value,
    mealType,
    foodName: item.foodName,
    amountInGrams: item.recommendedGrams,
    calories: item.estimatedCalories,
    protein: item.estimatedProtein,
    carbs: item.estimatedCarbs,
    fat: item.estimatedFat,
    sourceType: "recommended",
    foodId: item.foodId,
    recommendationId: `${planId}-${item.recommendationId}`,
    dietPlanId: activeRecommendedPlan.value.id,
    planName: activeRecommendedPlan.value.name,
    unit: "g",
    note: "Added from popular meal plan",
    recordedAt: new Date().toISOString(),
    recordedTimeLocal: localHHmmNow(),
  };
  if (!suppressRetroPromptOnce.value && shouldPromptRetroactiveMeal(mealType, payload.recordedTimeLocal)) {
    openRetroactiveModalForRecommended(mealType, payload);
    return;
  }
  await postRecommendedDietPayload(payload);
}

function editRecord(row) {
  recordMode.value = "manual";
  editingId.value = row._id;
  form.date = formatDateKey(new Date(row.date));
  form.mealType = row.mealType || "breakfast";
  form.foodName = row.foodName || "";
  form.amountInGrams = toNumber(row.amountInGrams, toNumber(row.amount, 100));
  form.calories = roundToOne(row.calories);
  form.protein = roundToOne(row.protein);
  form.carbs = roundToOne(row.carbs);
  form.fat = roundToOne(row.fat);
  form.note = row.note || "";
  form.sourceType = row.sourceType || "manual";
  form.foodId = row.foodId || "";
  form.recommendationId = row.recommendationId || "";
  form.recordedTimeLocal = row.recordedTimeLocal || localHHmmFromRecordedAt(row.recordedAt || row.createdAt);
}

async function removeRecord(id) {
  if (!window.confirm("Delete this meal record?")) return;
  pageError.value = "";
  pageSuccess.value = "";
  try {
    await api.delete(`/diets/${id}`);
    pageSuccess.value = "Diet record deleted.";
    await loadForDate();
  } catch (err) {
    pageError.value = err?.response?.data?.message || "Failed to delete diet record.";
  }
}

watch(foodQuery, () => {
  if (suppressFoodSearchOnce) {
    suppressFoodSearchOnce = false;
    return;
  }
  if (searchTimer) clearTimeout(searchTimer);
  if (!foodQuery.value.trim()) {
    foodResults.value = [];
    isSearchDropdownOpen.value = false;
    return;
  }
  isSearchDropdownOpen.value = true;
  searchTimer = setTimeout(searchFoods, 280);
});

watch(
  () => form.amountInGrams,
  () => recalcNutritionByGrams()
);

watch(
  () => form.foodName,
  (value) => {
    if (!selectedFoodTemplate.value) return;
    if (value.trim().toLowerCase() !== selectedFoodTemplate.value.name.toLowerCase()) {
      selectedFoodTemplate.value = null;
      form.foodId = "";
    }
  }
);

watch(
  () => selectedDate.value,
  (next) => {
    const start = parseDateKey(dateWindowStart.value);
    const end = parseDateKey(shiftDateKey(dateWindowStart.value, DATE_WINDOW_DAYS - 1));
    const picked = parseDateKey(next);
    if (picked < start || picked > end) {
      dateWindowStart.value = shiftDateKey(next, -Math.floor(DATE_WINDOW_DAYS / 2));
    }
  }
);

watch(
  () => overview.value,
  (next) => {
    console.debug("[Diet][Overview] render values", {
      selectedDate: selectedDate.value,
      userId: me.value?.id || "",
      consumed: next?.consumed || {},
      remaining: next?.remaining || {},
      target: next?.target || {},
      hasLocalAccumulator: false,
    });
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  if (focusSyncHandler) window.removeEventListener("focus", focusSyncHandler);
  if (focusPlanTimer) clearTimeout(focusPlanTimer);
});

onMounted(async () => {
  try {
    me.value = await api.get("/users/me").then((r) => r.data);
    auth.$patch({ user: auth.normalizeUser(me.value) });
    restoreAppliedPlanFromStorage();
    form.date = selectedDate.value;
    dateWindowStart.value = shiftDateKey(selectedDate.value, -Math.floor(DATE_WINDOW_DAYS / 2));
    await Promise.all([loadForDate(), ensureFavoritesLoaded()]);
    await focusPlanFromQuery();
    focusSyncHandler = async () => {
      await Promise.allSettled([
        refreshFavorites(),
        api.get("/users/me").then((r) => {
          me.value = r.data;
          auth.$patch({ user: auth.normalizeUser(r.data) });
        }),
      ]);
    };
    window.addEventListener("focus", focusSyncHandler);
  } catch (err) {
    pageError.value = err?.response?.data?.message || "Failed to initialize diet page.";
  }
});

watch(
  () => [route.query.focusItem, route.query.applyAsSource],
  async () => {
    await focusPlanFromQuery();
  }
);

watch(
  () => [dietDayTargetsBlueprint.value, activeRecommendedPlanDetails.value],
  () => {
    syncOverviewWithPersonalizedTargets();
  },
  { deep: true }
);
</script>

<template>
  <AppNavbar />
  <main class="page diet-page">
    <section class="diet-header">
      <div class="hero-title-row">
        <h2 class="title">🥗 Diet</h2>
        <button type="button" class="overview-toggle-btn" @click="toggleFoodOverview">Food Nutrition Overview</button>
      </div>
    </section>

    <section v-if="showFoodOverview" class="food-overview panel">
      <div class="food-overview-head">
        <h3>Food Nutrition Overview</h3>
        <div class="food-overview-search-wrap">
          <input v-model.trim="overviewFoodQuery" class="food-overview-search" placeholder="Search food name..." @keyup.enter="searchOverviewFoods" />
          <button type="button" class="tiny-btn" @click="searchOverviewFoods">Search</button>
        </div>
      </div>
      <p v-if="overviewLoading" class="muted">Searching foods...</p>
      <p v-if="overviewFoodError" class="error">{{ overviewFoodError }}</p>

      <div v-if="!overviewHasSearched && !overviewLoading" class="food-overview-default">
        <p class="muted">Search a food to view calories and nutrition facts.</p>
        <p class="muted">Try searching: chicken, rice, apple</p>
      </div>

      <div v-else-if="!overviewLoading && !overviewFoodError" class="food-overview-results">
        <p v-if="!displayedOverviewFoods.length" class="food-empty">No foods found. Try another keyword.</p>
        <p v-else class="muted result-hint">Showing top {{ displayedOverviewFoods.length }} results.</p>

        <div class="food-cards">
          <article
            v-for="food in displayedOverviewFoods"
            :key="String(food.id || food.fdcId || food.name)"
            class="food-card"
            :class="{ expanded: expandedOverviewFoodId === String(food.id || food.fdcId || food.name) }"
            @click="toggleOverviewFoodDetails(food)"
          >
            <div class="food-card-main">
              <div>
                <h4>{{ food.name }}</h4>
                <p class="food-kcal">{{ formatCaloriesNumber(food.caloriesPer100g) }} kcal / 100g</p>
              </div>
              <button type="button" class="ghost-btn tiny-btn" @click.stop="toggleOverviewFoodDetails(food)">
                {{ expandedOverviewFoodId === String(food.id || food.fdcId || food.name) ? "Hide Details" : "View Details" }}
              </button>
            </div>
            <div class="food-macros">
              <span>P {{ roundToOne(food.proteinPer100g) }}g</span>
              <span>C {{ roundToOne(food.carbsPer100g) }}g</span>
              <span>F {{ roundToOne(food.fatPer100g) }}g</span>
            </div>
            <div v-if="expandedOverviewFoodId === String(food.id || food.fdcId || food.name)" class="food-details">
              <p><strong>Calories:</strong> {{ formatCaloriesNumber(food.caloriesPer100g) }} kcal / 100g</p>
              <p><strong>Protein:</strong> {{ roundToOne(food.proteinPer100g) }}g</p>
              <p><strong>Carbs:</strong> {{ roundToOne(food.carbsPer100g) }}g</p>
              <p><strong>Fat:</strong> {{ roundToOne(food.fatPer100g) }}g</p>
              <p><strong>Source:</strong> {{ (food.source || "local").toUpperCase() }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="panel diet-hero">
      <div class="date-slider">
        <div class="date-slider-head">
          <h3>{{ dateSliderMonthLabel }}</h3>
          <div class="date-slider-nav">
            <button type="button" class="date-nav-btn" @click="moveDateWindow(-DATE_SHIFT_DAYS)">&#8249;</button>
            <button type="button" class="date-nav-btn" @click="moveDateWindow(DATE_SHIFT_DAYS)">&#8250;</button>
          </div>
        </div>
        <div class="date-slider-row">
          <button
            v-for="item in dateSliderItems"
            :key="item.key"
            type="button"
            class="date-pill"
            :class="{ selected: item.isSelected, today: item.isToday }"
            @click="selectDateFromSlider(item.key)"
          >
            <span class="weekday">{{ item.weekday }}</span>
            <span class="day-num">{{ item.dayNum }}</span>
          </button>
        </div>
      </div>

      <p class="muted">Current Date: {{ selectedDate }}</p>

      <div class="overview-grid">
        <article class="overview-card strong">
          <span>Daily Intake Target</span>
          <strong>{{ isOverviewLoading ? "--" : formatCaloriesOrDash(overview.target.calories) }}</strong>
        </article>
        <article class="overview-card">
          <span>Consumed</span>
          <strong>{{ isOverviewLoading ? "--" : formatCaloriesOrDash(overview.consumed.calories) }}</strong>
        </article>
        <article class="overview-card">
          <span>Remaining Intake</span>
          <strong :class="{ warn: Number.isFinite(Number(overview.remaining.calories)) && overview.remaining.calories < 0 }">
            {{ isOverviewLoading ? "--" : formatCaloriesOrDash(overview.remaining.calories) }}
          </strong>
        </article>
        <article class="overview-card">
          <span>Recommended Burn</span>
          <strong>{{ isOverviewLoading ? "--" : formatCaloriesOrDash(overview.target.suggestedWorkoutBurn) }}</strong>
        </article>
      </div>

      <div class="chart-row">
        <article class="chart-card">
          <h3>Calorie Intake Progress</h3>
          <div class="donut" :style="donutStyle">
            <div class="donut-inner">
              <strong>{{ isOverviewLoading || caloriePercent == null ? "--" : `${caloriePercent}%` }}</strong>
              <span>Intake Ratio</span>
            </div>
          </div>
          <p class="muted">
            {{
              isOverviewLoading
                ? "-- / -- kcal"
                : `${formatCaloriesNumberOrDash(overview.consumed.calories)} / ${formatCaloriesNumberOrDash(overview.target.calories)} kcal`
            }}
            <span v-if="!isOverviewLoading && calorieStatus.extra"> {{ calorieStatus.extra }}</span>
          </p>
          <p class="calorie-hint" :data-status="isOverviewLoading ? 'loading' : calorieStatus.key">
            {{ isOverviewLoading ? "Loading data..." : calorieStatus.hint }}
          </p>
        </article>
        <article class="chart-card">
          <h3>Nutrient Intake</h3>
          <div v-for="card in macroCards" :key="card.key" class="macro-progress">
            <div class="macro-head">
              <span>{{ card.label }}</span>
              <span>
                {{ isOverviewLoading ? "-- / -- g" : `${card.consumed ?? "--"} / ${card.target ?? "--"} g` }}
              </span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: macroPct(card) + '%' }" />
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="panel plans-panel">
      <h3>Hot Recipes 🔥</h3>
      <div class="plans-grid">
        <article
          v-for="plan in planCards"
          :key="plan.id"
          class="plan-card"
          :class="{ active: selectedPlanId === plan.id, focused: focusedPlanCardId === plan.id, locked: plan.isLocked }"
          :data-plan-id="plan.id"
          @click="handlePlanCardClick(plan)"
        >
          <div class="plan-top-strip" />
          <div class="plan-main">
            <div class="plan-title-row">
              <h4>{{ plan.name }}</h4>
              <span class="plan-tag">{{ plan.goalTag }}</span>
            </div>
            <div class="plan-content" :class="{ blurred: plan.isLocked }">
              <p>{{ plan.description }}</p>
              <strong class="plan-kcal">{{ formatCaloriesNumber(plan.dailyCalories) }} <small>kcal/day</small></strong>
            </div>
            <div v-if="plan.isLocked" class="plan-lock-overlay">
              <span class="lock-icon">🔒 VIP Only</span>
              <small>Upgrade to unlock</small>
            </div>
          </div>
        </article>
      </div>

      <article v-if="selectedPlan" class="selected-plan">
        <div class="selected-head">
          <div>
            <h4>{{ selectedPlan.name }} · {{ formatCaloriesNumber(selectedPlanCard?.dailyCalories || 0) }} kcal target</h4>
            <p class="muted">Nutrition-focused daily recommendation split by meal.</p>
            <p v-if="isAppliedPlanForSelectedCard" class="muted small-hint">
              This plan is your active recommendation source for {{ selectedDate }}. Use Add to Records on each food to log
              intake; your Schedule shows one block per meal from those records only.
            </p>
            <p v-else class="muted small-hint">
              Use Apply Plan to make this package the recommendation source below (it does not add anything to your Schedule).
            </p>
          </div>
          <div class="selected-head-actions">
            <button
              type="button"
              :class="['tiny-btn', isAppliedPlanForSelectedCard ? 'applied-btn' : 'ghost-btn']"
              @click="applySelectedPlan"
            >
              {{ isAppliedPlanForSelectedCard ? "Current Plan" : "Apply Plan" }}
            </button>
            <button type="button" :class="['tiny-btn', isSelectedPlanFavorited ? 'saved-btn' : 'ghost-btn']" @click="toggleSelectedPlanFavorite">
              {{ isSelectedPlanFavorited ? "Remove from Favorites" : "Add to Favorites" }}
            </button>
          </div>
        </div>
        <div class="plan-meta-grid">
          <section class="plan-meta-block">
            <h5>Suitable for</h5>
            <div class="plan-meta-tags">
              <span v-for="tag in selectedPlanMeta.suitableFor" :key="`fit-${tag}`" class="plan-meta-tag suitable">{{ tag }}</span>
              <span v-if="!selectedPlanMeta.suitableFor.length" class="plan-meta-empty">No specific guidance</span>
            </div>
          </section>
          <section class="plan-meta-block">
            <h5>Not suitable for</h5>
            <div class="plan-meta-tags">
              <span v-for="tag in selectedPlanMeta.notSuitableFor" :key="`avoid-${tag}`" class="plan-meta-tag avoid">{{ tag }}</span>
              <span v-if="!selectedPlanMeta.notSuitableFor.length" class="plan-meta-empty">No specific restrictions</span>
            </div>
          </section>
          <section class="plan-meta-block">
            <h5>Recipe tags</h5>
            <div class="plan-meta-tags">
              <span v-for="tag in selectedPlanMeta.recipeTags" :key="`recipe-${tag}`" class="plan-meta-tag recipe">{{ tag }}</span>
              <span v-if="!selectedPlanMeta.recipeTags.length" class="plan-meta-empty">No tags</span>
            </div>
          </section>
        </div>
        <div class="plan-breakdown">
          <section v-for="meal in selectedPlanDetails.meals" :key="meal.mealType" class="meal-board">
            <div class="meal-board-head">
              <div class="meal-board-title">
                <span>{{ mealIcon(meal.mealType) }}</span>
                <h5>{{ meal.label }}</h5>
              </div>
              <span class="meal-target-tag">{{ formatCaloriesNumber(meal.targetCalories) }} kcal target</span>
              <div
                class="meal-progress"
                title="Share of daily intake"
                :style="{
                  background: `conic-gradient(#4caf50 0% ${mealProgressPct(meal, selectedPlanDetails.targetTotal)}%, #e9f3ea ${mealProgressPct(meal, selectedPlanDetails.targetTotal)}% 100%)`,
                }"
              >
                <span>{{ mealProgressPct(meal, selectedPlanDetails.targetTotal) }}%</span>
              </div>
            </div>
            <p v-if="!meal.items.length" class="muted">No meal items for this section.</p>
            <div class="meal-food-list">
              <article v-for="item in meal.items" :key="item.recommendationId" class="meal-item">
                <div class="meal-main-row">
                  <span class="food-icon">{{ getFoodEmoji(item) }}</span>
                  <strong class="food-name">{{ item.foodName }}</strong>
                  <span class="food-kcal">{{ formatCaloriesNumber(item.caloriesPer100g) }} kcal / 100g</span>
                </div>
                <div class="meal-sub-row">
                  <span>{{ item.recommendedGrams }} g · {{ formatCalories(item.estimatedCalories) }}</span>
                </div>
                <div class="macro-tags">
                  <span class="macro-chip">P {{ item.estimatedProtein }}g</span>
                  <span class="macro-chip">C {{ item.estimatedCarbs }}g</span>
                  <span class="macro-chip">F {{ item.estimatedFat }}g</span>
                </div>
              </article>
            </div>
          </section>
        </div>
      </article>
    </section>

    <section class="panel mode-panel">
      <div class="mode-head">
        <h3>Record Mode</h3>
        <div class="mode-tabs">
          <button type="button" :class="['mode-tab', { active: recordMode === 'recommended' }]" @click="recordMode = 'recommended'">Recommended Plan</button>
          <button type="button" :class="['mode-tab', { active: recordMode === 'manual' }]" @click="recordMode = 'manual'">Manual Record</button>
        </div>
      </div>

      <section v-if="recordMode === 'recommended'" class="recommended-wrap">
        <p class="muted">{{ recommendedSourceMeta.tip }}</p>
        <p class="muted">
          Daily intake based on your profile · <strong>{{ formatCaloriesNumber(activeRecommendedPlanDetails.targetTotal) }}</strong> kcal/day
          <template v-if="recommendedSourceMeta.source === 'applied'">
            · Recipes: <strong>{{ recommendedSourceMeta.name }}</strong>
          </template>
        </p>
        <div class="recommended-board">
          <section v-for="meal in recommendedModeMeals" :key="meal.mealType" class="meal-board">
            <h4>{{ meal.label }} ({{ formatCaloriesNumber(meal.targetCalories) }} kcal target)</h4>
            <p v-if="!meal.records.length" class="muted">No records for this meal yet.</p>
            <article v-for="row in meal.records" :key="`record-${row._id}`" class="meal-item">
              <div class="meal-main">
                <strong>{{ row.foodName }}</strong>
                <span>{{ roundToOne(row.amountInGrams || row.amount || 0) }} g · {{ formatCalories(row.calories) }}</span>
                <span>P {{ roundToOne(row.protein) }}g · C {{ roundToOne(row.carbs) }}g · F {{ roundToOne(row.fat) }}g</span>
                <span class="recorded-tag">Added at {{ recordAddedAtLabel(row) }} · Source: {{ row.sourceType || "manual" }}</span>
              </div>
              <div class="record-actions">
                <button type="button" class="tiny-btn ghost-btn" @click="editRecord(row)">Edit</button>
                <button type="button" class="tiny-btn danger-btn" @click="removeRecord(row._id)">Delete</button>
              </div>
            </article>
            <p v-if="meal.pendingRecommendations.length" class="muted">Suggestions from current source</p>
            <article v-for="item in meal.pendingRecommendations" :key="`suggest-${item.recommendationId}`" class="meal-item">
              <div class="meal-main">
                <strong>{{ item.foodName }}</strong>
                <span>{{ formatCaloriesNumber(item.caloriesPer100g) }} kcal / 100g</span>
                <span>{{ item.recommendedGrams }} g · {{ formatCalories(item.estimatedCalories) }}</span>
                <span>P {{ item.estimatedProtein }}g · C {{ item.estimatedCarbs }}g · F {{ item.estimatedFat }}g</span>
              </div>
              <button type="button" class="tiny-btn" @click="addRecommendedItem(meal.mealType, item, activeRecommendedPlan.id)">Add to Records</button>
            </article>
          </section>
        </div>
      </section>

      <section v-else class="manual-wrap">
        <h4>{{ isEditing ? "Edit diet record" : "Add manual diet record" }}</h4>
        <form novalidate @submit.prevent="saveManualRecord">
          <div class="grid grid-2">
            <label>
              Date
              <input v-model="form.date" type="date" required />
            </label>
            <label>
              Time
              <input v-model="form.recordedTimeLocal" type="time" required />
            </label>
            <label>
              Meal type
              <select v-model="form.mealType" required>
                <option v-for="meal in MEAL_TYPES" :key="meal.value" :value="meal.value">{{ meal.label }}</option>
              </select>
            </label>
          </div>

          <label>
            Search food library
            <input v-model="foodQuery" placeholder="Type food name to search" @focus="handleFoodQueryFocus" />
          </label>
          <p v-if="searchingFoods" class="muted">Searching...</p>
          <div v-if="isSearchDropdownOpen && foodResults.length" class="search-list">
            <button v-for="item in foodResults" :key="item.id || item.name" type="button" class="search-item" @click="applyFoodTemplate(item)">
              <strong>{{ item.name }}</strong>
              <span>{{ formatCaloriesNumber(item.caloriesPer100g) }} kcal / 100g</span>
            </button>
          </div>

          <label>
            Food name
            <input v-model.trim="form.foodName" placeholder="Food name" required />
          </label>

          <div class="grid grid-2">
            <label>
              Amount (g)
              <input v-model.number="form.amountInGrams" type="number" min="1" step="1" required />
            </label>
            <label>
              Calories (kcal)
              <input v-model.number="form.calories" type="number" min="0" step="0.1" required />
            </label>
            <label>
              Protein (g)
              <input v-model.number="form.protein" type="number" min="0" step="0.1" />
            </label>
            <label>
              Carbs (g)
              <input v-model.number="form.carbs" type="number" min="0" step="0.1" />
            </label>
            <label>
              Fat (g)
              <input v-model.number="form.fat" type="number" min="0" step="0.1" />
            </label>
          </div>

          <label>
            Note
            <input v-model="form.note" placeholder="Optional note" />
          </label>

          <p v-if="formError" class="error">{{ formError }}</p>
          <div class="manual-actions">
            <button v-if="isEditing" type="button" class="ghost-btn" @click="resetManualForm">Cancel Edit</button>
            <button type="submit" :disabled="submitting">{{ submitting ? "Saving..." : isEditing ? "Update Record" : "Add Record" }}</button>
          </div>
        </form>
      </section>
    </section>

    <p v-if="pageError" class="error">{{ pageError }}</p>
    <p v-if="pageSuccess" class="success">{{ pageSuccess }}</p>
    <p v-if="loading" class="muted loading-text">Loading diet data...</p>

    <div v-if="showRetroactiveModal" class="modal-overlay" @click.self="cancelRetroactiveModal">
      <div class="modal-content retro-modal" role="dialog" aria-modal="true" aria-labelledby="retro-modal-title">
        <h3 id="retro-modal-title" class="retro-modal-title">Logging this meal retroactively?</h3>
        <p class="retro-modal-text">
          It's currently <strong>{{ retroModalOpenedAtLabel }}</strong> and you chose <strong>{{ retroModalMealLabel }}</strong>. If you ate this earlier
          but forgot to log it, choose the local time you actually had it so your schedule stays accurate.
        </p>
        <label class="retro-time-label">
          Time you had this meal
          <input v-model="retroModalTime" type="time" class="retro-time-input" />
        </label>
        <p v-if="retroModalError" class="error retro-modal-error">{{ retroModalError }}</p>
        <div class="retro-modal-actions">
          <button type="button" class="ghost-btn" @click="cancelRetroactiveModal">Cancel</button>
          <button type="button" class="ghost-btn" @click="retroModalUseCurrentTime">Use current clock</button>
          <button type="button" class="retro-confirm-btn" @click="confirmRetroactiveModal">Save with this time</button>
        </div>
      </div>
    </div>

    <VipPromptModal v-model="showVipUpgradeModal" />
  </main>
</template>

<style scoped>
.diet-page {
  display: grid;
  gap: 14px;
}

.diet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.diet-hero {
  background: linear-gradient(140deg, #f7fcfb, #eef7f5);
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.overview-toggle-btn {
  padding: 8px 14px;
  font-size: 12px;
  line-height: 1.2;
  font-weight: 700;
  color: #ffffff;
  border: 1px solid #2f8f7d;
  border-radius: 999px;
  background: linear-gradient(135deg, #49b89f, #2f8f7d);
  box-shadow: 0 8px 16px rgba(47, 143, 125, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease, border-color 0.14s ease;
}

.overview-toggle-btn:hover {
  border-color: #267666;
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(38, 118, 102, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  filter: brightness(1.03);
}

.overview-toggle-btn:active {
  transform: translateY(0);
  box-shadow: 0 4px 10px rgba(38, 118, 102, 0.24), inset 0 2px 4px rgba(18, 71, 60, 0.28);
  filter: brightness(0.98);
}

.date-slider {
  border: 1px solid #d7e6e3;
  border-radius: 14px;
  background: #fff;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.date-slider-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.date-slider-head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--c6);
}

.date-slider-nav {
  display: flex;
  gap: 8px;
}

.date-nav-btn {
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--c6);
  background: #e9f4f1;
  font-size: 20px;
  line-height: 1;
}

.date-slider-row {
  display: grid;
  grid-template-columns: repeat(9, minmax(64px, 1fr));
  gap: 8px;
}

.date-pill {
  border: 1px solid #dcebe6;
  border-radius: 14px;
  padding: 8px 6px;
  background: #f8fcfb;
  color: var(--c6);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.date-pill:hover {
  background: #eef8f5;
}

.date-pill.selected {
  background: linear-gradient(120deg, #4ab7a1, #2f8a7b);
  color: #fff;
  border-color: transparent;
}

.date-pill.today:not(.selected) {
  box-shadow: inset 0 0 0 1px #3aa58e;
}

.weekday {
  font-size: 12px;
}

.day-num {
  font-size: 20px;
  font-weight: 700;
}

.food-overview {
  margin-top: 10px;
  border: 1px solid #d6e8e4;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}

.food-overview h3 {
  margin: 0;
  color: var(--c6);
}

.food-overview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.food-overview-search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.food-overview-search {
  max-width: 260px;
}

.food-empty {
  margin: 8px 0 0;
  font-size: 13px;
  color: #5b727b;
}

.food-overview-default {
  border: 1px dashed #d8e8e4;
  border-radius: 10px;
  background: #f9fcfb;
  padding: 12px;
  display: grid;
  gap: 4px;
}

.food-overview-results {
  display: grid;
  gap: 8px;
}

.result-hint {
  margin: 2px 0 0;
  font-size: 12px;
}

.small-hint {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.35;
}

.food-cards {
  display: grid;
  gap: 10px;
  max-height: 430px;
  overflow-y: auto;
  padding-right: 4px;
}

.food-card {
  border: 1px solid #dcebe7;
  border-radius: 10px;
  background: #fff;
  padding: 10px;
  display: grid;
  gap: 8px;
  cursor: pointer;
  transition: box-shadow 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.food-card:hover {
  border-color: #c8ded7;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.food-card.expanded {
  border-color: var(--c4);
  box-shadow: 0 8px 18px rgba(52, 139, 147, 0.12);
}

.food-card-main {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.food-card h4 {
  margin: 0;
  color: var(--c6);
  font-size: 15px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.food-kcal {
  margin: 3px 0 0;
  font-size: 13px;
  color: var(--c4);
  font-weight: 700;
}

.food-macros {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.food-macros span {
  font-size: 12px;
  color: #4f6670;
  background: #eef5f3;
  border-radius: 8px;
  padding: 3px 8px;
  font-weight: 700;
}

.food-details {
  border-top: 1px solid #ebf3f1;
  padding-top: 8px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: #4f6770;
}

.food-details p {
  margin: 0;
}

.overview-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 10px;
}

.overview-card {
  border: 1px solid #d8e9e6;
  border-radius: 12px;
  background: #fff;
  padding: 10px 12px;
  display: grid;
  gap: 4px;
}

.overview-card.strong {
  background: linear-gradient(120deg, #e8f7f4, #dff2ee);
}

.overview-card span {
  font-size: 12px;
  color: #4b6972;
}

.overview-card strong {
  font-size: 20px;
  color: var(--c6);
}

.overview-card strong.warn {
  color: #b03a48;
}

.chart-row {
  margin-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.chart-card {
  border: 1px solid #d8e9e6;
  border-radius: 12px;
  background: #fff;
  padding: 12px;
}

.chart-card h3 {
  margin: 0 0 8px;
}

.donut {
  width: 150px;
  height: 150px;
  margin: 0 auto;
  border-radius: 999px;
  display: grid;
  place-items: center;
}

.donut-inner {
  width: 106px;
  height: 106px;
  background: #fff;
  border-radius: 999px;
  display: grid;
  place-items: center;
  text-align: center;
}

.donut-inner strong {
  font-size: 22px;
  color: var(--c6);
}

.donut-inner span {
  font-size: 12px;
  color: #5d7480;
}

.calorie-hint {
  margin-top: 8px;
  font-size: 13px;
}

.calorie-hint[data-status="loading"] {
  color: #5d7480;
}

.calorie-hint[data-status="normal"] {
  color: #2b7c62;
}

.calorie-hint[data-status="warn"] {
  color: #a56f1a;
}

.calorie-hint[data-status="danger"] {
  color: #b03a48;
}

.macro-progress {
  display: grid;
  gap: 4px;
  margin-bottom: 8px;
}

.macro-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.bar-track {
  height: 10px;
  border-radius: 999px;
  background: #e4efed;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c3), var(--c5));
}

/* Popular Meal Plans and Selected Details UI upgrade */
.plans-panel {
  background: #fff;
  border: 1px solid #e6efea;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.plans-panel h3 {
  margin: 0 0 14px;
  color: #333;
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  max-height: 390px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.plan-card {
  border: 1px solid #e3ece6;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.plan-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
}

.plan-top-strip {
  height: 10px;
  background: linear-gradient(90deg, var(--c3), var(--c4));
}

.plan-main {
  position: relative;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.plan-content {
  display: grid;
  gap: 8px;
}

.plan-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.plan-card h4 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #333;
}

.plan-card p {
  margin: 0;
  font-size: 13px;
  color: #666;
  line-height: 1.45;
}

.plan-kcal {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 800;
  color: var(--c4);
}

.plan-kcal small {
  font-size: 14px;
  font-weight: 700;
  color: inherit;
}

.plan-tag {
  width: fit-content;
  font-size: 11px;
  font-weight: 700;
  border-radius: 8px;
  background: var(--c4);
  color: #fff;
  padding: 3px 8px;
}

.plan-card.active {
  border: 2px solid var(--c4);
  background: linear-gradient(135deg, var(--c3), var(--c4));
  box-shadow: 0 10px 20px rgba(52, 139, 147, 0.28);
}

.plan-card.focused {
  border-color: #4ab7a1;
  box-shadow: 0 0 0 2px rgba(72, 174, 164, 0.22), 0 10px 20px rgba(52, 139, 147, 0.14);
}

.plan-card.active h4,
.plan-card.active p,
.plan-card.active .plan-kcal,
.plan-card.active .plan-kcal small {
  color: #fff;
}

.plan-card.active .plan-top-strip {
  background: rgba(255, 255, 255, 0.3);
}

.plan-card.active .plan-tag {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.plan-card.locked {
  cursor: not-allowed;
}

.plan-card.locked .plan-top-strip {
  opacity: 0.7;
}

.plan-card.locked:hover {
  transform: none;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
}

.plan-content.blurred {
  filter: blur(2px);
  opacity: 0.75;
  user-select: none;
  pointer-events: none;
}

.plan-lock-overlay {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(1px);
  display: grid;
  place-content: center;
  gap: 4px;
  text-align: center;
  color: var(--c6);
  font-weight: 700;
}

.plan-lock-overlay small {
  font-size: 11px;
  font-weight: 600;
  color: #4f6a73;
}

.selected-plan {
  margin-top: 16px;
  border: 1px solid #e6efea;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 16px;
}

.selected-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef3ef;
}

.selected-head h4 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: #333;
}

.selected-head p {
  margin: 6px 0 0;
  color: #666;
}

.selected-head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.selected-head-actions .tiny-btn {
  border: 1px solid var(--c4);
  background: var(--c4);
  color: #fff;
}

.selected-head-actions .tiny-btn:hover {
  background: var(--c3);
}

.selected-head-actions .ghost-btn {
  border: 1px solid #d7d7d7;
  background: #f5f5f5;
  color: #333;
}

.selected-head-actions .ghost-btn:hover {
  background: #ececec;
}

.selected-head-actions .applied-btn {
  border: 1px solid var(--c4);
  background: var(--c4);
  color: #fff;
}

.selected-head-actions .applied-btn:hover {
  background: var(--c3);
}

.plan-breakdown {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.plan-meta-grid {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.plan-meta-block h5 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  color: #476270;
}

.plan-meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.plan-meta-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.plan-meta-tag.suitable {
  color: #23674f;
  background: #e6f4ef;
  border: 1px solid #b8e0d1;
}

.plan-meta-tag.avoid {
  color: #8c3131;
  background: #fff1f1;
  border: 1px solid #f2c5c5;
}

.plan-meta-tag.recipe {
  color: #355366;
  background: #eef4f8;
  border: 1px solid #d4e1ea;
}

.plan-meta-empty {
  font-size: 11px;
  color: #8a9ca6;
}

.selected-plan .meal-board {
  border: 1px solid #e5ece7;
  border-radius: 8px;
  background: #fafdfb;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.selected-plan .meal-board-head {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
}

.selected-plan .meal-board-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-plan .meal-board h5 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #333;
}

.selected-plan .meal-target-tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--c4);
  background: #e9f4f2;
  border-radius: 8px;
  padding: 4px 8px;
}

.selected-plan .meal-progress {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: grid;
  place-items: center;
}

.selected-plan .meal-progress span {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #fff;
  color: #333;
  font-size: 10px;
  font-weight: 800;
}

.selected-plan .meal-food-list {
  display: grid;
  gap: 8px;
}

.selected-plan .meal-item {
  border: 1px solid #edf3ef;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
  display: grid;
  gap: 6px;
}

.selected-plan .meal-main-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
}

.selected-plan .food-icon {
  font-size: 16px;
}

.selected-plan .food-name {
  color: #333;
}

.selected-plan .food-kcal {
  font-size: 12px;
  font-weight: 700;
  color: var(--c4);
}

.selected-plan .meal-sub-row {
  font-size: 12px;
  color: #666;
}

.selected-plan .macro-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.selected-plan .macro-chip {
  font-size: 11px;
  font-weight: 700;
  color: #4b5f56;
  background: #f3f5f4;
  border-radius: 8px;
  padding: 3px 8px;
}

.mode-panel h3 {
  margin: 0;
}

.mode-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.mode-tabs {
  display: flex;
  gap: 8px;
}

.mode-tab {
  border: 1px solid #d5e7e3;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  color: #4b6872;
  background: #f3f8f7;
}

.mode-tab.active {
  color: #fff;
  border-color: var(--c4);
  background: linear-gradient(90deg, var(--c3), var(--c4));
}

.recommended-wrap {
  display: grid;
  gap: 10px;
}

.recommended-board {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.meal-board {
  border: 1px solid #deece8;
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
  background: #fff;
}

.meal-item {
  border: 1px solid #edf5f3;
  border-radius: 10px;
  padding: 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.meal-main {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: #486370;
}

.manual-wrap h4 {
  margin: 8px 0;
}

.manual-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.search-list {
  border: 1px solid #d6e8e4;
  border-radius: 10px;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: 320px;
  scrollbar-gutter: stable;
}

.search-item {
  width: 100%;
  border-radius: 0;
  border-bottom: 1px solid #ecf4f2;
  background: #fff;
  color: var(--c6);
  text-align: left;
  display: flex;
  justify-content: space-between;
}

.search-item:last-child {
  border-bottom: none;
}

.record-actions {
  display: flex;
  gap: 8px;
}

.recorded-tag {
  display: inline-block;
  width: fit-content;
  font-size: 11px;
  font-weight: 700;
  color: #1b7e5a;
  background: #e4f4ee;
  border-radius: 999px;
  padding: 3px 8px;
}

.tiny-btn {
  padding: 6px 10px;
  font-size: 12px;
}

.ghost-btn {
  background: #e7eceb;
  color: var(--c6);
}

.saved-btn {
  border: 1px solid var(--c4);
  background: #e6f3f1;
  color: var(--c4);
  font-weight: 700;
}

.danger-btn {
  background: linear-gradient(90deg, #be3b3b, #a72e2e);
}

.error {
  color: #b03a48;
}

.success {
  color: #24785e;
}

.loading-text {
  text-align: center;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 26, 28, 0.45);
  display: grid;
  place-items: center;
  z-index: 1200;
}

.modal-content {
  width: min(92vw, 360px);
  border-radius: 12px;
  padding: 18px 16px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.retro-modal {
  width: min(92vw, 420px);
  text-align: left;
}

.retro-modal-title {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 800;
  color: #28363d;
  text-align: left;
}

.retro-modal-text {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.45;
  color: #4a5f66;
}

.retro-time-label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #374e55;
  margin-bottom: 12px;
}

.retro-time-input {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #c5d9d3;
  font-size: 15px;
}

.retro-modal-error {
  margin: 0 0 10px;
}

.retro-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  align-items: center;
}

.retro-confirm-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid #2f8f7d;
  background: linear-gradient(135deg, #49b89f, #2f8f7d);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.retro-confirm-btn:hover {
  filter: brightness(1.03);
}

@media (max-width: 1100px) {
  .plans-grid,
  .overview-grid,
  .plan-breakdown,
  .recommended-board {
    grid-template-columns: 1fr;
  }

  .chart-row {
    grid-template-columns: 1fr;
  }

  .date-slider-row {
    grid-template-columns: repeat(3, minmax(64px, 1fr));
  }

  .diet-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-title-row {
    width: 100%;
    justify-content: space-between;
  }

  .mode-head,
  .selected-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .food-overview-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .food-overview-search-wrap {
    width: 100%;
  }

  .food-overview-search {
    max-width: 100%;
    width: 100%;
  }
}
</style>
