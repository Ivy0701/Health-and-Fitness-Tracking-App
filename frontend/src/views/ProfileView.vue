<script setup>
/**
 * Profile — personal health center (incremental UI on existing /user/profile API).
 * Optional read-only: GET /dashboard for weekly workout / calories aggregates (fails gracefully).
 */
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useBmiStore } from "../stores/bmi";
import { calculateBmiValue } from "../utils/bmi";

const bmiStore = useBmiStore();
const router = useRouter();

const profile = ref(null);
const dashboardPayload = ref(null);
/** Read-only summaries for Profile activity cards (no store changes elsewhere). */
const activityPlans = ref([]);
const activityToday = ref(null);
const activityEnrolled = ref([]);
const activityDiets = ref([]);

const loading = ref(true);
const saving = ref(false);
const avatarBroken = ref(false);
const toastVisible = ref(false);
const toastMessage = ref("");
const state = reactive({ error: "", success: "" });

const form = reactive({
  username: "",
  gender: "prefer_not_to_say",
  age: "",
  height: "",
  weight: "",
  targetWeight: "",
  activityLevel: "moderate",
  goal: "General Health",
  heartRate: "",
  avatar: "",
  preferredWorkoutTypes: [],
  preferredDietFocus: "",
});

/** Primary goal presets — stored in legacy `goal` string on user. */
const PRIMARY_GOAL_VALUES = [
  "Lose Weight",
  "Gain Muscle",
  "Maintain Fitness",
  "Improve Endurance",
  "General Health",
];

const WORKOUT_TYPE_OPTIONS = ["Cardio", "Strength", "Yoga", "HIIT", "Stretching"];

const DIET_FOCUS_OPTIONS = ["Balanced", "High Protein", "Low Sugar", "Low Fat", "Vegetarian"];

/** UI activity tier (3 options) maps to DB enum values light | moderate | active. */
const ACTIVITY_UI_LABELS = {
  light: "Light",
  moderate: "Moderate",
  active: "Active",
};

function mapDbActivityToForm(db) {
  if (db === "sedentary" || db === "light") return "light";
  if (db === "moderate") return "moderate";
  if (db === "active" || db === "very_active") return "active";
  return "moderate";
}

/** Profile-only BMI category (spec: 18.5–24.9 normal, 25–29.9 overweight, ≥30 obese). */
function bmiCategoryFromValue(bmi) {
  const v = Number(bmi);
  if (!Number.isFinite(v)) return { key: "none", label: "No data" };
  if (v < 18.5) return { key: "under", label: "Underweight" };
  if (v <= 24.9) return { key: "normal", label: "Normal" };
  if (v <= 29.9) return { key: "over", label: "Overweight" };
  return { key: "obese", label: "Obese" };
}

function bmiExplanation(categoryKey) {
  switch (categoryKey) {
    case "under":
      return "Your BMI is in the underweight range.";
    case "normal":
      return "Your BMI is in the normal range.";
    case "over":
      return "Your BMI is in the overweight range.";
    case "obese":
      return "Your BMI is in the obese range.";
    default:
      return "Enter height and weight to see your BMI interpretation.";
  }
}

function fillForm(data) {
  avatarBroken.value = false;
  form.username = data.username || "";
  form.gender = data.gender || "prefer_not_to_say";
  form.age = data.age ?? "";
  form.height = data.height ?? "";
  form.weight = data.weight ?? "";
  form.targetWeight = data.targetWeight ?? "";
  form.activityLevel = mapDbActivityToForm(data.activityLevel);
  const g = (data.goal || "").trim();
  form.goal = g || "General Health";
  form.heartRate = data.heartRate ?? "";
  form.avatar = data.avatar || "";
  form.preferredWorkoutTypes = Array.isArray(data.preferredWorkoutTypes) ? [...data.preferredWorkoutTypes] : [];
  form.preferredDietFocus = data.preferredDietFocus || "";
}

/** Live BMI from form (cm / kg); invalid → null. */
const liveBmiNumber = computed(() => {
  const h = Number(form.height);
  const w = Number(form.weight);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null;
  const raw = calculateBmiValue(w, h);
  return Number.isFinite(raw) ? raw : null;
});

const liveBmiDisplay = computed(() => {
  if (liveBmiNumber.value == null) return "--";
  return liveBmiNumber.value.toFixed(2);
});

const liveBmiCategory = computed(() => bmiCategoryFromValue(liveBmiNumber.value));

const displayEmail = computed(() => profile.value?.email || "");

const goalTagText = computed(() => {
  const g = (form.goal || "").trim();
  return g || "General Health";
});

const hasLegacyCustomGoal = computed(
  () => !!(form.goal && !PRIMARY_GOAL_VALUES.includes(form.goal))
);

const activityTagText = computed(() => ACTIVITY_UI_LABELS[form.activityLevel] || "Moderate");

function togglePreferredWorkoutType(t) {
  const i = form.preferredWorkoutTypes.indexOf(t);
  if (i >= 0) form.preferredWorkoutTypes.splice(i, 1);
  else form.preferredWorkoutTypes.push(t);
}

function isWorkoutTypeSelected(t) {
  return form.preferredWorkoutTypes.includes(t);
}

const displayUsername = computed(() => form.username || profile.value?.username || "Member");

