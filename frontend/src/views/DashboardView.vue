<script setup>
import { computed, onActivated, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";
import { calculateBmiValue } from "../utils/bmi";
import { getTodayLocalDate } from "../utils/dateLocal";
import { isDietFoodLogScheduleRow } from "../utils/dietPlanSchedulePayload";
import {
  calculateWorkoutCaloriesBurned,
  exerciseEffectiveDurationMinutes,
  resolveWeightKg,
} from "../utils/workoutCaloriesBurn";

const loading = ref(true);
const route = useRoute();
const auth = useAuthStore();

const dashboardPayload = ref(null);
const profile = ref(null);
const todayWorkout = ref(null);
const todayDietRecords = ref([]);
const todayDietOverview = ref(null);
const allSchedules = ref([]);
const enrolledCourses = ref([]);
const workoutPlans = ref([]);
const weeklyRows = ref([]);
const inOutRows = ref([]);

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value, fallback = null) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function safeText(text, fallback = "") {
  const value = String(text || "").trim();
  return value || fallback;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatPercent(value) {
  return `${asNumber(value).toFixed(1)}%`;
}

function formatBMI(value) {
  return asNumber(value).toFixed(2);
}

function formatClock(value, fallback = "--:--") {
  const d = asDate(value);
  if (d) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const hit = String(value || "").match(/^\d{2}:\d{2}/);
  return hit ? hit[0] : fallback;
}

function parseClockMinutes(value) {
  const raw = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return 0;
  const hh = Number(raw.slice(0, 2));
  const mm = Number(raw.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}

function isCompletedTask(task) {
  return task?.is_completed === true || task?.completed === true || String(task?.status || "").toLowerCase() === "completed";
}

function isCompletedCourseExercise(exercise) {
  return String(exercise?.status || "").toLowerCase() === "completed";
}

function getTaskBurn(task, weight) {
  const duration = asNumber(task?.duration_per_day ?? task?.durationPerDay ?? task?.duration);
  if (duration <= 0) return 0;
  return calculateWorkoutCaloriesBurned({
    durationMinutes: duration,
    category: String(task?.category || ""),
    title: String(task?.exercise_name || task?.exerciseName || task?.type || "").trim(),
    weightKg: resolveWeightKg(weight),
  });
}

function getCourseCompletedBurn(task) {
  const w = resolveWeightKg(weightForBurn.value);
  const cat = String(task?.category || "");
  if (!Array.isArray(task?.exercises)) return 0;
  return task.exercises.reduce((sum, exercise) => {
    if (!isCompletedCourseExercise(exercise)) return sum;
    return (
      sum +
      calculateWorkoutCaloriesBurned({
        durationMinutes: exerciseEffectiveDurationMinutes(exercise),
        category: cat,
        title: exercise?.title,
        weightKg: w,
      })
    );
  }, 0);
}

function getCoursePlannedBurnKcal(task) {
  const w = resolveWeightKg(weightForBurn.value);
  const cat = String(task?.category || "");
  if (!Array.isArray(task?.exercises)) return 0;
  return task.exercises.reduce(
    (sum, exercise) =>
      sum +
      calculateWorkoutCaloriesBurned({
        durationMinutes: exerciseEffectiveDurationMinutes(exercise),
        category: cat,
        title: exercise?.title,
        weightKg: w,
      }),
    0
  );
}

function getCoursePendingExercises(task) {
  const total = Math.max(0, Math.round(asNumber(task?.total_exercises || task?.exercises?.length)));
  const done = Math.max(0, Math.round(asNumber(task?.completed_exercises)));
  return Math.max(0, total - done);
}

function cleanPlanTitle(value) {
  const text = safeText(value);
  const lower = text.toLowerCase();
  if (!text) return "";
  if (["course", "untitled", "untitled plan", "course plan"].includes(lower)) return "";
  return text;
}

function bmiStatus(value) {
  const bmi = asNumber(value);
  if (bmi <= 0) return "No data";
  if (bmi < 18.5) return "Underweight";
  if (bmi <= 24.9) return "Normal";
  if (bmi <= 29.9) return "Overweight";
  return "Obese";
}

function netStatus(value) {
  const net = asNumber(value);
  if (net > 30) return "Surplus";
  if (net < -30) return "Deficit";
  return "Balanced";
}

const dashboardSummary = computed(() => dashboardPayload.value?.summary || {});
const todayKey = computed(() => getTodayLocalDate());
const weightForBurn = computed(() => asNumber(profile.value?.weight));

const todayWorkoutTasks = computed(() => (Array.isArray(todayWorkout.value?.workout_tasks) ? todayWorkout.value.workout_tasks : []));
const todayCourseTasks = computed(() => (Array.isArray(todayWorkout.value?.course_tasks) ? todayWorkout.value.course_tasks : []));

const totalWorkoutTasks = computed(() => todayWorkoutTasks.value.length);
const completedWorkoutTasks = computed(() => todayWorkoutTasks.value.filter((task) => isCompletedTask(task)).length);
const totalCourseTasks = computed(() => todayCourseTasks.value.length);
const completedCourseTasks = computed(() => todayCourseTasks.value.filter((task) => Boolean(task?.is_completed)).length);

const totalTodayTasks = computed(() => totalWorkoutTasks.value + totalCourseTasks.value);
const completedTodayTasks = computed(() => completedWorkoutTasks.value + completedCourseTasks.value);
const remainingTodayTasks = computed(() => Math.max(0, totalTodayTasks.value - completedTodayTasks.value));
const todayProgressPercent = computed(() => (totalTodayTasks.value > 0 ? (completedTodayTasks.value / totalTodayTasks.value) * 100 : 0));

const todayCaloriesIn = computed(() => asNumber(todayDietOverview.value?.consumed?.calories));
const todayCaloriesOut = computed(() => {
  const workoutBurn = todayWorkoutTasks.value.reduce(
    (sum, task) => (isCompletedTask(task) ? sum + getTaskBurn(task, weightForBurn.value) : sum),
    0
  );
  const courseBurn = todayCourseTasks.value.reduce((sum, task) => sum + getCourseCompletedBurn(task), 0);
  return workoutBurn + courseBurn;
});
const todayNetCalories = computed(() => todayCaloriesIn.value - todayCaloriesOut.value);
const todayNetState = computed(() => netStatus(todayNetCalories.value));

const bmiValue = computed(() => {
  const h = asNumber(profile.value?.height);
  const w = asNumber(profile.value?.weight);
  if (h <= 0 || w <= 0) return 0;
  return asNumber(calculateBmiValue(w, h));
});

const heroSummary = computed(() => {
  if (totalTodayTasks.value > 0 && remainingTodayTasks.value === 0) return "Great job, you completed all workout tasks today.";
  if (todayNetState.value === "Surplus") return "You are in calorie surplus today.";
  if (todayNetState.value === "Deficit") return "You are in calorie deficit today.";
  if (remainingTodayTasks.value > 0) return `You still have ${remainingTodayTasks.value} tasks remaining today.`;
  return "You are balanced today.";
});

const heroUserName = computed(() => {
  const source = auth.user || profile.value || {};
  const raw = safeText(source?.displayName || source?.username || source?.name);
  if (!raw) return "";
  return raw.length > 28 ? `${raw.slice(0, 28)}...` : raw;
});

const heroTitle = computed(() => (heroUserName.value ? `Welcome back, ${heroUserName.value}` : "Welcome back"));

const heroProgressLine = computed(() => `You have ${totalTodayTasks.value} tasks planned today.`);

const workoutProgressText = computed(() => `${completedTodayTasks.value} / ${totalTodayTasks.value}`);
const workoutProgressPercent = computed(() => (totalTodayTasks.value > 0 ? (completedTodayTasks.value / totalTodayTasks.value) * 100 : 0));

const statCards = computed(() => [
  {
    id: "total-workouts",
    title: "Total Workouts",
    value: workoutProgressText.value,
    sub: "Completed / total tasks",
    progress: workoutProgressPercent.value,
  },
  {
    id: "calories-burned",
    title: "Calories Burned",
    value: `${Math.round(todayCaloriesOut.value)} kcal`,
    sub: "Burned today",
    progress: null,
  },
  {
    id: "calories-consumed",
    title: "Calories Consumed",
    value: `${Math.round(todayCaloriesIn.value)} kcal`,
    sub: "Today intake",
    progress: null,
  },
  {
    id: "bmi",
    title: "BMI",
    value: formatBMI(bmiValue.value),
    sub: bmiStatus(bmiValue.value),
    progress: null,
  },
  {
    id: "progress",
    title: "Today's Progress",
    value: formatPercent(todayProgressPercent.value),
    sub: `${completedTodayTasks.value} / ${totalTodayTasks.value} tasks completed`,
    progress: null,
  },
]);

const todayScheduleItems = computed(() =>
  Array.isArray(allSchedules.value)
    ? allSchedules.value.filter(
        (item) => String(item?.date || "") === todayKey.value && !isDietFoodLogScheduleRow(item)
      )
    : []
);
const todayPendingScheduleItems = computed(() => todayScheduleItems.value.filter((item) => !item?.is_completed));
const pendingCourseExercises = computed(() => todayCourseTasks.value.reduce((sum, task) => sum + getCoursePendingExercises(task), 0));

const todayFocusItems = computed(() => [
  {
    key: "workout",
    title: "Workout",
    value:
      totalWorkoutTasks.value <= 0
        ? "No task today"
        : `${Math.max(0, totalWorkoutTasks.value - completedWorkoutTasks.value)} tasks remaining`,
  },
  {
    key: "schedule",
    title: "Schedule",
    value: `${todayPendingScheduleItems.value.length} items pending`,
  },
  {
    key: "diet",
    title: "Diet",
    value: `${Math.round(todayCaloriesIn.value)} kcal today`,
  },
]);

const todaySummaryItems = computed(() => [
  `Tasks: ${completedTodayTasks.value} / ${totalTodayTasks.value} completed`,
  `Calories: ${Math.round(todayCaloriesIn.value)} in / ${Math.round(todayCaloriesOut.value)} out`,
  `Schedule: ${todayPendingScheduleItems.value.length} pending`,
  `Courses: ${todayCourseTasks.value.length} active today`,
]);

const startTodayLink = computed(() => {
  if (remainingTodayTasks.value > 0) return "/workout";
  if (todayPendingScheduleItems.value.length > 0) return "/schedule";
  return "/workout";
});

function pickScheduleItemName(item) {
  const candidates = [item?.title, item?.name, item?.planName, item?.plan_name, item?.courseName, item?.taskName];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

/** Align with Schedule list: VIP / Course / Workout / Diet / Personal / Reminder. */
function scheduleItemTypeTag(item) {
  if (item?.courseIsPremium) return "VIP";
  const it = String(item?.itemType || "").toLowerCase();
  if (item?.courseId || it === "course" || it === "course_session") return "Course";
  if (it === "workout" || it === "exercise") return "Workout";
  if (it === "diet") return "Diet";
  if (it === "personal") return "Personal";
  if (it === "reminder") return "Reminder";
  if (it === "manual") return "Personal";
  return "Reminder";
}

function scheduleItemDisplayTitle(item) {
  const low = String(item?.itemType || "").toLowerCase();
  if (low === "diet") {
    const raw = pickScheduleItemName(item);
    if (raw && !/^diet$/i.test(raw)) return raw;
    const plan = String(item?.planName || "").trim();
    const meal = String(item?.meal || "").toLowerCase();
    const mealLabel =
      meal === "breakfast"
        ? "Breakfast"
        : meal === "lunch"
          ? "Lunch"
          : meal === "dinner"
            ? "Dinner"
            : meal === "snack"
              ? "Snack"
              : "Meal";
    if (plan) return `${mealLabel} · ${plan}`;
    const sub = String(item?.subtitle || "").trim();
    if (sub) return `${mealLabel} · ${sub.split(" - ")[0]}`;
    return `${mealLabel} · Diet`;
  }

  const typeTag = scheduleItemTypeTag(item);

  if (item?.courseIsPremium) {
    return safeText(pickScheduleItemName(item), "VIP Session");
  }

  if (low === "course" || item?.courseId) {
    const title = safeText(pickScheduleItemName(item), "Course");
    const sub = String(item?.subtitle || "").trim();
    if (sub) {
      if (/^plan day/i.test(sub)) return `${title} · ${sub}`;
      return `${title} - ${sub}`;
    }
    return title;
  }

  const rawName = pickScheduleItemName(item);
  const genericSet = new Set(["vip", "course", "workout", "reminder", "personal", "manual", "item", "diet"]);
  if (rawName && !genericSet.has(rawName.toLowerCase())) return rawName;
  return rawName || typeTag;
}

const upcomingToday = computed(() => {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return todayPendingScheduleItems.value
    .map((item) => ({
      id: String(item?._id || `${item?.title}-${item?.time}`),
      title: scheduleItemDisplayTitle(item),
      time: safeText(item?.time, "00:00"),
      minutes: parseClockMinutes(item?.time),
      type: scheduleItemTypeTag(item),
      sortKey: `${String(item?.time || "00:00").padStart(5, "0")}|${String(item?._id || pickScheduleItemName(item))}`,
    }))
    .filter((item) => item.minutes >= nowMinutes)
    .sort((a, b) => {
      if (a.minutes !== b.minutes) return a.minutes - b.minutes;
      return a.sortKey.localeCompare(b.sortKey);
    })
    .slice(0, 3)
    .map(({ sortKey, ...rest }) => rest);
});

function normalizePlanProgress(total, completed) {
  const totalSafe = Math.max(1, Math.round(asNumber(total)));
  const completedSafe = Math.max(0, Math.min(totalSafe, Math.round(asNumber(completed))));
  let statusKey = "not_started";
  if (completedSafe >= totalSafe) statusKey = "completed";
  else if (completedSafe > 0) statusKey = "in_progress";
  const statusLabel =
    statusKey === "completed" ? "Completed" : statusKey === "in_progress" ? "In Progress" : "Not Started";
  return {
    total: totalSafe,
    completed: completedSafe,
    statusKey,
    statusLabel,
    percent: Math.max(0, Math.min(100, (completedSafe / totalSafe) * 100)),
  };
}

function planActionLabel(statusKey) {
  if (statusKey === "completed") return "View";
  if (statusKey === "in_progress") return "Continue";
  return "Start";
}

const activePlansDisplay = computed(() => {
  const courseRows = todayCourseTasks.value
    .map((task) => {
      const title = cleanPlanTitle(task?.title || task?.course_title || task?.courseName);
      if (!title) return null;
      const totalExercises = Math.max(
        0,
        Math.round(asNumber(task?.total_exercises || (Array.isArray(task?.exercises) ? task.exercises.length : 0)))
      );
      if (totalExercises <= 0) return null;
      const completedExercises = Math.max(0, Math.round(asNumber(task?.completed_exercises)));
      const progress = normalizePlanProgress(totalExercises, completedExercises);
      const durationValue = asNumber(task?.duration || task?.duration_minutes || task?.duration_per_day);
      const durationText = durationValue > 0 ? `${Math.round(durationValue)} min/day` : "-- min/day";
      return {
        id: `course-${String(task?.enrolled_course_id || task?.course_id || task?._id || title)}`,
        title,
        dayText: `Day ${Math.max(1, Math.round(asNumber(task?.day || 1)))} / ${Math.max(
          1,
          Math.round(asNumber(task?.duration_days || 1))
        )}`,
        status: progress.statusLabel,
        statusKey: progress.statusKey,
        hasTodayTask: true,
        progressPercent: progress.percent,
        totalKcal: Math.round(getCoursePlannedBurnKcal(task)),
        durationText,
        actionLabel: planActionLabel(progress.statusKey),
      };
    })
    .filter(Boolean);

  const workoutRows = todayWorkoutTasks.value
    .map((task) => {
      const title = cleanPlanTitle(task?.exercise_name || task?.exerciseName || task?.title);
      if (!title) return null;
      const progress = normalizePlanProgress(1, isCompletedTask(task) ? 1 : 0);
      const durationValue = asNumber(task?.duration_per_day || task?.durationPerDay || task?.duration);
      const durationText = durationValue > 0 ? `${Math.round(durationValue)} min/day` : "-- min/day";
      return {
        id: `workout-${String(task?.schedule_item_id || task?.workout_plan_id || task?._id || title)}`,
        title,
        dayText: "Today",
        status: progress.statusLabel,
        statusKey: progress.statusKey,
        hasTodayTask: true,
        progressPercent: progress.percent,
        totalKcal: Math.round(getTaskBurn(task, weightForBurn.value)),
        durationText,
        actionLabel: planActionLabel(progress.statusKey),
      };
    })
    .filter(Boolean);

  const order = { in_progress: 0, completed: 1, not_started: 2 };
  return [...courseRows, ...workoutRows]
    .sort((a, b) => {
      if (a.hasTodayTask !== b.hasTodayTask) return a.hasTodayTask ? -1 : 1;
      return (order[a.statusKey] ?? 9) - (order[b.statusKey] ?? 9);
    })
    .slice(0, 3);
});

const weeklyActivityData = computed(() => weeklyRows.value);
const weeklyHasData = computed(() =>
  weeklyActivityData.value.some((row) => asNumber(row?.total) > 0 || asNumber(row?.completed) > 0)
);
const weeklyMaxTasks = computed(() => Math.max(1, ...weeklyActivityData.value.map((row) => asNumber(row?.total))));

const caloriesInOutData = computed(() => inOutRows.value);
const inOutHasData = computed(() => caloriesInOutData.value.some((row) => asNumber(row?.in) > 0 || asNumber(row?.out) > 0));
const inOutMax = computed(() => Math.max(1, ...caloriesInOutData.value.flatMap((row) => [asNumber(row?.in), asNumber(row?.out)])));

const recentActivities = computed(() => {
  const dietRows = (Array.isArray(todayDietRecords.value) ? todayDietRecords.value : []).map((row) => ({
    id: `diet-${row?._id || row?.foodName}`,
    type: "Diet",
    title: safeText(row?.foodName, "Meal"),
    detail: `${Math.round(asNumber(row?.calories))} kcal`,
    time: asDate(row?.recordedAt || row?.createdAt, new Date())?.toISOString(),
  }));

  const workoutRows = todayWorkoutTasks.value
    .filter((task) => isCompletedTask(task))
    .map((task) => ({
      id: `workout-${task?.schedule_item_id || task?.workout_plan_id || task?._id}`,
      type: "Workout",
      title: safeText(task?.exercise_name || task?.exerciseName, "Workout"),
      detail: `${Math.round(getTaskBurn(task, weightForBurn.value))} kcal burned`,
      time: asDate(task?.completed_at || task?.completedAt || task?.updatedAt || task?.createdAt, new Date())?.toISOString(),
    }));

  const courseRows = todayCourseTasks.value
    .filter((task) => asNumber(task?.completed_exercises) > 0 || task?.is_completed)
    .map((task) => ({
      id: `course-${task?.enrolled_course_id || task?.course_id}`,
      type: "Course",
      title: safeText(task?.title, "Course Session"),
      detail: task?.is_completed
        ? `Day ${Math.round(asNumber(task?.day || 1))} completed`
        : `${Math.round(asNumber(task?.completed_exercises || 0))} exercise(s) completed`,
      time: asDate(task?.completed_at || task?.updatedAt || task?.createdAt, new Date())?.toISOString(),
    }));

  const scheduleRows = todayScheduleItems.value
    .filter((row) => row?.is_completed)
    .slice(0, 1)
    .map((row) => ({
      id: `schedule-${row?._id || row?.title}`,
      type: "Schedule",
      title: safeText(row?.title, "Session"),
      detail: "Session completed",
      time: asDate(`${safeText(row?.date, todayKey.value)}T${safeText(row?.time, "00:00")}:00`, new Date())?.toISOString(),
    }));

  return [...dietRows, ...workoutRows, ...courseRows, ...scheduleRows]
    .filter((row) => row.time)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);
});

function activityIcon(type) {
  if (type === "Diet") return "🥗";
  if (type === "Workout") return "🏃";
  if (type === "Course") return "📘";
  return "📅";
}

const smartInsights = computed(() => {
  const hints = [];
  if (todayNetState.value === "Surplus") hints.push("You are in calorie surplus.");
  if (todayNetState.value === "Deficit") hints.push("You are in calorie deficit.");
  if (remainingTodayTasks.value > 0) hints.push(`${remainingTodayTasks.value} workout task(s) remaining.`);
  if (pendingCourseExercises.value > 0) hints.push(`${pendingCourseExercises.value} course exercise(s) pending.`);
  if (bmiStatus(bmiValue.value) === "Normal") hints.push("BMI is in normal range.");
  return [...new Set(hints)].slice(0, 3);
});

async function fetchDashboardData() {
  loading.value = true;
  try {
    const [dashboardRes, profileRes] = await Promise.all([
      api.get("/dashboard").catch(() => ({ data: null })),
      api.get("/user/profile"),
    ]);
    dashboardPayload.value = dashboardRes?.data || null;
    profile.value = profileRes?.data || null;
    auth.$patch({ user: auth.normalizeUser(profileRes?.data || null) });

    const userId = profile.value?.id;
    if (!userId) {
      todayWorkout.value = null;
      todayDietRecords.value = [];
      todayDietOverview.value = null;
      allSchedules.value = [];
      enrolledCourses.value = [];
      workoutPlans.value = [];
      weeklyRows.value = [];
      inOutRows.value = [];
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

    const dateKeys = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      dateKeys.push(formatDateKey(d));
    }

    const rows = await Promise.all(
      dateKeys.map(async (dateKey) => {
        const [workoutDayRes, dietDayRes] = await Promise.all([
          api.get("/workout/day", { params: { date: dateKey } }).catch(() => ({ data: null })),
          api.get(`/diets/${userId}/overview`, { params: { date: dateKey } }).catch(() => ({ data: null })),
        ]);
        const workoutTasks = Array.isArray(workoutDayRes?.data?.workout_tasks) ? workoutDayRes.data.workout_tasks : [];
        const courseTasks = Array.isArray(workoutDayRes?.data?.course_tasks) ? workoutDayRes.data.course_tasks : [];
        const total = workoutTasks.length + courseTasks.length;
        const completed =
          workoutTasks.filter((task) => isCompletedTask(task)).length + courseTasks.filter((task) => Boolean(task?.is_completed)).length;
        const out =
          workoutTasks.reduce((sum, task) => (isCompletedTask(task) ? sum + getTaskBurn(task, weightForBurn.value) : sum), 0) +
          courseTasks.reduce((sum, task) => sum + getCourseCompletedBurn(task), 0);
        return {
          day: asDate(`${dateKey}T00:00:00`)?.toLocaleDateString("en-US", { weekday: "short" }) || "--",
          total,
          completed,
          in: asNumber(dietDayRes?.data?.consumed?.calories),
          out,
        };
      })
    );

    weeklyRows.value = rows;
    inOutRows.value = rows.map((row) => ({ day: row.day, in: row.in, out: row.out }));
  } catch {
    dashboardPayload.value = null;
    profile.value = null;
    todayWorkout.value = null;
    todayDietRecords.value = [];
    todayDietOverview.value = null;
    allSchedules.value = [];
    enrolledCourses.value = [];
    workoutPlans.value = [];
    weeklyRows.value = [];
    inOutRows.value = [];
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
      <header class="hero-card">
        <p class="hero-kicker">Dashboard overview</p>
        <h1>{{ heroTitle }}</h1>
        <p class="hero-summary">{{ heroSummary }}</p>
        <p class="hero-progress">{{ heroProgressLine }}</p>
        <RouterLink :to="startTodayLink" class="hero-action">Start Today</RouterLink>
      </header>

      <div v-if="loading" class="panel loading">Loading your healthy stats...</div>

      <template v-else>
        <section class="stats-row">
          <article v-for="card in statCards" :key="card.id" class="stat-card">
            <h3>{{ card.title }}</h3>
            <p class="stat-value">{{ card.value }}</p>
            <p class="stat-sub">{{ card.sub }}</p>
            <div v-if="card.progress != null" class="progress-track">
              <div class="progress-fill" :style="{ width: `${Math.max(0, Math.min(100, card.progress || 0))}%` }"></div>
            </div>
          </article>
        </section>

        <section class="panel focus-panel">
          <div class="panel-head">
            <div>
              <h2>Today's Focus</h2>
              <p>Action guide for your day</p>
            </div>
          </div>
          <div class="focus-grid">
            <article v-for="item in todayFocusItems" :key="item.key" class="focus-item">
              <strong>{{ item.title }}</strong>
              <p>{{ item.value }}</p>
            </article>
          </div>
        </section>

        <section class="panel summary-panel">
          <h2>Today Summary</h2>
          <ul>
            <li v-for="line in todaySummaryItems" :key="line">{{ line }}</li>
          </ul>
        </section>

        <section class="panel quick-actions-panel">
          <h2>Quick Actions</h2>
          <div class="quick-grid">
            <RouterLink to="/workout" class="quick-btn">Start Workout</RouterLink>
            <RouterLink to="/diet" class="quick-btn">Log Meal</RouterLink>
            <RouterLink to="/schedule" class="quick-btn">View Schedule</RouterLink>
            <RouterLink to="/profile" class="quick-btn">Update Profile</RouterLink>
          </div>
        </section>

        <section class="double-col double-col--plans">
          <article class="panel">
            <h2>Upcoming</h2>
            <ul v-if="upcomingToday.length" class="upcoming-list">
              <li v-for="item in upcomingToday" :key="item.id" class="upcoming-item">
                <div class="upcoming-item-left">
                  <span class="upcoming-time">{{ item.time }}</span>
                  <span class="upcoming-title">{{ item.title }}</span>
                </div>
                <span class="upcoming-type">{{ item.type }}</span>
              </li>
            </ul>
            <p v-else class="empty">No upcoming sessions today</p>
          </article>

          <article class="panel">
            <h2>Today's Active Plans</h2>
            <ul v-if="activePlansDisplay.length" class="active-plan-list">
              <li v-for="item in activePlansDisplay" :key="item.id" class="active-plan-card">
                <div class="active-plan-head">
                  <div class="active-plan-title-wrap">
                    <span class="active-plan-title">{{ item.title }}</span>
                    <span class="active-plan-day">{{ item.dayText }}</span>
                  </div>
                  <span class="active-plan-status" :class="`is-${item.statusKey}`">{{ item.status }}</span>
                </div>
                <div class="active-plan-track">
                  <div class="active-plan-fill" :style="{ width: `${item.progressPercent}%` }"></div>
                </div>
                <div class="active-plan-foot">
                  <span>🔥 {{ item.totalKcal }} kcal</span>
                  <span>⏱ {{ item.durationText }}</span>
                  <RouterLink to="/workout" class="active-plan-btn">{{ item.actionLabel }}</RouterLink>
                </div>
              </li>
            </ul>
            <p v-else class="empty">No active plans for today</p>
          </article>
        </section>

        <section class="double-col charts">
          <article class="panel">
            <h2>Weekly Activity</h2>
            <div v-if="weeklyHasData" class="weekly-chart">
              <div v-for="item in weeklyActivityData" :key="item.day" class="weekly-item">
                <div class="weekly-track">
                  <div class="weekly-fill" :style="{ height: `${Math.min(100, (item.completed / weeklyMaxTasks) * 100)}%` }"></div>
                </div>
                <span>{{ item.day }}</span>
                <small>{{ item.completed }} / {{ item.total }}</small>
              </div>
            </div>
            <div v-else class="chart-empty">
              <p>No activity yet</p>
              <p>Start tracking to see insights</p>
            </div>
          </article>

          <article class="panel">
            <div class="panel-title-row">
              <h2>Calories In vs Out</h2>
              <div class="inout-legend" aria-label="Calories legend">
                <span class="legend-item" title="Calories In = food intake">
                  <i class="legend-dot in"></i>
                  Calories In (Consumed)
                </span>
                <span class="legend-item" title="Calories Out = calories burned">
                  <i class="legend-dot out"></i>
                  Calories Out (Burned)
                </span>
              </div>
            </div>
            <div v-if="inOutHasData" class="inout-chart">
              <div v-for="item in caloriesInOutData" :key="item.day" class="inout-row">
                <span class="day">{{ item.day }}</span>
                <div class="bars">
                  <div class="bar in" :style="{ width: `${(item.in / inOutMax) * 100}%` }"></div>
                  <div class="bar out" :style="{ width: `${(item.out / inOutMax) * 100}%` }"></div>
                </div>
                <span class="value">{{ Math.round(item.in) }} / {{ Math.round(item.out) }} kcal</span>
              </div>
            </div>
            <div v-else class="chart-empty">
              <p>No activity yet</p>
              <p>Start tracking to see insights</p>
            </div>
          </article>
        </section>

        <section class="panel recent-activity-panel">
          <h2>Recent Activity</h2>
          <ul v-if="recentActivities.length" class="activity-list">
            <li v-for="item in recentActivities" :key="item.id">
              <span class="icon">{{ activityIcon(item.type) }}</span>
              <span class="main">{{ item.type }}: {{ item.title }}</span>
              <span class="detail">{{ item.detail }}</span>
              <span class="at">{{ formatClock(item.time) }}</span>
            </li>
          </ul>
          <p v-else class="empty">No recent activity yet</p>
        </section>

        <section class="insight-card">
          <h2>Smart Insight</h2>
          <ul v-if="smartInsights.length">
            <li v-for="line in smartInsights" :key="line">{{ line }}</li>
          </ul>
          <p v-else class="empty">No insight yet</p>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.dashboard-wrap {
  min-height: calc(100vh - 72px);
  padding: 24px 16px 40px;
  background: #f5fbf8;
  display: flex;
  justify-content: center;
}

.dashboard-shell {
  width: 100%;
  max-width: 1240px;
  display: grid;
  gap: 20px;
}

.hero-card {
  border-radius: 24px;
  padding: 28px 24px;
  text-align: center;
  background: linear-gradient(135deg, #a7f2ad 0%, #70d1ac 35%, #48aea4 65%, #316879 100%);
  box-shadow: 0 14px 26px rgba(47, 72, 88, 0.2);
}

.hero-kicker {
  margin: 0;
  color: #ffffff;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.hero-card h1 {
  margin: 8px 0 0;
  color: #ffffff;
  font-size: clamp(32px, 4vw, 44px);
  font-weight: 800;
}

.hero-summary {
  margin: 10px 0 0;
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
}

.hero-progress {
  margin: 6px 0 0;
  color: #f0fbf6;
  font-size: 14px;
}

.hero-action {
  margin-top: 12px;
  display: inline-block;
  text-decoration: none;
  border-radius: 999px;
  padding: 9px 18px;
  color: #2f4858;
  font-weight: 700;
  background: linear-gradient(120deg, #ffffff 0%, #d6fbec 100%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.hero-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 16px rgba(47, 72, 88, 0.16);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  border-radius: 18px;
  padding: 14px;
  background: linear-gradient(160deg, #f7fffb 0%, #dff6ec 100%);
  border: 1px solid #cbe7db;
  box-shadow: 0 7px 16px rgba(47, 72, 88, 0.09);
}

.stat-card h3 {
  margin: 0;
  color: #2f4858;
  font-size: 13px;
}

.stat-value {
  margin: 9px 0 0;
  color: #2f4858;
  font-size: 34px;
  line-height: 1;
  font-weight: 800;
}

.stat-sub {
  margin: 8px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.progress-track {
  margin-top: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ddefe9;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #48aea4 0%, #316879 100%);
}

.panel {
  border-radius: 18px;
  padding: 20px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 6px 14px rgba(47, 72, 88, 0.07);
}

.panel h2,
.insight-card h2 {
  margin: 0;
  color: #2f4858;
  font-size: 31px;
  font-weight: 700;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.panel-head p {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.focus-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.focus-item {
  border-radius: 12px;
  border: 1px solid #dde7e4;
  background: #f9fbfb;
  padding: 10px;
}

.focus-item strong {
  color: #2f4858;
  font-size: 13px;
}

.focus-item p {
  margin: 6px 0 0;
  color: #4b5563;
  font-size: 13px;
}

.summary-panel ul,
.insight-card ul {
  margin: 12px 0 0;
  padding-left: 18px;
  color: #4b5563;
  font-size: 13px;
  display: grid;
  gap: 5px;
}

.double-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: stretch;
}

.double-col--plans {
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
}

.double-col > .panel {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-height: 0;
}

.double-col > .panel > h2,
.double-col > .panel > .panel-title-row {
  flex-shrink: 0;
}

.double-col > .panel > .upcoming-list,
.double-col > .panel > .active-plan-list,
.double-col > .panel > .weekly-chart,
.double-col > .panel > .chart-empty,
.double-col > .panel > .inout-chart,
.double-col > .panel > .activity-list,
.double-col > .panel > .quick-grid,
.double-col > .panel > .empty {
  flex: 1 1 auto;
}

.upcoming-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.upcoming-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 0;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.upcoming-item:not(:last-child) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.upcoming-item:hover {
  background: rgba(0, 0, 0, 0.02);
}

.upcoming-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.upcoming-time,
.upcoming-title {
  display: inline-flex;
  align-items: center;
  margin: 0;
  line-height: 20px;
}

.upcoming-time {
  color: #2f4858;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.upcoming-title {
  color: #4b5563;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.upcoming-type {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  align-self: center;
  color: #4b5563;
  font-size: 11px;
  line-height: 20px;
  border-radius: 999px;
  background: #eef4f2;
  border: 1px solid #d9e6e2;
  padding: 3px 8px;
}

.active-plan-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 16px;
}

.active-plan-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(112, 209, 172, 0.42);
  box-shadow: 0 6px 14px rgba(47, 72, 88, 0.07);
  padding: 16px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.active-plan-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 18px rgba(47, 72, 88, 0.12);
}

.active-plan-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.active-plan-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.active-plan-title {
  color: #316879;
  font-weight: 600;
  font-size: 15px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.active-plan-day {
  color: #348b93;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(167, 242, 173, 0.24);
  border: 1px solid #a7f2ad;
  padding: 2px 8px;
}

.active-plan-status {
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 4px 10px;
  white-space: nowrap;
}

.active-plan-status.is-in_progress {
  background: #70d1ac;
  color: #ffffff;
  border: 1px solid #70d1ac;
}

.active-plan-status.is-completed {
  background: #348b93;
  color: #ffffff;
  border: 1px solid #348b93;
}

.active-plan-status.is-not_started {
  background: transparent;
  color: #316879;
  border: 1px solid #316879;
}

.active-plan-track {
  margin-top: 10px;
  height: 6px;
  border-radius: 999px;
  background: rgba(49, 104, 121, 0.14);
  overflow: hidden;
}

.active-plan-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #a7f2ad 0%, #48aea4 100%);
}

.active-plan-foot {
  margin-top: 10px;
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 10px;
  color: rgba(49, 104, 121, 0.78);
  font-size: 12px;
}

.active-plan-btn {
  justify-self: end;
  text-decoration: none;
  border-radius: 8px;
  padding: 7px 12px;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  background: #48aea4;
  border: 1px solid #48aea4;
  transition: filter 0.18s ease;
}

.active-plan-btn:hover {
  filter: brightness(0.96);
}

.charts .panel {
  min-height: 260px;
}

.weekly-chart {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  min-height: 160px;
}

.weekly-item {
  text-align: center;
}

.weekly-track {
  height: 108px;
  border-radius: 10px;
  background: #e8eff0;
  padding: 3px;
  display: flex;
  align-items: end;
}

.weekly-fill {
  width: 100%;
  border-radius: 7px;
  background: linear-gradient(180deg, #48aea4 0%, #316879 100%);
}

.weekly-item span {
  margin-top: 6px;
  display: block;
  font-size: 12px;
  color: #4b5563;
}

.weekly-item small {
  font-size: 11px;
  color: #6b7280;
}

.chart-empty {
  margin-top: 16px;
}

.chart-empty p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.chart-empty p + p {
  margin-top: 4px;
}

.inout-chart {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.panel-title-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px 12px;
}

.inout-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}

.legend-dot.in {
  background: #6fcf97;
}

.legend-dot.out {
  background: #2d9cdb;
}

.inout-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 112px;
  gap: 8px;
  align-items: center;
}

.inout-row .day {
  color: #4b5563;
  font-size: 12px;
}

.inout-row .bars {
  display: grid;
  gap: 4px;
}

.inout-row .bar {
  height: 10px;
  border-radius: 999px;
}

.inout-row .bar.in {
  background: linear-gradient(90deg, #8ee3b0 0%, #6fcf97 100%);
}

.inout-row .bar.out {
  background: linear-gradient(90deg, #2d9cdb 0%, #2f7fb8 100%);
}

.inout-row .value {
  color: #6b7280;
  font-size: 11px;
}

.activity-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.activity-list li {
  display: grid;
  grid-template-columns: 22px 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}

.activity-list li:last-child {
  border-bottom: none;
}

.activity-list .icon {
  font-size: 14px;
}

.activity-list .main {
  color: #4b5563;
  font-size: 13px;
}

.activity-list .detail,
.activity-list .at {
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
}

.quick-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-btn {
  text-decoration: none;
  text-align: center;
  border-radius: 12px;
  padding: 10px 12px;
  color: #2f4858;
  font-size: 13px;
  font-weight: 700;
  background: linear-gradient(130deg, #edf9f3 0%, #d4f1e6 100%);
  border: 1px solid #cde8dd;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.quick-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 9px 12px rgba(47, 72, 88, 0.12);
}

.insight-card {
  border-radius: 18px;
  padding: 20px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 6px 14px rgba(47, 72, 88, 0.07);
}

.empty {
  margin: 12px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.loading {
  text-align: center;
  color: #4b5563;
}

@media (max-width: 1100px) {
  .stats-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .double-col,
  .focus-grid {
    grid-template-columns: 1fr;
  }

  .stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .dashboard-wrap {
    padding: 16px 12px 24px;
  }

  .hero-card {
    padding: 22px 16px;
  }

  .stats-row {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .quick-grid {
    grid-template-columns: 1fr;
  }

  .activity-list li {
    grid-template-columns: 20px 1fr;
  }

  .activity-list .detail,
  .activity-list .at {
    grid-column: 2;
  }
}
</style>
