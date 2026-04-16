<script setup>
import { computed, onActivated, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { calculateBmiValue } from "../utils/bmi";

const loading = ref(true);
const route = useRoute();
const dashboardPayload = ref(null);
const profile = ref(null);
const me = ref(null);
const todayWorkout = ref(null);
const todayDietRecords = ref([]);
const todayDietOverview = ref(null);
const allSchedules = ref([]);
const enrolledCourses = ref([]);
const weeklyWorkoutStats = ref([]);
const workoutPlans = ref([]);

const MET_MAP = {
  Running: 10,
  Cycling: 8,
  Swimming: 9,
  "Jump Rope": 11,
  Walking: 4,
  Walk: 4,
  HIIT: 10,
  "Weight Lifting": 6,
  "Push-up": 5,
  "Pull-up": 6,
  Squat: 6,
  Deadlift: 7,
  Yoga: 3,
  Stretching: 2,
  Pilates: 4,
  Basketball: 8,
  Football: 9,
  Badminton: 7,
  Tennis: 7,
};

function formatBMI(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function formatCalories(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0 kcal";
  return `${Math.round(n)} kcal`;
}

function formatWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0 kg";
  return `${n.toFixed(1)} kg`;
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0%";
  return `${n.toFixed(1)}%`;
}

function formatCount(value) {
  const n = Math.max(0, Math.round(asNumber(value)));
  return String(n);
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bmiStatus(bmi) {
  const v = asNumber(bmi);
  if (v <= 0) return "No data yet";
  if (v < 18.5) return "Underweight";
  if (v <= 24.9) return "Normal";
  if (v <= 29.9) return "Overweight";
  return "Obese";
}

function safeText(text, fallback = "No data yet") {
  const value = String(text ?? "").trim();
  return value || fallback;
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseActivityDate(value, fallbackDateKey = "") {
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (fallbackDateKey) {
    const d = new Date(`${fallbackDateKey}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function formatHHmm(value, fallback = "00:00") {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const plain = String(value);
  const hit = plain.match(/^\d{2}:\d{2}/);
  return hit ? hit[0] : fallback;
}

function recentDateKeys(days = 7) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(toDateKey(d));
  }
  return out;
}

const todayKey = computed(() => new Date().toISOString().slice(0, 10));
const charts = computed(() => dashboardPayload.value?.charts || {});
const todayWorkoutTasks = computed(() => {
  const rows = Array.isArray(todayWorkout.value?.workout_tasks) ? todayWorkout.value.workout_tasks : [];
  return rows;
});
const todayCourseTasks = computed(() => {
  const rows = Array.isArray(todayWorkout.value?.course_tasks) ? todayWorkout.value.course_tasks : [];
  return rows;
});

function getMetForExerciseName(name) {
  const direct = MET_MAP[name];
  if (direct) return direct;
  const lower = String(name || "").toLowerCase();
  const key = Object.keys(MET_MAP).find((k) => k.toLowerCase() === lower);
  return key ? MET_MAP[key] : 0;
}

function getTaskBurn(task) {
  const weight = asNumber(profile.value?.weight);
  if (weight <= 0) return 0;
  const exerciseName = String(task?.exercise_name || task?.exerciseName || task?.type || "").trim();
  const met = getMetForExerciseName(exerciseName);
  if (met <= 0) return 0;
  const duration = asNumber(task?.duration_per_day ?? task?.durationPerDay ?? task?.duration);
  return met * weight * (duration / 60);
}

function isCompletedTask(task) {
  return task?.is_completed === true || task?.completed === true || String(task?.status || "").toLowerCase() === "completed";
}

const totalWorkoutTasks = computed(() => todayWorkoutTasks.value.length);
const completedWorkoutTasks = computed(() => todayWorkoutTasks.value.filter((task) => isCompletedTask(task)).length);
const totalCourseTasks = computed(() => todayCourseTasks.value.length);
const completedCourseTasks = computed(() => todayCourseTasks.value.filter((task) => Boolean(task?.is_completed)).length);
const totalTodayTasks = computed(() => totalWorkoutTasks.value + totalCourseTasks.value);
const completedTodayTasks = computed(() => completedWorkoutTasks.value + completedCourseTasks.value);
const todayProgressPercent = computed(() => {
  if (totalTodayTasks.value <= 0) return 0;
  return (completedTodayTasks.value / totalTodayTasks.value) * 100;
});
const workoutBurnedSoFar = computed(() =>
  todayWorkoutTasks.value.reduce((sum, task) => (isCompletedTask(task) ? sum + getTaskBurn(task) : sum), 0)
);
const workoutProgressText = computed(() => `${formatCount(completedWorkoutTasks.value)} / ${formatCount(totalWorkoutTasks.value)}`);
const workoutProgressPercent = computed(() => {
  if (totalWorkoutTasks.value <= 0) return 0;
  return (completedWorkoutTasks.value / totalWorkoutTasks.value) * 100;
});

const bmiValue = computed(() => {
  const height = asNumber(profile.value?.height);
  const weight = asNumber(profile.value?.weight);
  if (height <= 0 || weight <= 0) return 0;
  return asNumber(calculateBmiValue(weight, height));
});

const summaryCards = computed(() => [
  {
    title: "Total Workouts",
    value: workoutProgressText.value,
    sub: "Completed / total tasks",
    progress: workoutProgressPercent.value,
  },
  {
    title: "Calories Burned",
    value: formatCalories(workoutBurnedSoFar.value),
    sub: "Burned today",
  },
  {
    title: "Calories Consumed",
    value: formatCalories(todayCaloriesConsumed.value),
    sub: "Today intake",
  },
  {
    title: "BMI",
    value: formatBMI(bmiValue.value),
    sub: bmiStatus(bmiValue.value),
  },
  {
    title: "Today’s Progress",
    value: formatPercent(todayProgressPercent.value),
    sub: `${formatCount(completedTodayTasks.value)} / ${formatCount(totalTodayTasks.value)} tasks completed`,
  },
]);

const weeklyWorkoutData = computed(() => {
  if (weeklyWorkoutStats.value.length) return weeklyWorkoutStats.value;
  const rows = Array.isArray(charts.value.weeklyWorkout) ? charts.value.weeklyWorkout : [];
  return rows.map((row) => ({
    day: safeText(row?.day, "--"),
    total: asNumber(row?.value),
    completed: asNumber(row?.value),
    rate: asNumber(row?.value) > 0 ? 100 : 0,
  }));
});

const caloriesInVsOut = computed(() => {
  const rows = Array.isArray(charts.value.caloriesInVsOut) ? charts.value.caloriesInVsOut : [];
  return rows.map((row) => ({
    day: safeText(row?.day, "--"),
    in: asNumber(row?.in),
    out: asNumber(row?.out),
  }));
});
const caloriesInVsOutData = computed(() => caloriesInVsOut.value);

const caloriesInVsOutMax = computed(() => Math.max(...caloriesInVsOut.value.flatMap((item) => [item.in, item.out]), 1));

const workoutRemaining = computed(() => totalWorkoutTasks.value - completedWorkoutTasks.value);
const workoutCompleted = computed(() => completedWorkoutTasks.value);

const todayScheduleItems = computed(() => {
  if (!Array.isArray(allSchedules.value)) return [];
  return allSchedules.value.filter((item) => String(item?.date || "") === todayKey.value);
});
const todayPendingScheduleItems = computed(() => todayScheduleItems.value.filter((item) => !item?.is_completed));

const schedulePending = computed(() => todayPendingScheduleItems.value.length);
const dietLoggedToday = computed(() => (Array.isArray(todayDietRecords.value) ? todayDietRecords.value.length : 0) > 0);
const todayCaloriesConsumed = computed(() => asNumber(todayDietOverview.value?.consumed?.calories));
const todayCaloriesBurned = computed(() => workoutBurnedSoFar.value);
const dietFocusText = computed(() =>
  todayCaloriesConsumed.value > 0 ? `${Math.round(todayCaloriesConsumed.value)} kcal today` : "No meals logged today"
);
const activeCourses = computed(() =>
  (Array.isArray(enrolledCourses.value) ? enrolledCourses.value : [])
    .filter((row) => row && (row.status === "active" || row.status === "in_progress"))
    .slice(0, 3)
);
const activeCoursesDisplay = computed(() => {
  const enrolledPlanRows = activeCourses.value.map((row) => {
    const totalDays = asNumber(row.duration_days || row.durationDays || row.course_id?.duration_days || row.course_id?.durationDays);
    const startDateRaw = row.start_date || row.startDate || row.enrolled_at || row.createdAt;
    const explicitCurrent = asNumber(row.current_day || row.currentDay);
    let currentDay = explicitCurrent;
    if (!currentDay && startDateRaw) {
      const startDate = new Date(startDateRaw);
      if (!Number.isNaN(startDate.getTime())) {
        const diff = Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1;
        currentDay = Math.max(1, diff);
      }
    }
    currentDay = Math.max(1, Math.round(currentDay || 1));
    if (totalDays > 0) {
      return {
        id: row._id || row.id || row.course_id?._id || row.course_id,
        title: row.course_id?.title || row.title || "Course",
        progress: `Day ${Math.min(currentDay, Math.round(totalDays))} / ${Math.round(totalDays)}`,
      };
    }
    return {
      id: row._id || row.id || row.course_id?._id || row.course_id,
      title: row.course_id?.title || row.title || "Course",
      progress: "In progress",
    };
  });
  const customRows = (Array.isArray(workoutPlans.value) ? workoutPlans.value : [])
    .map((row) => {
      const totalDays = asNumber(row.days);
      const startDateRaw = row.start_date || row.startDate || row.created_at || row.createdAt;
      const start = new Date(startDateRaw);
      const day = Number.isNaN(start.getTime()) ? 1 : Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
      if (totalDays > 0 && day > totalDays) return null;
      return {
        id: `wp-${row._id || row.id}`,
        title: safeText(row.exercise_name || row.exerciseName, "Custom Plan"),
        progress: totalDays > 0 ? `Day ${Math.min(day, Math.round(totalDays))} / ${Math.round(totalDays)}` : "In progress",
      };
    })
    .filter(Boolean)
    .slice(0, 2);
  return [...enrolledPlanRows, ...customRows].slice(0, 3);
});

const todaySummaryItems = computed(() => [
  `Tasks: ${formatCount(completedTodayTasks.value)} / ${formatCount(totalTodayTasks.value)} completed`,
  `Calories: ${Math.round(todayCaloriesConsumed.value)} in / ${Math.round(todayCaloriesBurned.value)} out`,
  `Schedule: ${formatCount(schedulePending.value)} pending`,
  `Courses: ${formatCount(activeCoursesDisplay.value.length)} active today`,
]);

const upcomingToday = computed(() => {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return todayPendingScheduleItems.value
    .map((item) => {
      const hh = Number(String(item?.time || "00:00").slice(0, 2));
      const mm = Number(String(item?.time || "00:00").slice(3, 5));
      const minutes = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
      return { ...item, minutes };
    })
    .filter((item) => item.minutes >= nowMinutes)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, 3);
});

const startTodayLink = computed(() => {
  if (workoutRemaining.value > 0) return "/workout";
  if (schedulePending.value > 0) return "/schedule";
  return "/workout";
});

const welcomeDynamic = computed(() => {
  if (schedulePending.value > 0) return `You have ${formatCount(schedulePending.value)} tasks planned today.`;
  if (bmiValue.value > 0) return `Your BMI is in the ${bmiStatus(bmiValue.value).toLowerCase()} range.`;
  if (todayCaloriesConsumed.value > 0) return `You consumed ${formatCalories(todayCaloriesConsumed.value)} today.`;
  return "Start logging your activity to build your real-time health story.";
});

const activityList = computed(() => {
  const workoutRows = todayWorkoutTasks.value
    .filter((task) => isCompletedTask(task))
    .map((task, index) => {
      const fallbackDate = todayKey.value;
      const fallbackTime = `${fallbackDate}T${String(Math.max(0, 23 - index)).padStart(2, "0")}:00:00`;
      const dt = parseActivityDate(task?.completedAt || task?.updatedAt || task?.createdAt, fallbackDate) || new Date(fallbackTime);
      return {
        type: "workout",
        title: safeText(task?.exercise_name || task?.exerciseName, "Workout"),
        value: Math.round(getTaskBurn(task)),
        time: dt.toISOString(),
      };
    });

  const dietRows = (Array.isArray(todayDietRecords.value) ? todayDietRecords.value : []).map((row, index) => {
    const dateKey = String(row?.date || todayKey.value).slice(0, 10);
    const fallbackTime = `${dateKey}T${String(Math.max(0, 14 - index)).padStart(2, "0")}:00:00`;
    const dt = parseActivityDate(row?.recordedAt || row?.createdAt, dateKey) || new Date(fallbackTime);
    return {
      type: "diet",
      title: safeText(row?.foodName, "Meal"),
      value: Math.round(asNumber(row?.calories)),
      time: dt.toISOString(),
    };
  });

  const scheduleRows = todayScheduleItems.value
    .map((row) => {
      const dateKey = String(row?.date || todayKey.value).slice(0, 10);
      const hhmm = String(row?.time || "00:00").slice(0, 5);
      const dt = parseActivityDate(`${dateKey}T${hhmm}:00`, dateKey) || new Date(`${dateKey}T00:00:00`);
      return {
        type: "schedule",
        title: safeText(row?.title, "Schedule"),
        value: null,
        time: dt.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 2);

  return [...dietRows.slice(0, 3), ...workoutRows.slice(0, 3), ...scheduleRows]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 8);
});

const groupedActivity = computed(() => {
  const today = toDateKey(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = toDateKey(y);

  const groups = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of activityList.value) {
    const d = parseActivityDate(item.time);
    const key = d ? toDateKey(d) : "";
    if (key === today) groups.Today.push(item);
    else if (key === yesterday) groups.Yesterday.push(item);
    else groups.Earlier.push(item);
  }
  return [
    { label: "Today", items: groups.Today },
    { label: "Yesterday", items: groups.Yesterday },
    { label: "Earlier", items: groups.Earlier },
  ].filter((group) => group.items.length > 0);
});

function activityIcon(type) {
  if (type === "workout") return "🏃";
  if (type === "diet") return "🥗";
  return "📅";
}

function activityText(item) {
  if (item.type === "workout") return `Workout: ${item.title} · ${item.value ?? 0} kcal burned`;
  if (item.type === "diet") return `Diet: ${item.title} · ${item.value ?? 0} kcal`;
  return `Schedule: ${item.title} · ${formatHHmm(item.time)}`;
}

function activityTime(item) {
  return formatHHmm(item.time);
}

function weeklyWorkoutHint(item) {
  if (!item.total) return `${item.day}: No workout tasks`;
  return `${item.day}: ${formatCount(item.completed)} completed out of ${formatCount(item.total)} tasks`;
}

function inOutLabel(item) {
  if (asNumber(item.in) === 0 && asNumber(item.out) === 0) return "—";
  return `${formatCalories(item.in)} / ${formatCalories(item.out)}`;
}

const smartInsights = computed(() => {
  const hints = [];
  if (!dietLoggedToday.value) hints.push("You haven’t logged any meals today.");
  if (workoutCompleted.value === 0) hints.push("You have not started a workout today.");
  if (todayCaloriesConsumed.value > todayCaloriesBurned.value && todayCaloriesConsumed.value > 0) {
    hints.push("Your calorie intake is currently higher than your burn.");
  }
  if (workoutRemaining.value > 0) hints.push(`You still have ${formatCount(workoutRemaining.value)} workouts remaining.`);
  if (upcomingToday.value.length > 0) hints.push(`You have ${formatCount(upcomingToday.value.length)} upcoming sessions today.`);
  if (bmiStatus(bmiValue.value) === "Normal") {
    hints.push("Your BMI is in the normal range.");
  }
  if (todayProgressPercent.value > 0 && todayProgressPercent.value < 50) {
    hints.push("You are behind today’s plan.");
  }
  const uniqueHints = [...new Set(hints)];
  if (uniqueHints.length >= 2) return uniqueHints.slice(0, 5);
  return [...uniqueHints, "Start logging your activity to receive insights."].slice(0, 5);
});

async function fetchDashboardData() {
  loading.value = true;
  try {
    const [dashboardRes, profileRes, meRes] = await Promise.all([
      api.get("/dashboard"),
      api.get("/user/profile"),
      api.get("/users/me"),
    ]);

    dashboardPayload.value = dashboardRes?.data || null;
    profile.value = profileRes?.data || null;
    me.value = meRes?.data || null;

    const userId = me.value?.id;
    if (!userId) {
      todayWorkout.value = null;
      todayDietRecords.value = [];
      todayDietOverview.value = null;
      allSchedules.value = [];
      return;
    }

    const [workoutRes, dietRes, dietOverviewRes, schedulesRes, coursesRes, workoutPlansRes] = await Promise.all([
      api.get("/workout/day", { params: { date: todayKey.value } }).catch(() => ({ data: null })),
      api.get(`/diets/${userId}`, { params: { date: todayKey.value } }).catch(() => ({ data: [] })),
      api.get(`/diets/${userId}/overview`, { params: { date: todayKey.value } }).catch(() => ({ data: null })),
      api.get(`/schedules/${userId}`).catch(() => ({ data: [] })),
      api.get("/courses/enrolled").catch(() => ({ data: [] })),
      api.get("/workout/plan").catch(() => ({ data: [] })),
    ]);

    todayWorkout.value = workoutRes?.data || null;
    todayDietRecords.value = Array.isArray(dietRes?.data) ? dietRes.data : [];
    todayDietOverview.value = dietOverviewRes?.data || null;
    allSchedules.value = Array.isArray(schedulesRes?.data) ? schedulesRes.data : [];
    enrolledCourses.value = Array.isArray(coursesRes?.data) ? coursesRes.data : [];
    workoutPlans.value = Array.isArray(workoutPlansRes?.data) ? workoutPlansRes.data : [];

    const keys = recentDateKeys(7);
    const dailyRows = await Promise.all(
      keys.map(async (dateKey) => {
        const resp = await api.get("/workout/day", { params: { date: dateKey } }).catch(() => ({ data: null }));
        const tasks = Array.isArray(resp?.data?.workout_tasks)
          ? resp.data.workout_tasks
          : Array.isArray(resp?.data?.tasks)
          ? resp.data.tasks
          : [];
        const total = tasks.length;
        const completed = tasks.filter((task) => isCompletedTask(task)).length;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const dateObj = new Date(`${dateKey}T00:00:00`);
        return {
          day: dateObj.toLocaleDateString("en-US", { weekday: "short" }),
          total,
          completed,
          rate,
        };
      })
    );
    weeklyWorkoutStats.value = dailyRows;
  } catch {
    dashboardPayload.value = null;
    profile.value = null;
    me.value = null;
    todayWorkout.value = null;
    todayDietRecords.value = [];
    todayDietOverview.value = null;
    allSchedules.value = [];
    enrolledCourses.value = [];
    workoutPlans.value = [];
    weeklyWorkoutStats.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(fetchDashboardData);
onActivated(fetchDashboardData);

watch(
  () => route.fullPath,
  (path) => {
    if (path === "/dashboard") fetchDashboardData();
  }
);
</script>

<template>
  <AppNavbar />
  <main class="dashboard-wrap">
    <section class="dashboard-shell">
      <header class="hero">
        <h1>Welcome back</h1>
        <p>Here is your real-time health progress overview</p>
        <p class="hero-summary">{{ welcomeDynamic }}</p>
      </header>

      <div v-if="loading" class="loading">Loading your healthy stats...</div>

      <template v-else>
        <section class="summary-grid">
          <article v-for="card in summaryCards" :key="card.title" class="summary-card">
            <h3>{{ card.title }}</h3>
            <p class="summary-value">{{ card.value }}</p>
            <p class="summary-sub">{{ card.sub }}</p>
            <div v-if="card.title === 'Total Workouts'" class="workout-progress-track">
              <div class="workout-progress-fill" :style="{ width: `${card.progress || 0}%` }"></div>
            </div>
          </article>
        </section>

        <section class="focus-panel panel">
          <div class="focus-head">
            <div>
              <h3>Today’s Focus</h3>
              <p>Action guide for your day</p>
            </div>
            <RouterLink :to="startTodayLink" class="focus-btn">Start Today</RouterLink>
          </div>
          <div class="focus-grid">
            <article class="focus-item">
              <strong>Workout</strong>
              <p>{{ formatCount(workoutRemaining) }} tasks remaining</p>
            </article>
            <article class="focus-item">
              <strong>Schedule</strong>
              <p>{{ formatCount(schedulePending) }} items pending</p>
            </article>
            <article class="focus-item">
              <strong>Diet</strong>
              <p>{{ dietFocusText }}</p>
            </article>
          </div>
        </section>

        <section class="panel summary-panel">
          <h3>Today Summary</h3>
          <ul class="summary-lines">
            <li v-for="line in todaySummaryItems" :key="line">{{ line }}</li>
          </ul>
        </section>

        <section class="bottom-grid">
          <article class="panel">
            <h3>Upcoming</h3>
            <ul v-if="upcomingToday.length" class="upcoming-list">
              <li v-for="item in upcomingToday" :key="`${item._id || item.title}-${item.time}`">
                <span class="upcoming-time">{{ String(item.time || "00:00").slice(0, 5) }}</span>
                <span>{{ item.title }}</span>
              </li>
            </ul>
            <p v-else class="empty-state">No upcoming sessions today</p>
          </article>

          <article class="panel">
            <h3>Active Plans</h3>
            <ul v-if="activeCoursesDisplay.length" class="upcoming-list">
              <li v-for="row in activeCoursesDisplay" :key="row.id">
                <span>{{ row.title }}</span>
                <span class="upcoming-time">{{ row.progress }}</span>
              </li>
            </ul>
            <p v-else class="empty-state">No active plans</p>
          </article>
        </section>

        <section class="charts-grid">
          <article class="panel">
            <h3>Weekly Activity</h3>
            <div v-if="weeklyWorkoutData.length" class="bar-chart">
              <div v-for="item in weeklyWorkoutData" :key="item.day" class="bar-item" :title="weeklyWorkoutHint(item)">
                <div class="bar-track">
                  <div class="bar-fill" :style="{ height: `${item.rate}%` }"></div>
                </div>
                <span>{{ item.day }}</span>
                <small>{{ formatCount(item.completed) }} / {{ formatCount(item.total) }}</small>
              </div>
            </div>
            <p v-else class="empty-state">No data yet</p>
          </article>

          <article class="panel">
            <h3>Calories In vs Out</h3>
            <div v-if="caloriesInVsOut.length" class="double-bar-chart">
              <div v-for="item in caloriesInVsOutData" :key="item.day" class="double-row">
                <span class="day-label">{{ item.day }}</span>
                <div class="double-bars">
                  <div class="in-bar" :style="{ width: `${(item.in / caloriesInVsOutMax) * 100}%` }"></div>
                  <div class="out-bar" :style="{ width: `${(item.out / caloriesInVsOutMax) * 100}%` }"></div>
                </div>
                <span class="double-values">{{ inOutLabel(item) }}</span>
              </div>
            </div>
            <p v-else class="empty-state">No data yet</p>
          </article>
        </section>

        <section class="bottom-grid">
          <article class="panel">
            <h3>Recent Activity</h3>
            <div v-if="groupedActivity.length" class="activity-timeline">
              <section v-for="group in groupedActivity" :key="group.label" class="activity-group">
                <h4>{{ group.label }}</h4>
                <ul>
                  <li v-for="item in group.items" :key="`${item.type}-${item.title}-${item.time}`" class="activity-row">
                    <span class="activity-icon">{{ activityIcon(item.type) }}</span>
                    <span class="activity-text">{{ activityText(item) }}</span>
                    <span class="activity-time">{{ activityTime(item) }}</span>
                  </li>
                </ul>
              </section>
            </div>
            <p v-else class="empty-state">No activity yet. Start your first workout or log a meal!</p>
          </article>

          <article class="panel">
            <h3>Quick Actions</h3>
            <div class="actions actions-two-col">
              <RouterLink to="/workout" class="action-btn">Start Workout</RouterLink>
              <RouterLink to="/diet" class="action-btn">Log Meal</RouterLink>
              <RouterLink to="/schedule" class="action-btn">View Schedule</RouterLink>
              <RouterLink to="/profile" class="action-btn">Update Profile</RouterLink>
            </div>
          </article>
        </section>

        <section class="panel insight-panel">
          <h3>Smart Insight</h3>
          <ul>
            <li v-for="insight in smartInsights" :key="insight">{{ insight }}</li>
          </ul>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.dashboard-wrap {
  min-height: calc(100vh - 72px);
  padding: 24px 16px 40px;
  background: #f5f7f8;
  display: flex;
  justify-content: center;
}

.dashboard-shell {
  width: 100%;
  max-width: 1120px;
  display: grid;
  gap: 18px;
}

.hero {
  text-align: center;
  border-radius: 18px;
  padding: 24px 16px;
  color: #2f4858;
  background: linear-gradient(120deg, #a7f2ad 0%, #70d1ac 35%, #48aea4 60%, #348b93 80%, #316879 100%);
  box-shadow: 0 12px 24px rgba(49, 104, 121, 0.18);
}

.hero h1 {
  margin: 0;
  font-size: clamp(26px, 4vw, 36px);
}

.hero p {
  margin: 8px 0 0;
  font-size: 15px;
}

.hero-summary {
  margin-top: 10px;
  font-weight: 700;
  color: #2f4858;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}

.summary-card {
  border-radius: 14px;
  padding: 14px;
  background: linear-gradient(160deg, #ffffff 0%, #a7f2ad 100%);
  border: 1px solid #70d1ac;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.08);
}

.summary-card h3 {
  margin: 0;
  color: #316879;
  font-size: 13px;
  font-weight: 700;
}

.summary-value {
  margin: 10px 0 0;
  color: #2f4858;
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
}

.summary-sub {
  margin: 8px 0 0;
  font-size: 12px;
  color: #316879;
}

.workout-progress-track {
  margin-top: 8px;
  height: 8px;
  border-radius: 999px;
  background: #d9eeea;
  overflow: hidden;
}

.workout-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #48aea4 0%, #2f4858 100%);
  transition: width 0.2s ease;
}

.focus-panel {
  background: linear-gradient(130deg, #ffffff 0%, #f4fffa 100%);
}

.focus-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.focus-head h3 {
  margin: 0;
}

.focus-head p {
  margin: 4px 0 0;
  color: #316879;
  font-size: 13px;
}

.focus-btn {
  text-decoration: none;
  padding: 10px 14px;
  border-radius: 10px;
  color: #2f4858;
  font-weight: 700;
  background: linear-gradient(120deg, #a7f2ad 0%, #70d1ac 45%, #48aea4 100%);
}

.focus-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.focus-item {
  border-radius: 10px;
  padding: 10px;
  border: 1px solid #70d1ac;
  background: #ffffff;
}

.focus-item strong {
  color: #2f4858;
}

.focus-item p {
  margin: 6px 0 0;
  color: #316879;
  font-size: 13px;
}

.summary-panel h3 {
  margin-bottom: 8px;
}

.summary-lines {
  margin: 0;
  padding-left: 18px;
  color: #316879;
  font-size: 13px;
  display: grid;
  gap: 4px;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.panel {
  background: #ffffff;
  border: 1px solid #70d1ac;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.07);
}

.panel h3 {
  margin: 0 0 12px;
  color: #2f4858;
}

.bar-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  min-height: 150px;
}

.bar-item {
  text-align: center;
}

.bar-track {
  height: 110px;
  border-radius: 10px;
  background: #e5efed;
  display: flex;
  align-items: end;
  padding: 3px;
}

.bar-fill {
  width: 100%;
  border-radius: 8px;
  background: linear-gradient(180deg, #48aea4 0%, #2f4858 100%);
}

.bar-item span {
  margin-top: 5px;
  display: block;
  color: #316879;
  font-size: 12px;
}

.bar-item small {
  font-size: 11px;
  color: #2f4858;
}

.double-bar-chart {
  display: grid;
  gap: 8px;
}

.double-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 95px;
  gap: 8px;
  align-items: center;
}

.day-label {
  color: #316879;
  font-size: 12px;
}

.double-bars {
  display: grid;
  gap: 4px;
}

.double-values {
  font-size: 11px;
  color: #2f4858;
}

.in-bar,
.out-bar {
  height: 10px;
  border-radius: 999px;
}

.in-bar {
  background: linear-gradient(90deg, #a7f2ad 0%, #70d1ac 100%);
}

.out-bar {
  background: linear-gradient(90deg, #348b93 0%, #2f4858 100%);
}

.bottom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.upcoming-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.upcoming-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  color: #316879;
  font-size: 13px;
  border-radius: 8px;
  padding: 6px 8px;
  background: #f7fbfa;
}

.upcoming-time {
  color: #2f4858;
  font-weight: 700;
  white-space: nowrap;
}

.activity-timeline {
  display: grid;
  gap: 12px;
}

.activity-group h4 {
  margin: 0 0 6px;
  color: #2f4858;
  font-size: 13px;
}

.activity-group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}

.activity-row {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 6px 8px;
  transition: background-color 0.15s ease;
}

.activity-row:hover {
  background: rgba(112, 209, 172, 0.18);
}

.activity-icon {
  color: #348b93;
}

.activity-text {
  color: #316879;
  font-size: 13px;
}

.activity-time {
  color: #2f4858;
  font-size: 12px;
  white-space: nowrap;
}

.actions {
  display: grid;
  gap: 10px;
}

.actions-two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.action-btn {
  text-decoration: none;
  color: #2f4858;
  font-weight: 700;
  text-align: center;
  border-radius: 10px;
  padding: 10px 12px;
  background: linear-gradient(120deg, #a7f2ad 0%, #70d1ac 40%, #48aea4 100%);
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.02);
  box-shadow: 0 8px 16px rgba(49, 104, 121, 0.15);
}

.insight-panel ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #316879;
}

.insight-panel li {
  margin: 6px 0;
}

.empty-state {
  margin: 0;
  color: #316879;
  font-size: 13px;
}

.loading {
  text-align: center;
  color: #2f4858;
  padding: 20px;
}

@media (max-width: 900px) {
  .charts-grid,
  .bottom-grid {
    grid-template-columns: 1fr;
  }

  .focus-grid {
    grid-template-columns: 1fr;
  }

  .actions-two-col {
    grid-template-columns: 1fr;
  }

}
</style>