const avatarSrc = computed(() => {
  const u = (form.avatar || "").trim();
  return u || "";
});

const completenessFields = computed(() => [
  { ok: !!(form.username && String(form.username).trim()) },
  { ok: !!displayEmail.value },
  { ok: !!form.gender },
  { ok: form.age !== "" && form.age != null && Number.isFinite(Number(form.age)) },
  { ok: form.height !== "" && form.height != null && Number.isFinite(Number(form.height)) },
  { ok: form.weight !== "" && form.weight != null && Number.isFinite(Number(form.weight)) },
  { ok: form.targetWeight !== "" && form.targetWeight != null && Number.isFinite(Number(form.targetWeight)) },
  { ok: form.heartRate !== "" && form.heartRate != null && Number.isFinite(Number(form.heartRate)) },
  { ok: !!(form.goal && String(form.goal).trim()) },
  { ok: !!form.activityLevel },
  { ok: form.preferredWorkoutTypes.length > 0 },
  { ok: !!(form.preferredDietFocus && String(form.preferredDietFocus).trim()) },
  { ok: !!(form.avatar && String(form.avatar).trim()) },
]);

const profileCompletenessPercent = computed(() => {
  const list = completenessFields.value;
  const done = list.filter((x) => x.ok).length;
  return Math.round((done / list.length) * 100);
});

/** Sum workout counts in dashboard weekly series (last 7 days). */
const weeklyWorkoutsTotal = computed(() => {
  const rows = dashboardPayload.value?.charts?.weeklyWorkout;
  if (!Array.isArray(rows)) return null;
  return rows.reduce((acc, r) => acc + (Number(r.value) || 0), 0);
});

/** Sum calories out from dashboard caloriesInVsOut for the week. */
const weeklyCaloriesBurned = computed(() => {
  const rows = dashboardPayload.value?.charts?.caloriesInVsOut;
  if (!Array.isArray(rows)) return null;
  return rows.reduce((acc, r) => acc + (Number(r.out) || 0), 0);
});

/**
 * Consecutive days with ≥1 workout, walking backward from today.
 * weeklyWorkout order: oldest → newest (last item = today per backend loop).
 */
const workoutStreak = computed(() => {
  const rows = dashboardPayload.value?.charts?.weeklyWorkout;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if ((Number(rows[i].value) || 0) > 0) streak += 1;
    else break;
  }
  return streak;
});

/** Parsed body numbers: only positive finite values count (empty target allowed). */
const parsedWeightKg = computed(() => {
  const w = Number(form.weight);
  return Number.isFinite(w) && w > 0 ? w : null;
});

const parsedTargetWeightKg = computed(() => {
  if (form.targetWeight === "" || form.targetWeight == null) return null;
  const t = Number(form.targetWeight);
  return Number.isFinite(t) && t > 0 ? t : null;
});

/**
 * Full “target weight” goal module for the dedicated card (live from form; safe, no NaN).
 * Progress %: closeness using span = max(current, target) — simple, bounded 0–100.
 */
const weightGoalModule = computed(() => {
  const w = parsedWeightKg.value;
  const t = parsedTargetWeightKg.value;

  if (t == null) {
    return {
      mode: "no_target",
      statusTag: "No target weight set",
      headline: "Set a target weight to track your progress",
      distanceLine: "",
      percent: null,
      barPercent: 0,
      encouragement: "Set a target weight to start tracking your progress.",
    };
  }

  if (w == null) {
    return {
      mode: "no_weight",
      statusTag: "Target set",
      headline: `Target: ${t.toFixed(1)} kg`,
      distanceLine: "Enter your current weight to see how many kg remain until your goal.",
      percent: null,
      barPercent: 0,
      encouragement: "Add your current weight in Body Metrics — we’ll show your progress here.",
    };
  }

  const dist = Math.abs(w - t);
  const distRounded = Math.round(dist * 10) / 10;
  const span = Math.max(w, t, 1);
  let pct = Math.round(Math.max(0, Math.min(100, (1 - dist / span) * 100)));
  if (dist < 0.5) pct = 100;

  let distanceLine = "";
  if (dist < 0.5) {
    distanceLine = "You are at your target weight.";
  } else {
    distanceLine = `${distRounded} kg away from your goal`;
  }

  let encouragement = "Keep going, every step counts.";
  if (dist < 0.5) encouragement = "Great work — you’ve reached your target weight.";
  else if (dist <= 2) encouragement = "You are close to your goal.";
  else if (pct >= 65) encouragement = "You are making progress toward your goal.";

  return {
    mode: "ok",
    statusTag: "Target set",
    headline: `${w.toFixed(1)} kg → ${t.toFixed(1)} kg`,
    distanceLine,
    percent: pct,
    barPercent: pct,
    encouragement,
  };
});

function formatStat(value, fallback = "0") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/** Workout plan + today API for activity card (read-only). */
const primaryPlanSummary = computed(() => {
  const plans = activityPlans.value;
  if (!plans.length) {
    return { title: null, days: null, todayWorkoutTasks: 0, todayStatus: "" };
  }
  const p = plans[0];
  const today = activityToday.value;
  const tw = today?.workout_tasks;
  const todayWorkoutTasks = Array.isArray(tw) ? tw.length : 0;
  return {
    title: p.exercise_name || "Workout plan",
    days: p.days,
    todayWorkoutTasks,
    todayStatus: today?.status || "",
  };
});

