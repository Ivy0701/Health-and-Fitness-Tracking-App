<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";
import { useFavorites } from "../services/favorites";
import { getTodayLocalDate } from "../utils/dateLocal";

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

const PLAN_DEFINITIONS = [
  { id: "hot", name: "Hot Meal Plans", type: "hot", description: "Popular daily meals with balanced macros." },
  { id: "fat_loss", name: "Fat Loss Plan", type: "fat_loss", description: "Lower-calorie, high-protein and vegetable-focused meals." },
  { id: "weight_loss", name: "Weight Loss Plan", type: "weight_loss", description: "Controlled calories with practical meal portions." },
  { id: "muscle_gain", name: "Muscle Gain Plan", type: "muscle_gain", description: "Higher calories and more protein/carb support for training." },
  { id: "high_protein", name: "High Protein Plan", type: "high_protein", description: "Raise protein intake while keeping calories manageable." },
  { id: "balanced", name: "Balanced Plan", type: "balanced", description: "Even macro structure for long-term consistency." },
  { id: "keto", name: "Keto Plan", type: "fat_loss", description: "Very low-carb meals with moderate protein and healthy fats." },
  { id: "vegetarian", name: "Vegetarian Plan", type: "balanced", description: "Plant-forward meal combinations with balanced daily macros." },
  { id: "low_sugar", name: "Low Sugar Plan", type: "weight_loss", description: "Reduce added sugar while keeping stable energy through the day." },
  { id: "low_fat", name: "Low Fat Plan", type: "weight_loss", description: "Lower-fat food picks with controlled portions and lighter cooking." },
  { id: "athlete", name: "Athlete Plan", type: "muscle_gain", description: "Higher fuel support for training volume and recovery demands." },
  { id: "clean_eating", name: "Clean Eating Plan", type: "high_protein", description: "Whole-food focused plan with practical prep and clean ingredients." },
];
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

const PLAN_MEAL_DISTRIBUTION = {
  hot: { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 },
  fat_loss: { breakfast: 0.24, lunch: 0.34, dinner: 0.31, snack: 0.11 },
  weight_loss: { breakfast: 0.24, lunch: 0.34, dinner: 0.31, snack: 0.11 },
  muscle_gain: { breakfast: 0.26, lunch: 0.35, dinner: 0.29, snack: 0.1 },
  high_protein: { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 },
  balanced: { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 },
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

function macroForFood(food, grams) {
  const ratio = toNumber(grams) / 100;
  return {
    calories: roundToOne(toNumber(food.caloriesPer100g) * ratio),
    protein: roundToOne(toNumber(food.proteinPer100g) * ratio),
    carbs: roundToOne(toNumber(food.carbsPer100g) * ratio),
    fat: roundToOne(toNumber(food.fatPer100g) * ratio),
  };
}

function mealIcon(mealType) {
  if (mealType === "breakfast") return "🍳";
  if (mealType === "lunch") return "🥗";
  if (mealType === "dinner") return "🍽️";
  return "🍎";
}

const todayKey = getTodayLocalDate();
const selectedDate = ref(todayKey);
const DATE_WINDOW_DAYS = 9;
const DATE_SHIFT_DAYS = 7;
const dateWindowStart = ref(shiftDateKey(todayKey, -Math.floor(DATE_WINDOW_DAYS / 2)));
const me = ref(null);
const loading = ref(false);
const searchingFoods = ref(false);
const submitting = ref(false);
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

const overview = ref({
  target: { calories: 2000, suggestedWorkoutBurn: 160, protein: 120, carbs: 220, fat: 65 },
  consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  remaining: { calories: 2000, protein: 120, carbs: 220, fat: 65 },
});

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
});