const enrolledSummary = computed(() => {
  const rows = activityEnrolled.value.filter((e) => e && (e.status === "active" || e.status === "completed"));
  const titles = rows
    .map((r) => r.course_id?.title)
    .filter(Boolean)
    .slice(0, 3);
  return { count: rows.length, titles };
});

const dietSummaryLine = computed(() => {
  const d = activityDiets.value[0];
  if (!d) return null;
  const kcal = d.calories != null ? `${d.calories} kcal` : "";
  const meal = d.mealType ? ` · ${d.mealType}` : "";
  return `${d.foodName || "Meal"}${kcal ? ` · ${kcal}` : ""}${meal}`;
});

const totalWorkoutsEver = computed(() => Number(dashboardPayload.value?.summary?.totalWorkouts) || 0);
const streakForMilestones = computed(() => workoutStreak.value ?? 0);

const milestones = computed(() => [
  { id: "m1", label: "First Workout Completed", done: totalWorkoutsEver.value > 0, icon: "💪" },
  { id: "m2", label: "3-Day Streak", done: streakForMilestones.value >= 3, icon: "🔥" },
  { id: "m3", label: "7-Day Streak", done: streakForMilestones.value >= 7, icon: "⭐" },
  { id: "m4", label: "First Course Joined", done: enrolledSummary.value.count > 0, icon: "📚" },
  { id: "m5", label: "Diet Tracking Started", done: activityDiets.value.length > 0, icon: "🥗" },
]);

async function loadActivitySummary(userId) {
  if (!userId) return;
  try {
    const [plansRes, todayRes, enrolledRes, dietsRes] = await Promise.all([
      api.get("/workouts/plan").catch(() => ({ data: [] })),
      api.get("/workouts/today").catch(() => ({ data: null })),
      api.get("/courses/enrolled").catch(() => ({ data: [] })),
      api.get(`/diets/${userId}`).catch(() => ({ data: [] })),
    ]);
    activityPlans.value = Array.isArray(plansRes.data) ? plansRes.data : [];
    activityToday.value = todayRes.data || null;
    activityEnrolled.value = Array.isArray(enrolledRes.data) ? enrolledRes.data : [];
    activityDiets.value = Array.isArray(dietsRes.data) ? dietsRes.data : [];
  } catch {
    activityPlans.value = [];
    activityToday.value = null;
    activityEnrolled.value = [];
    activityDiets.value = [];
  }
}

function validateProfileForm() {
  if (form.age !== "" && form.age != null) {
    const age = Number(form.age);
    if (!Number.isFinite(age) || age <= 0) return "Age must be a positive number.";
  }
  if (form.height !== "" && form.height != null) {
    const h = Number(form.height);
    if (!Number.isFinite(h) || h <= 0) return "Height must be a positive number.";
  }
  if (form.weight !== "" && form.weight != null) {
    const w = Number(form.weight);
    if (!Number.isFinite(w) || w <= 0) return "Weight must be a positive number.";
  }
  if (form.targetWeight !== "" && form.targetWeight != null) {
    const t = Number(form.targetWeight);
    if (!Number.isFinite(t) || t <= 0) return "Target weight must be positive, or leave empty.";
  }
  if (form.heartRate !== "" && form.heartRate != null) {
    const hr = Number(form.heartRate);
    if (!Number.isFinite(hr) || hr <= 0) return "Heart rate must be positive, or leave empty.";
  }
  return "";
}

function showToast(msg) {
  toastMessage.value = msg;
  toastVisible.value = true;
  window.setTimeout(() => {
    toastVisible.value = false;
  }, 3200);
}

async function loadProfile() {
  const { data } = await api.get("/user/profile");
  profile.value = data;
  fillForm(data);
}

async function loadDashboardOptional() {
  try {
    const { data } = await api.get("/dashboard");
    dashboardPayload.value = data;
  } catch {
    dashboardPayload.value = null;
  }
}

async function load() {
  state.error = "";
  loading.value = true;
  try {
    await loadProfile();
    await Promise.all([loadDashboardOptional(), loadActivitySummary(profile.value?.id)]);
  } catch (error) {
    state.error = error?.response?.data?.message || "Failed to load profile.";
  } finally {
    loading.value = false;
  }
}

async function save() {
  state.error = "";
  state.success = "";
  const validationError = validateProfileForm();
  if (validationError) {
    state.error = validationError;
    return;
  }
  saving.value = true;
  try {
    const { data } = await api.put("/user/profile", {
      username: form.username,
      gender: form.gender,
      age: form.age === "" ? undefined : Number(form.age),
      height: form.height === "" ? undefined : Number(form.height),
      weight: form.weight === "" ? undefined : Number(form.weight),
      targetWeight: form.targetWeight === "" ? undefined : Number(form.targetWeight),
      heartRate: form.heartRate === "" ? undefined : Number(form.heartRate),
      goal: form.goal,
      activityLevel: form.activityLevel,
      preferredWorkoutTypes: [...form.preferredWorkoutTypes],
      preferredDietFocus: form.preferredDietFocus || undefined,
      avatar: form.avatar || undefined,
    });
    profile.value = data;
    fillForm(data);
    bmiStore.clearSession();
    state.success = "Profile saved successfully.";
    showToast("Profile saved successfully.");
    await Promise.all([loadDashboardOptional(), loadActivitySummary(profile.value?.id)]);
  } catch (error) {
    state.error = error?.response?.data?.message || "Failed to update profile.";
  } finally {
    saving.value = false;
  }
}