const foodQuery = ref("");
const isEditing = computed(() => Boolean(editingId.value));
const selectedPlan = computed(() => PLAN_DEFINITIONS.find((x) => x.id === selectedPlanId.value) || null);
const planForRecommendation = computed(() => selectedPlan.value || PLAN_DEFINITIONS[0]);
const appliedPlan = computed(() => PLAN_DEFINITIONS.find((x) => x.id === appliedPlanId.value) || null);
const isSelectedPlanApplied = computed(() => Boolean(selectedPlan.value && appliedPlanId.value === selectedPlan.value.id));
const defaultDynamicPlanType = computed(() => {
  const direction = estimateGoalDirection();
  if (direction === "loss") return "weight_loss";
  if (direction === "gain") return "muscle_gain";
  return "balanced";
});
const defaultDynamicPlan = computed(() => ({
  id: "default_dynamic",
  name: "Personalized Daily Plan",
  type: defaultDynamicPlanType.value,
  description: "Auto-generated from your current weight, target weight, and target days.",
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

const calorieRatio = computed(() => {
  const target = Math.max(1, toNumber(overview.value.target?.calories, 1));
  const consumed = toNumber(overview.value.consumed?.calories);
  return consumed / target;
});
const caloriePercent = computed(() => roundToOne(calorieRatio.value * 100));
const donutFillPercent = computed(() => clamp(caloriePercent.value, 0, 100));

const calorieStatus = computed(() => {
  const consumed = toNumber(overview.value.consumed?.calories);
  const target = Math.max(1, toNumber(overview.value.target?.calories, 1));
  const exceeded = Math.max(0, roundToInt(consumed - target));
  if (calorieRatio.value >= 1) {
    return {
      key: "danger",
      color: "#be3b3b",
      hint: `You have exceeded today's calorie target by ${formatCalories(exceeded)}. Further high-calorie intake is not recommended today.`,
      extra: `(+${formatCalories(exceeded)})`,
    };
  }
  if (calorieRatio.value >= 0.8) {
    return {
      key: "warn",
      color: "#d69a1e",
      hint: "You are close to your daily calorie target. Be mindful of your remaining intake.",
      extra: "",
    };
  }
  return {
    key: "normal",
    color: "var(--c4)",
    hint: "You are within your target range today.",
    extra: "",
  };
});

const donutStyle = computed(() => ({
  background: `conic-gradient(${calorieStatus.value.color} 0% ${donutFillPercent.value}%, #dfeceb ${donutFillPercent.value}% 100%)`,
}));

const macroCards = computed(() => [
  { key: "protein", label: "Protein", consumed: roundToOne(overview.value.consumed?.protein), target: roundToOne(overview.value.target?.protein) },
  { key: "carbs", label: "Carbs", consumed: roundToOne(overview.value.consumed?.carbs), target: roundToOne(overview.value.target?.carbs) },
  { key: "fat", label: "Fat", consumed: roundToOne(overview.value.consumed?.fat), target: roundToOne(overview.value.target?.fat) },
]);

function macroPct(card) {
  const target = Math.max(1, toNumber(card.target, 1));
  return Math.min(roundToOne((toNumber(card.consumed) / target) * 100), 100);
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
  editingId.value = "";
  formError.value = "";
  selectedFoodTemplate.value = null;
}

function validateManualForm() {
  if (!form.foodName.trim()) return "Food name cannot be empty.";
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
}

async function loadForDate() {
  if (!me.value?.id) return;
  const dateKey = selectedDate.value;
  const requestId = ++loadRequestSeq;
  loading.value = true;
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
    console.debug("[Diet][LoadForDate] failed", {
      requestId,
      selectedDate: selectedDate.value,
      message: pageError.value,
    });
  } finally {
    if (requestId === loadRequestSeq) loading.value = false;
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

function estimateGoalDays() {
  const profileDays = Number(me.value?.targetDays);
  if (Number.isInteger(profileDays) && profileDays > 0) {
    return clamp(profileDays, 7, 3650);
  }
  const rawDate = me.value?.targetDate || me.value?.goalDate || "";
  if (rawDate) {
    const end = new Date(rawDate);
    if (!Number.isNaN(end.getTime())) {
      const diff = Math.ceil((end.getTime() - Date.now()) / 86400000);
      return clamp(diff, 7, 365);
    }
  }
  return 90;
}

function calculatePlanCalories(planType) {
  const base = Math.max(1200, roundToOne(overview.value.target?.calories || 0));
  const direction = estimateGoalDirection();
  const days = estimateGoalDays();
  const weightGap = Math.abs(toNumber(me.value?.weight) - toNumber(me.value?.targetWeight));
  const dailyNeed = weightGap > 0 ? clamp((weightGap * 7700) / Math.max(days, 1), 0, 500) : 0;
  let planAdjusted = base;

  if (planType === "fat_loss" || planType === "weight_loss") {
    planAdjusted -= direction === "loss" ? Math.max(120, dailyNeed * 0.7) : 140;
  } else if (planType === "muscle_gain") {
    planAdjusted += direction === "gain" ? Math.max(150, dailyNeed * 0.6) : 180;
  } else if (planType === "high_protein") {
    planAdjusted += direction === "gain" ? 120 : -30;
  } else if (planType === "balanced") {
    planAdjusted += 0;
  } else {
    planAdjusted += direction === "gain" ? 90 : direction === "loss" ? -70 : 0;
  }

  return clamp(roundToInt(planAdjusted), 1200, 3800);
}

const adjustedPlanCalories = computed(() => calculatePlanCalories(planForRecommendation.value.type));
const defaultDynamicCalories = computed(() => calculatePlanCalories(defaultDynamicPlanType.value));

const recommendedSourceMeta = computed(() => {
  if (appliedPlan.value) {
    return {
      source: "applied",
      name: appliedPlan.value.name,
      tip: `${appliedPlan.value.name} is applied and is currently shown below.`,
    };
  }
  return {
    source: "default",
    name: defaultDynamicPlan.value.name,
    tip: "Personalized daily recommendation based on your current weight, target weight, and target days.",
  };
});

const planCards = computed(() =>
  PLAN_DEFINITIONS.map((plan, idx) => {
    let suggestion = adjustedPlanCalories.value;
    if (plan.type === "muscle_gain") suggestion += 120;
    if (plan.type === "fat_loss" || plan.type === "weight_loss") suggestion -= 120;
    if (plan.type === "high_protein") suggestion += 40;
    return {
      ...plan,
      isLocked: !isVipUser.value && idx >= LOCK_FREE_PLAN_COUNT,
      suggestedCalories: clamp(roundToInt(suggestion), 1200, 4000),
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

function pickFood(mealType, category, seed, usedIds) {
  const inMeal = foodLibraryRows.value.filter((x) => (x.mealTypes || []).includes(mealType));
  const preferred = inMeal.filter((x) => x.category === category && !usedIds.has(x.id));
  const fallback = inMeal.filter((x) => !usedIds.has(x.id));
  const pool = preferred.length ? preferred : fallback.length ? fallback : inMeal;
  if (!pool.length) return null;
  return pool[seed % pool.length];
}

function createMealRecommendation(mealType, targetCalories, planType, dateKey) {
  const categories = PLAN_CATEGORY_BLUEPRINT[planType]?.[mealType] || PLAN_CATEGORY_BLUEPRINT.balanced[mealType];
  const usedIds = new Set();
  const shares = categories.length === 3 ? [0.4, 0.35, 0.25] : [0.6, 0.4];
  const baseSeed = hashString(`${dateKey}-${planType}-${mealType}`);

  const rows = categories
    .map((category, idx) => {
      const food = pickFood(mealType, category, baseSeed + idx * 11, usedIds);
      if (!food) return null;
      usedIds.add(food.id);
      const slotCalories = targetCalories * (shares[idx] || 0.33);
      const grams = clamp(roundToOne((slotCalories / Math.max(1, toNumber(food.caloriesPer100g))) * 100), 20, 400);
      const nutrition = macroForFood(food, grams);
      return {
        recommendationId: `${dateKey}-${planType}-${mealType}-${food.id}-${idx}`,
        mealType,
        foodId: food.id,
        foodName: food.name,
        caloriesPer100g: toNumber(food.caloriesPer100g),
        proteinPer100g: toNumber(food.proteinPer100g),
        carbsPer100g: toNumber(food.carbsPer100g),
        fatPer100g: toNumber(food.fatPer100g),
        recommendedGrams: grams,
        estimatedCalories: nutrition.calories,
        estimatedProtein: nutrition.protein,
        estimatedCarbs: nutrition.carbs,
        estimatedFat: nutrition.fat,
      };
    })
    .filter(Boolean);

  const total = rows.reduce((sum, x) => sum + toNumber(x.estimatedCalories), 0);
  if (total > 0) {
    const factor = clamp(targetCalories / total, 0.85, 1.15);
    return rows.map((item) => {
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
  return rows;
}

function buildPlanDetails(planType, dateKey, targetTotalInput) {
  const distribution = PLAN_MEAL_DISTRIBUTION[planType] || PLAN_MEAL_DISTRIBUTION.balanced;
  const targetTotal = Math.max(1200, roundToInt(targetTotalInput ?? calculatePlanCalories(planType)));
  const mealRows = MEAL_TYPES.map((meal) => {
    const mealTarget = roundToInt(targetTotal * (distribution[meal.value] || 0));
    const items = createMealRecommendation(meal.value, mealTarget, planType, dateKey);
    return { mealType: meal.value, label: meal.label, targetCalories: mealTarget, items };
  });
  return { targetTotal, meals: mealRows };
}

const selectedPlanDetails = computed(() => {
  if (!selectedPlan.value) return { targetTotal: 0, meals: [] };
  return buildPlanDetails(selectedPlan.value.type, selectedDate.value, adjustedPlanCalories.value);
});

const appliedPlanDetails = computed(() => {
  if (!appliedPlan.value) return { targetTotal: 0, meals: [] };
  return buildPlanDetails(appliedPlan.value.type, selectedDate.value, calculatePlanCalories(appliedPlan.value.type));
});

const defaultDynamicPlanDetails = computed(() =>
  buildPlanDetails(defaultDynamicPlanType.value, selectedDate.value, defaultDynamicCalories.value)
);

const activeRecommendedPlan = computed(() => {
  if (appliedPlan.value) return appliedPlan.value;
  return defaultDynamicPlan.value;
});

const activeRecommendedPlanDetails = computed(() => {
  if (appliedPlan.value) return appliedPlanDetails.value;
  return defaultDynamicPlanDetails.value;
});

const recommendedModeMeals = computed(() =>
  activeRecommendedPlanDetails.value.meals.map((meal) => {
    const cards = meal.items.map((item) => {
      const recommendationId = `${activeRecommendedPlan.value.id}-${item.recommendationId}`;
      const linked = records.value.find((x) => String(x.recommendationId || "") === recommendationId);
      if (linked) return { key: `record-${linked._id}`, mode: "recorded", recommendation: item, record: linked };
      return { key: `recommend-${item.recommendationId}`, mode: "recommended", recommendation: item, record: null };
    });
    return { ...meal, cards };
  })
);

function mealAllocatedCalories(meal) {
  return roundToOne((meal?.items || []).reduce((sum, item) => sum + toNumber(item.estimatedCalories), 0));
}

function mealProgressPct(meal) {
  const target = Math.max(1, toNumber(meal?.targetCalories, 1));
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

function goToVipPage() {
  showVipUpgradeModal.value = false;
  router.push("/vip");
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
  await nextTick();
  const el = document.querySelector(`[data-plan-id="${planId}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focusPlanTimer) window.clearTimeout(focusPlanTimer);
  focusPlanTimer = window.setTimeout(() => {
    focusedPlanCardId.value = "";
  }, 2200);
}

function applySelectedPlan() {
  if (!selectedPlan.value) return;
  if (isSelectedPlanApplied.value) {
    appliedPlanId.value = "";
    persistAppliedPlanToStorage();
    pageSuccess.value = `${selectedPlan.value.name} removed from Recommended Plan mode.`;
    return;
  }
  appliedPlanId.value = selectedPlan.value.id;
  persistAppliedPlanToStorage();
  recordMode.value = "recommended";
  pageSuccess.value = `${selectedPlan.value.name} applied to Recommended Plan mode.`;
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
      targetCalories: adjustedPlanCalories.value,
      description: selectedPlan.value.description,
      metadata: { planType: selectedPlan.value.type },
      sourceType: "diet_plan",
    });
    pageSuccess.value = `${selectedPlan.value.name} added to favorites.`;
  } catch (error) {
    pageError.value = error?.response?.data?.message || "Failed to update favorite status.";
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
  } catch (err) {
    formError.value = err?.response?.data?.message || "Failed to save diet record.";
  } finally {
    submitting.value = false;
  }
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
    unit: "g",
    note: "Added from popular meal plan",
    recordedAt: new Date().toISOString(),
  };
  try {
    await api.post("/diets", payload);
    pageSuccess.value = "Recommended item added to records.";
    await loadForDate();
  } catch (err) {
    pageError.value = err?.response?.data?.message || "Failed to add recommended item.";
  }
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
  () => route.query.focusItem,
  async () => {
    await focusPlanFromQuery();
  }
);
</script>

<template>
  <AppNavbar />
  <main class="page diet-page">
    <section class="diet-header">
      <div class="hero-title-row">
        <h2 class="title">🥗 Diet</h2>
        <button type="button" class="ghost-btn overview-toggle-btn" @click="toggleFoodOverview">Food Nutrition Overview</button>
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

      <p class="muted">Selected date: {{ selectedDate }}</p>

      <div class="overview-grid">
        <article class="overview-card strong">
          <span>Daily calorie target</span>
          <strong>{{ formatCalories(overview.target.calories) }}</strong>
        </article>
        <article class="overview-card">
          <span>Consumed</span>
          <strong>{{ formatCalories(overview.consumed.calories) }}</strong>
        </article>
        <article class="overview-card">
          <span>Remaining</span>
          <strong :class="{ warn: overview.remaining.calories < 0 }">{{ formatCalories(overview.remaining.calories) }}</strong>
        </article>
        <article class="overview-card">
          <span>Suggested workout burn</span>
          <strong>{{ formatCalories(overview.target.suggestedWorkoutBurn) }}</strong>
        </article>
      </div>

      <div class="chart-row">
        <article class="chart-card">
          <h3>Calorie Progress</h3>
          <div class="donut" :style="donutStyle">
            <div class="donut-inner">
              <strong>{{ caloriePercent }}%</strong>
              <span>consumed</span>
            </div>
          </div>
          <p class="muted">
            {{ formatCaloriesNumber(overview.consumed.calories) }} / {{ formatCaloriesNumber(overview.target.calories) }} kcal
            <span v-if="calorieStatus.extra"> {{ calorieStatus.extra }}</span>
          </p>
          <p class="calorie-hint" :data-status="calorieStatus.key">{{ calorieStatus.hint }}</p>
        </article>
        <article class="chart-card">
          <h3>Macro Progress</h3>
          <div v-for="card in macroCards" :key="card.key" class="macro-progress">
            <div class="macro-head">
              <span>{{ card.label }}</span>
              <span>{{ card.consumed }} / {{ card.target }} g</span>
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
              <strong class="plan-kcal">{{ formatCaloriesNumber(plan.suggestedCalories) }} <small>kcal/day</small></strong>
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
            <h4>{{ selectedPlan.name }} · {{ formatCaloriesNumber(adjustedPlanCalories) }} kcal target</h4>
            <p class="muted">Nutrition-focused daily recommendation split by meal.</p>
          </div>
          <div class="selected-head-actions">
            <button type="button" :class="['tiny-btn', isSelectedPlanApplied ? 'applied-btn' : 'ghost-btn']" @click="applySelectedPlan">
              {{ isSelectedPlanApplied ? "Remove Applied Plan" : "Apply Plan" }}
            </button>
            <button type="button" :class="['tiny-btn', isSelectedPlanFavorited ? 'saved-btn' : 'ghost-btn']" @click="toggleSelectedPlanFavorite">
              {{ isSelectedPlanFavorited ? "Remove from Favorites" : "Add to Favorites" }}
            </button>
          </div>
        </div>
        <div class="plan-breakdown">
          <section v-for="meal in selectedPlanDetails.meals" :key="meal.mealType" class="meal-board">
            <div class="meal-board-head">
              <div class="meal-board-title">
                <span>{{ mealIcon(meal.mealType) }}</span>
                <h5>{{ meal.label }}</h5>
              </div>
              <span class="meal-target-tag">{{ formatCaloriesNumber(meal.targetCalories) }} kcal target</span>
              <div class="meal-progress" :style="{ background: `conic-gradient(#4caf50 0% ${mealProgressPct(meal)}%, #e9f3ea ${mealProgressPct(meal)}% 100%)` }">
                <span>{{ mealProgressPct(meal) }}%</span>
              </div>
            </div>
            <p v-if="!meal.items.length" class="muted">No meal items for this section.</p>
            <div class="meal-food-list">
              <article v-for="item in meal.items" :key="item.recommendationId" class="meal-item">
                <div class="meal-main-row">
                  <span class="food-icon">🥬</span>
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
          Current source: <strong>{{ recommendedSourceMeta.name }}</strong> · {{ formatCaloriesNumber(activeRecommendedPlanDetails.targetTotal) }} kcal/day
        </p>
        <div class="recommended-board">
          <section v-for="meal in recommendedModeMeals" :key="meal.mealType" class="meal-board">
            <h4>{{ meal.label }} ({{ formatCaloriesNumber(meal.targetCalories) }} kcal target)</h4>
            <p v-if="!meal.cards.length" class="muted">No recommended items.</p>
            <article v-for="card in meal.cards" :key="card.key" class="meal-item">
              <div class="meal-main">
                <strong>{{ card.recommendation.foodName }}</strong>
                <span>{{ formatCaloriesNumber(card.recommendation.caloriesPer100g) }} kcal / 100g</span>
                <span v-if="card.mode === 'recommended'">{{ card.recommendation.recommendedGrams }} g · {{ formatCalories(card.recommendation.estimatedCalories) }}</span>
                <span v-else-if="card.record">{{ roundToOne(card.record.amountInGrams || card.record.amount || 0) }} g · {{ formatCalories(card.record.calories) }}</span>
                <span v-if="card.mode === 'recommended'">
                  P {{ card.recommendation.estimatedProtein }}g · C {{ card.recommendation.estimatedCarbs }}g · F {{ card.recommendation.estimatedFat }}g
                </span>
                <span v-else-if="card.record">P {{ roundToOne(card.record.protein) }}g · C {{ roundToOne(card.record.carbs) }}g · F {{ roundToOne(card.record.fat) }}g</span>
                <span v-if="card.record" class="recorded-tag">
                  Added at {{ formatRecordTime(card.record.recordedAt || card.record.createdAt) || "--:--" }} · Source: {{ card.record.sourceType || "recommended" }}
                </span>
              </div>
              <button v-if="card.mode === 'recommended'" type="button" class="tiny-btn" @click="addRecommendedItem(meal.mealType, card.recommendation, activeRecommendedPlan.id)">
                Add to Records
              </button>
              <div v-else-if="card.record" class="record-actions">
                <button type="button" class="tiny-btn ghost-btn" @click="editRecord(card.record)">Edit</button>
                <button type="button" class="tiny-btn danger-btn" @click="removeRecord(card.record._id)">Delete</button>
              </div>
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

    <div v-if="showVipUpgradeModal" class="modal-overlay" @click.self="showVipUpgradeModal = false">
      <div class="modal-content">
        <p class="vip-modal-title">🔒 VIP only</p>
        <p class="upgrade-link" @click="goToVipPage">Upgrade to unlock premium recipes</p>
      </div>
    </div>
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
  padding: 7px 12px;
  font-size: 12px;
  line-height: 1.2;
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

.vip-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #28363d;
}

.upgrade-link {
  margin: 8px 0 0;
  text-decoration: underline;
  cursor: pointer;
  color: #3b82f6;
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