watch(
  () => [form.height, form.weight],
  () => {
    bmiStore.clearSession();
  }
);

watch(
  () => form.avatar,
  () => {
    avatarBroken.value = false;
  }
);

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="profile-page page profile-shell">
    <h2 class="title page-heading">👤 Profile</h2>

    <p v-if="loading" class="loading-line">Loading your health center…</p>
    <p v-else-if="state.error && !profile" class="error-banner">{{ state.error }}</p>

    <template v-else-if="profile">
      <div class="profile-inner">
      <!-- 1) Top user overview -->
      <section class="overview-card">
        <div class="overview-left">
          <div class="avatar-wrap">
            <img
              v-if="avatarSrc && !avatarBroken"
              :src="avatarSrc"
              alt=""
              class="avatar-img"
              @error="avatarBroken = true"
            />
            <div v-else class="avatar-fallback">{{ (displayUsername || "?").slice(0, 1).toUpperCase() }}</div>
          </div>
        </div>
        <div class="overview-mid">
          <h3 class="username-line">{{ displayUsername }}</h3>
          <p class="email-line">{{ displayEmail }}</p>
          <p class="welcome">Welcome back — <span class="welcome-name">keep going toward your health goal.</span></p>
          <p class="sub-welcome">Small steps each day make a real difference.</p>
        </div>
        <div class="overview-right">
          <div class="tag-row">
            <span class="pill pill-goal">🎯 {{ goalTagText }}</span>
            <span class="pill pill-activity">⚡ {{ activityTagText }}</span>
          </div>
          <div class="complete-block">
            <div class="complete-head">
              <span>Profile completeness</span>
              <span class="complete-pct">{{ profileCompletenessPercent }}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: profileCompletenessPercent + '%' }" />
            </div>
          </div>
        </div>
      </section>

      <!-- 2) Health summary stats -->
      <section class="stats-section">
        <h3 class="section-title">Health snapshot</h3>
        <div class="stats-grid">
          <article class="stat-card">
            <span class="stat-icon">📈</span>
            <h4>Current BMI</h4>
            <p class="stat-value">{{ liveBmiDisplay }}</p>
            <p class="stat-hint">Live from height &amp; weight</p>
          </article>
          <article class="stat-card">
            <span class="stat-icon">🏷️</span>
            <h4>BMI status</h4>
            <p class="stat-value">
              <span class="badge" :data-cat="liveBmiCategory.key">{{ liveBmiCategory.label }}</span>
            </p>
            <p class="stat-hint">WHO-style bands</p>
          </article>
          <article class="stat-card">
            <span class="stat-icon">⚖️</span>
            <h4>Current weight</h4>
            <p class="stat-value">{{ form.weight !== '' && form.weight != null ? `${form.weight} kg` : '—' }}</p>
            <p class="stat-hint">As in your profile</p>
          </article>
          <article class="stat-card">
            <span class="stat-icon">🎯</span>
            <h4>Target weight</h4>
            <p class="stat-value">
              {{ form.targetWeight !== '' && form.targetWeight != null ? `${form.targetWeight} kg` : 'Not set' }}
            </p>
            <p class="stat-hint">Your goal weight</p>
          </article>
          <article class="stat-card">
            <span class="stat-icon">🔥</span>
            <h4>Workout streak</h4>
            <p class="stat-value">{{ formatStat(workoutStreak, '0') }}</p>
            <p class="stat-hint">Consecutive days (from recent data)</p>
          </article>
          <article class="stat-card">
            <span class="stat-icon">📅</span>
            <h4>Weekly workouts</h4>
            <p class="stat-value">{{ weeklyWorkoutsTotal != null ? weeklyWorkoutsTotal : '—' }}</p>
            <p class="stat-hint">{{ weeklyWorkoutsTotal != null ? 'Sessions (7 days)' : 'No dashboard data' }}</p>
          </article>
          <article class="stat-card">
            <span class="stat-icon">🔥</span>
            <h4>Weekly calories burned</h4>
            <p class="stat-value">
              {{ weeklyCaloriesBurned != null ? `${weeklyCaloriesBurned} kcal` : '—' }}
            </p>
            <p class="stat-hint">{{ weeklyCaloriesBurned != null ? 'From logged workouts' : 'No dashboard data' }}</p>
          </article>
        </div>
        <p class="bmi-note">{{ bmiExplanation(liveBmiCategory.key) }}</p>
      </section>

      <!-- Goal weight progress (dedicated module; syncs live with Body Metrics fields) -->
      <section class="panel goal-weight-card" aria-labelledby="goal-weight-heading">
        <div class="goal-weight-head">
          <div>
            <h3 id="goal-weight-heading" class="section-title goal-weight-title">Target weight progress</h3>
            <p class="section-sub">Track how close you are to your goal — updates as you edit weight below.</p>
          </div>
          <span class="goal-status-pill" :data-mode="weightGoalModule.mode">{{ weightGoalModule.statusTag }}</span>
        </div>

        <p class="goal-headline">{{ weightGoalModule.headline }}</p>

        <template v-if="weightGoalModule.mode === 'ok'">
          <div class="goal-bar-row">
            <div class="goal-bar-track">
              <div class="goal-bar-fill" :style="{ width: weightGoalModule.barPercent + '%' }" />
            </div>
            <span class="goal-pct">{{ weightGoalModule.percent }}%</span>
          </div>
        </template>
        <div v-else class="goal-bar-placeholder">
          <div class="goal-bar-track muted-track">
            <div class="goal-bar-fill ghost" :style="{ width: '0%' }" />
          </div>
        </div>

        <p v-if="weightGoalModule.distanceLine" class="goal-distance">{{ weightGoalModule.distanceLine }}</p>
        <p class="goal-encourage">{{ weightGoalModule.encouragement }}</p>
      </section>

      <!-- My Activity Summary (read-only + navigation) -->
      <section class="panel activity-summary-card" aria-labelledby="activity-summary-title">
        <h3 id="activity-summary-title" class="section-title">My Activity Summary</h3>
        <p class="section-sub">Quick links to your plans and logs — read only here.</p>
        <div class="activity-summary-grid">
          <article class="activity-tile">
            <h4>Current workout plan</h4>
            <template v-if="primaryPlanSummary.title">
              <p class="activity-primary">{{ primaryPlanSummary.title }}</p>
              <p class="activity-meta">
                {{ primaryPlanSummary.days ? `${primaryPlanSummary.days}-day plan` : "Plan" }}
                <span v-if="primaryPlanSummary.todayWorkoutTasks"> · {{ primaryPlanSummary.todayWorkoutTasks }} task(s) today</span>
              </p>
              <p v-if="primaryPlanSummary.todayStatus" class="activity-status">{{ primaryPlanSummary.todayStatus }}</p>
            </template>
            <p v-else class="activity-empty">No workout plan yet</p>
            <button type="button" class="link-btn" @click="router.push('/workout')">Go to Workout</button>
          </article>
          <article class="activity-tile">
            <h4>Enrolled courses</h4>
            <p v-if="enrolledSummary.count" class="activity-primary">{{ enrolledSummary.count }} enrolled</p>
            <ul v-if="enrolledSummary.titles.length" class="activity-list">
              <li v-for="(t, i) in enrolledSummary.titles" :key="i">{{ t }}</li>
            </ul>
            <p v-else class="activity-empty">No enrolled courses yet</p>
            <button type="button" class="link-btn" @click="router.push('/courses')">Go to Courses</button>
          </article>
          <article class="activity-tile">
            <h4>Diet summary</h4>
            <p v-if="dietSummaryLine" class="activity-primary">Latest log</p>
            <p v-if="dietSummaryLine" class="activity-meta">{{ dietSummaryLine }}</p>
            <p v-else class="activity-empty">No diet records yet</p>
            <button type="button" class="link-btn" @click="router.push('/diet')">Go to Diet</button>
          </article>
        </div>
      </section>

      <!-- Achievements / milestones -->
      <section class="panel milestones-card" aria-labelledby="milestones-title">
        <h3 id="milestones-title" class="section-title">Achievements &amp; milestones</h3>
        <p class="section-sub">Unlock badges as you use the app — based on your logged data.</p>
        <div class="milestone-grid">
          <div
            v-for="m in milestones"
            :key="m.id"
            class="milestone-chip"
            :data-done="m.done"
          >
            <span class="milestone-icon" aria-hidden="true">{{ m.icon }}</span>
            <span class="milestone-label">{{ m.label }}</span>
          </div>
        </div>
      </section>

      <form class="form-stack profile-form" novalidate @submit.prevent="save">
        <div class="form-two-col">
          <section class="panel form-card">
            <h3 class="section-title">Basic Information</h3>
            <p class="section-sub">Manage your personal account details.</p>
            <div class="avatar-inline-row">
              <div class="avatar-preview-sm">
                <img
                  v-if="avatarSrc && !avatarBroken"
                  :src="avatarSrc"
                  alt=""
                  class="avatar-preview-img"
                  @error="avatarBroken = true"
                />
                <div v-else class="avatar-preview-fallback">{{ (displayUsername || "?").slice(0, 1).toUpperCase() }}</div>
              </div>
              <p class="avatar-preview-caption">Live preview</p>
            </div>
            <div class="field-grid">
              <label class="field">
                <span class="field-label">Username</span>
                <input v-model="form.username" type="text" autocomplete="username" />
              </label>
              <label class="field">
                <span class="field-label">Email</span>
                <input :value="displayEmail" type="email" class="input-readonly" readonly tabindex="-1" aria-readonly="true" />
                <span class="field-hint">Read only — email cannot be changed here.</span>
              </label>
              <label class="field">
                <span class="field-label">Gender</span>
                <select v-model="form.gender">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">Age</span>
                <input v-model="form.age" type="number" min="1" max="130" step="1" placeholder="e.g. 28" />
              </label>
              <label class="field field-span-2">
                <span class="field-label">Avatar URL</span>
                <input v-model="form.avatar" type="url" autocomplete="off" placeholder="https://…" />
                <span class="field-hint">Updates header and preview as you type. Invalid images fall back to initials.</span>
              </label>
            </div>
          </section>

          <section class="panel form-card">
            <h3 class="section-title">Body Metrics</h3>
            <p class="section-sub">Physical indicators — ties into BMI and target weight progress above.</p>
            <div class="field-grid">
              <label class="field">
                <span class="field-label">Height (cm)</span>
                <input v-model="form.height" type="number" min="1" step="0.1" placeholder="e.g. 170" />
              </label>
              <label class="field">
                <span class="field-label">Weight (kg)</span>
                <input v-model="form.weight" type="number" min="0.1" step="0.1" placeholder="e.g. 68" />
              </label>
              <label class="field">
                <span class="field-label">Target weight (kg)</span>
                <input v-model="form.targetWeight" type="number" min="0.1" step="0.1" placeholder="Optional goal" />
              </label>
              <label class="field">
                <span class="field-label">Heart rate (bpm)</span>
                <input v-model="form.heartRate" type="number" min="1" max="260" step="1" placeholder="Optional" />
              </label>
            </div>
          </section>
        </div>

        <section class="panel form-card health-goals-card">
          <h3 class="section-title">Health Goals &amp; Preferences</h3>
          <p class="section-sub">Customize your health goals and lifestyle preferences.</p>

          <div class="hg-block">
            <span class="hg-label">Primary goal</span>
            <div class="goal-option-grid">
              <label
                v-for="g in PRIMARY_GOAL_VALUES"
                :key="g"
                class="goal-option"
                :class="{ active: form.goal === g }"
              >
                <input v-model="form.goal" type="radio" name="primaryGoal" :value="g" class="sr-only" />
                {{ g }}
              </label>
            </div>
            <p v-if="hasLegacyCustomGoal" class="legacy-goal-note">
              Saved custom goal: <strong>{{ form.goal }}</strong> — pick a preset above to replace, or keep and save.
            </p>
          </div>

          <div class="hg-block">
            <span class="hg-label">Activity level</span>
            <div class="segment-row" role="group" aria-label="Activity level">
              <button
                v-for="key in ['light', 'moderate', 'active']"
                :key="key"
                type="button"
                class="segment-btn"
                :class="{ on: form.activityLevel === key }"
                @click="form.activityLevel = key"
              >
                {{ ACTIVITY_UI_LABELS[key] }}
              </button>
            </div>
          </div>

          <div class="hg-block">
            <span class="hg-label">Preferred workout types</span>
            <p class="field-hint">Select all that apply.</p>
            <div class="pill-multi">
              <button
                v-for="t in WORKOUT_TYPE_OPTIONS"
                :key="t"
                type="button"
                class="type-pill"
                :class="{ on: isWorkoutTypeSelected(t) }"
                @click="togglePreferredWorkoutType(t)"
              >
                {{ t }}
              </button>
            </div>
          </div>

          <div class="hg-block">
            <span class="hg-label">Preferred diet focus</span>
            <div class="diet-focus-row">
              <label
                v-for="d in DIET_FOCUS_OPTIONS"
                :key="d"
                class="diet-focus-opt"
                :class="{ active: form.preferredDietFocus === d }"
              >
                <input v-model="form.preferredDietFocus" type="radio" name="dietFocus" :value="d" class="sr-only" />
                {{ d }}
              </label>
            </div>
          </div>
        </section>

        <div class="save-row panel save-panel">
          <button type="submit" class="save-btn" :disabled="saving">
            {{ saving ? "Saving…" : "Save Profile" }}
          </button>
        </div>
      </form>

      <p v-if="state.success" class="success success-inline">{{ state.success }}</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
      </div>

      <Transition name="toast-fade">
        <div v-if="toastVisible" class="toast-snack" role="status">{{ toastMessage }}</div>
      </Transition>
    </template>
  </main>
</template>

<style scoped>
.profile-page {
  padding-bottom: 48px;
}

.profile-shell {
  max-width: 1120px;
  margin: 0 auto;
  overflow-x: hidden;
}

.profile-inner {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.page-heading {
  margin-bottom: 20px;
}

.loading-line {
  color: var(--c5, #316879);
  font-size: 15px;
}

.error-banner {
  color: #b42318;
  background: #fdecec;
  border: 1px solid #f5c2c0;
  border-radius: 12px;
  padding: 12px 16px;
}

/* Overview */
.overview-card {
  display: grid;
  grid-template-columns: auto 1fr minmax(200px, 280px);
  gap: 20px;
  align-items: center;
  padding: 22px 24px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(167, 242, 173, 0.35) 0%, rgba(255, 255, 255, 0.95) 45%, rgba(221, 239, 242, 0.9) 100%);
  border: 1px solid rgba(52, 139, 147, 0.25);
  box-shadow: 0 12px 28px rgba(47, 72, 88, 0.08);
  margin-bottom: 22px;
}

.avatar-wrap {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 4px 14px rgba(49, 104, 121, 0.2);
  background: #fff;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  color: var(--c6, #2f4858);
  background: linear-gradient(145deg, var(--c2, #70d1ac), var(--c4, #348b93));
}

.overview-mid .welcome {
  margin: 0 0 4px;
  font-size: 15px;
  color: var(--c5, #316879);
}

.welcome-name {
  font-weight: 700;
  color: var(--c6, #2f4858);
}

.sub-welcome {
  margin: 0 0 12px;
  font-size: 13px;
  color: #486170;
  line-height: 1.45;
}

.username-line {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: var(--c6, #2f4858);
  letter-spacing: -0.02em;
}

.email-line {
  margin: 0;
  font-size: 14px;
  color: #5a6f7a;
}

.overview-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(47, 72, 88, 0.12);
}

.pill-goal {
  background: rgba(255, 255, 255, 0.85);
  color: var(--c6, #2f4858);
}

.pill-activity {
  background: rgba(72, 174, 164, 0.2);
  color: var(--c5, #316879);
}

.complete-block {
  background: rgba(255, 255, 255, 0.75);
  border-radius: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(52, 139, 147, 0.2);
}

.complete-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--c6, #2f4858);
  margin-bottom: 8px;
}

.complete-pct {
  color: var(--c4, #348b93);
}

.progress-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(49, 104, 121, 0.12);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--c3, #48aea4), var(--c5, #316879));
  transition: width 0.25s ease;
}

/* Stats */
.stats-section {
  margin-bottom: 22px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 17px;
  color: var(--c6, #2f4858);
  font-weight: 700;
}

.section-sub {
  margin: -6px 0 0;
  font-size: 13px;
  color: #5a6f7a;
  line-height: 1.45;
}

/* Target weight goal module */
.goal-weight-card {
  margin-bottom: 22px;
}

.goal-weight-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.goal-weight-title {
  margin-bottom: 4px;
}

.goal-status-pill {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(52, 139, 147, 0.35);
  background: rgba(167, 242, 173, 0.35);
  color: var(--c6, #2f4858);
}

.goal-status-pill[data-mode="no_target"] {
  background: rgba(240, 248, 246, 0.9);
  border-color: rgba(49, 104, 121, 0.2);
  color: #5a6f7a;
}

.goal-status-pill[data-mode="no_weight"] {
  background: rgba(72, 174, 164, 0.2);
}

.goal-headline {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 600;
  color: var(--c6, #2f4858);
}

.goal-bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.goal-bar-track {
  flex: 1;
  height: 12px;
  border-radius: 999px;
  background: rgba(49, 104, 121, 0.12);
  overflow: hidden;
}

.goal-bar-track.muted-track {
  opacity: 0.65;
}

.goal-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--c2, #70d1ac), var(--c4, #348b93));
  transition: width 0.3s ease;
}

.goal-bar-fill.ghost {
  opacity: 0.35;
}

.goal-pct {
  font-size: 14px;
  font-weight: 800;
  color: var(--c5, #316879);
  min-width: 3rem;
  text-align: right;
}

.goal-bar-placeholder {
  margin-bottom: 12px;
}

.goal-distance {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--c6, #2f4858);
}

.goal-encourage {
  margin: 0;
  font-size: 13px;
  color: #486170;
  line-height: 1.5;
  padding: 10px 12px;
  background: rgba(167, 242, 173, 0.2);
  border-radius: 10px;
  border: 1px solid rgba(52, 139, 147, 0.15);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .overview-card {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .overview-left {
    justify-self: center;
  }
  .tag-row {
    justify-content: center;
  }
  .overview-right {
    align-items: stretch;
  }
}

.stat-card {
  background: #fff;
  border: 1px solid #d9e9e6;
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 6px 18px rgba(47, 72, 88, 0.06);
}

.stat-icon {
  font-size: 18px;
  display: block;
  margin-bottom: 6px;
}

.stat-card h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #5a6f7a;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--c6, #2f4858);
}

.muted-value {
  font-size: 15px;
  font-weight: 600;
  color: #6b7c86;
}

.stat-hint {
  margin: 0;
  font-size: 11px;
  color: #7a8d96;
  line-height: 1.35;
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  background: rgba(72, 174, 164, 0.18);
  color: var(--c6, #2f4858);
}

.badge[data-cat="under"] {
  background: rgba(100, 180, 255, 0.2);
}
.badge[data-cat="normal"] {
  background: rgba(167, 242, 173, 0.45);
}
.badge[data-cat="over"] {
  background: rgba(255, 200, 120, 0.35);
}
.badge[data-cat="obese"] {
  background: rgba(255, 150, 130, 0.3);
}
.badge[data-cat="none"] {
  background: rgba(120, 130, 140, 0.15);
  color: #5a6f7a;
}

.mini-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(49, 104, 121, 0.1);
  overflow: hidden;
  margin: 6px 0 4px;
}

.mini-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--c2, #70d1ac), var(--c4, #348b93));
}

.bmi-note {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--c5, #316879);
  line-height: 1.5;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  border: 1px solid rgba(52, 139, 147, 0.18);
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-card .section-title {
  margin-bottom: 4px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 20px;
  margin-top: 14px;
}

@media (max-width: 640px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.field-span-2 {
  grid-column: 1 / -1;
}

.field-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--c5, #316879);
  letter-spacing: 0.02em;
}

.field-hint {
  font-size: 11px;
  color: #7a8d96;
  line-height: 1.35;
}

.input-readonly {
  background: #eef6f4 !important;
  color: #5a6f7a !important;
  cursor: not-allowed;
  border-color: #c8dbd7 !important;
}

.save-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.save-btn {
  min-width: 160px;
}

.success {
  color: #117a52;
  margin-top: 10px;
}

.success-inline {
  text-align: center;
  padding: 8px;
}

.error {
  color: #b42318;
  margin-top: 10px;
}

/* Activity summary */
.activity-summary-card {
  margin-bottom: 22px;
}

.activity-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 12px;
}

@media (max-width: 900px) {
  .activity-summary-grid {
    grid-template-columns: 1fr;
  }
}

.activity-tile {
  background: linear-gradient(180deg, #fbfffc 0%, #fff 100%);
  border: 1px solid #d9e9e6;
  border-radius: 14px;
  padding: 14px 16px;
  min-height: 160px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-tile h4 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--c5, #316879);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.activity-primary {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--c6, #2f4858);
}

.activity-meta {
  margin: 0;
  font-size: 12px;
  color: #5a6f7a;
  line-height: 1.4;
  flex: 1;
}

.activity-status {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--c4, #348b93);
}

.activity-empty {
  margin: 0;
  flex: 1;
  font-size: 13px;
  color: #7a8d96;
}

.activity-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #486170;
}

.link-btn {
  align-self: flex-start;
  margin-top: 8px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(52, 139, 147, 0.45);
  background: rgba(255, 255, 255, 0.9);
  color: var(--c5, #316879);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.link-btn:hover {
  background: rgba(167, 242, 173, 0.35);
}

/* Milestones */
.milestones-card {
  margin-bottom: 22px;
}

.milestone-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.milestone-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #dde8e5;
  background: #f4f8f6;
  color: #7a8d96;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.milestone-chip[data-done="true"] {
  border-color: rgba(212, 175, 55, 0.45);
  background: linear-gradient(135deg, rgba(167, 242, 173, 0.55), rgba(255, 255, 255, 0.95));
  color: var(--c6, #2f4858);
  box-shadow: 0 4px 12px rgba(47, 72, 88, 0.06);
}

.milestone-icon {
  font-size: 16px;
}

/* Form two-column */
.form-two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

@media (max-width: 900px) {
  .form-two-col {
    grid-template-columns: 1fr;
  }
}

.health-goals-card {
  margin-top: 0;
}

.hg-block {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e8f0ee;
}

.hg-block:first-of-type {
  margin-top: 8px;
  padding-top: 0;
  border-top: none;
}

.hg-label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--c6, #2f4858);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.goal-option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.goal-option {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #c8dbd7;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: var(--c5, #316879);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.goal-option.active {
  border-color: var(--c4, #348b93);
  background: rgba(72, 174, 164, 0.18);
  color: var(--c6, #2f4858);
}

.legacy-goal-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: #6b7c86;
}

.segment-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.segment-btn {
  flex: 1;
  min-width: 100px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #c8dbd7;
  background: #fff;
  font-size: 14px;
  font-weight: 600;
  color: #5a6f7a;
  cursor: pointer;
  transition: all 0.2s;
}

.segment-btn.on {
  border-color: var(--c4, #348b93);
  background: linear-gradient(90deg, rgba(112, 209, 172, 0.35), rgba(72, 174, 164, 0.25));
  color: var(--c6, #2f4858);
  box-shadow: 0 2px 8px rgba(49, 104, 121, 0.12);
}

.pill-multi {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.type-pill {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(52, 139, 147, 0.35);
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  color: var(--c5, #316879);
  cursor: pointer;
}

.type-pill.on {
  background: linear-gradient(90deg, var(--c3, #48aea4), var(--c4, #348b93));
  color: #fff;
  border-color: transparent;
}

.diet-focus-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.diet-focus-opt {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #c8dbd7;
  font-size: 12px;
  font-weight: 600;
  color: #5a6f7a;
  cursor: pointer;
}

.diet-focus-opt.active {
  border-color: var(--c4, #348b93);
  background: rgba(167, 242, 173, 0.35);
  color: var(--c6, #2f4858);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Avatar preview (Basic Information) */
.avatar-inline-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
  padding: 12px;
  background: rgba(167, 242, 173, 0.15);
  border-radius: 14px;
  border: 1px solid rgba(52, 139, 147, 0.2);
}

.avatar-preview-sm {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid #fff;
  box-shadow: 0 4px 12px rgba(47, 72, 88, 0.12);
  background: #fff;
}

.avatar-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-preview-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: var(--c6, #2f4858);
  background: linear-gradient(145deg, var(--c2, #70d1ac), var(--c4, #348b93));
}

.avatar-preview-caption {
  margin: 0;
  font-size: 12px;
  color: #5a6f7a;
  font-weight: 600;
}

.save-panel {
  display: flex;
  justify-content: flex-end;
  padding: 16px 18px;
  margin-top: 0;
  border: 1px solid #d7e7e6;
  box-shadow: 0 8px 20px rgba(47, 72, 88, 0.06);
}

/* Toast */
.toast-snack {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 12px 22px;
  border-radius: 12px;
  background: var(--c6, #2f4858);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 10px 28px rgba(47, 72, 88, 0.25);
  max-width: 90vw;
  text-align: center;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
