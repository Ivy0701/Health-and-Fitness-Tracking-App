<script setup>
import { computed, nextTick, onActivated, onMounted, reactive, ref, watch } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import WorkoutDateSlider from "../components/workout/WorkoutDateSlider.vue";
import api from "../services/api";
import { useRoute, useRouter } from "vue-router";
import { useFavorites } from "../services/favorites";
import { buildWorkoutSessionTaskId, loadWorkoutSessionState } from "../utils/workoutSessionState";
import { compareDateKeys, getTodayLocalDate, normalizeDateKey as normalizeLocalDateKey } from "../utils/dateLocal";

const route = useRoute();
const router = useRouter();
const { isFavorited, toggleFavorite, ensureFavoritesLoaded } = useFavorites();

const showForm = ref(false);
const saving = ref(false);
const plans = ref([]);
const error = ref("");
const success = ref("");
const userWeight = ref(null);
const currentUserId = ref("");
const todayInfo = ref({
  date: "",
  hasAnyPlan: false,
  hasAnyCourseEnrollment: false,
  status: "No workout scheduled",
  tasks: [],
  workout_tasks: [],
  course_tasks: [],
});
const selectedDate = ref(getTodayLocalDate());
const todayDateKey = computed(() => getTodayLocalDate());
const focusedPlanId = ref("");
const expandedCourseIds = ref(new Set());
const courseExerciseLoadingKeys = ref(new Set());
let focusTimer = null;

const EXERCISE_GROUPS = [
  {
    category: "Cardio",
    options: ["Running", "Cycling", "Swimming", "Jump Rope", "Walking"],
  },
  {
    category: "Strength",
    options: ["Weight Lifting", "Push-up", "Pull-up", "Squat", "Deadlift"],
  },
  {
    category: "Flexibility",
    options: ["Yoga", "Stretching", "Pilates"],
  },
  {
    category: "Sports",
    options: ["Basketball", "Football", "Badminton", "Tennis"],
  },
];

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

const form = reactive({
  exercise: "Running",
  customExercise: "",
  days: 7,
  durationPerDay: 30,
  startTime: "",
});

function workoutItemId(plan) {
  return String(plan?.id || plan?._id || "");
}

function isWorkoutFavorited(plan) {
  return isFavorited("workout", workoutItemId(plan));
}

async function toggleWorkoutFavorite(plan) {
  const itemId = workoutItemId(plan);
  if (!itemId) return;
  await toggleFavorite({
    itemType: "workout",
    itemId,
    title: plan.exercise_name || plan.exerciseName || "Workout",
    description: `${plan.category || "General"} training`,
    metadata: {
      category: plan.category || "Other",
      duration: Number(plan.duration_per_day || plan.durationPerDay || 0),
      days: Number(plan.days || 0),
      difficulty: plan.is_custom ? "Custom" : "Standard",
    },
    sourceType: "workout_plan",
  });
}

const isCustomExercise = computed(() => form.exercise === "Other");

const AUTO_TIME_CANDIDATES = ["07:00", "12:00", "18:00", "20:00"];

function parseClockToMinutes(value) {
  const raw = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function formatMinutesToClock(totalMinutes) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Number(totalMinutes) || 0));
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isSportsScheduleItem(item) {
  const type = String(item?.itemType || "").toLowerCase();
  return ["workout", "exercise", "course", "course_session"].includes(type) || Boolean(item?.courseId);
}

function hasScheduleConflict(scheduleRows, dateKey, startMinutes, durationMinutes) {
  const endMinutes = startMinutes + Math.max(1, Number(durationMinutes) || 1);
  return scheduleRows.some((row) => {
    if (String(row?.date || "") !== dateKey) return false;
    if (!isSportsScheduleItem(row)) return false;
    const rowStart = parseClockToMinutes(row?.time);
    if (!Number.isFinite(rowStart)) return false;
    const rowDuration = Math.max(1, Number(row?.durationMinutes || 60));
    const rowEnd = rowStart + rowDuration;
    return startMinutes < rowEnd && rowStart < endMinutes;
  });
}

function pickAutoStartMinutes(scheduleRows, dateKey, durationMinutes) {
  for (const candidate of AUTO_TIME_CANDIDATES) {
    const mins = parseClockToMinutes(candidate);
    if (!Number.isFinite(mins)) continue;
    if (!hasScheduleConflict(scheduleRows, dateKey, mins, durationMinutes)) return mins;
  }
  const lastCandidate = parseClockToMinutes(AUTO_TIME_CANDIDATES[AUTO_TIME_CANDIDATES.length - 1]) ?? 20 * 60;
  let cursor = lastCandidate + 30;
  while (cursor <= 23 * 60 + 30) {
    if (!hasScheduleConflict(scheduleRows, dateKey, cursor, durationMinutes)) return cursor;
    cursor += 30;
  }
  return null;
}

function getCategoryByExercise(exercise) {
  if (exercise === "Other") return "Other";
  for (const group of EXERCISE_GROUPS) {
    if (group.options.includes(exercise)) return group.category;
  }
  return "Other";
}

async function loadPlans() {
  plans.value = await api.get("/workout/plan").then((r) => r.data);
}

async function focusPlanFromQuery() {
  const focusId = String(route.query.focusItem || route.query.favorite || "").trim();
  if (!focusId) return;
  const exists = plans.value.some((plan) => workoutItemId(plan) === focusId);
  if (!exists) return;
  focusedPlanId.value = focusId;
  await nextTick();
  const el = document.querySelector(`[data-plan-id="${focusId}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focusTimer) window.clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => {
    focusedPlanId.value = "";
  }, 2200);
}

async function loadProfile() {
  const { data } = await api.get("/user/profile");
  userWeight.value = typeof data?.weight === "number" ? data.weight : null;
  currentUserId.value = String(data?.id || data?._id || "");
}

async function loadTodayInfo() {
  const { data } = await api.get("/workout/day", { params: { date: selectedDate.value } });
  todayInfo.value = data;
}

const hasPlans = computed(() => plans.value.length > 0);
function normalizeDateKey(value) {
  return normalizeLocalDateKey(value);
}

function taskDateKey(task, fallbackDate = "") {
  return normalizeDateKey(
    task?.date ||
      task?.task_date ||
      task?.schedule_date ||
      task?.target_date ||
      task?.scheduled_for ||
      fallbackDate
  );
}

const workoutTasks = computed(() => {
  const rows = todayInfo.value.workout_tasks || todayInfo.value.tasks || [];
  const selectedKey = normalizeDateKey(selectedDate.value);
  const fallbackDate = normalizeDateKey(todayInfo.value?.date || selectedDate.value);
  return rows.filter((task) => taskDateKey(task, fallbackDate) === selectedKey);
});

const courseTasks = computed(() => {
  const rows = todayInfo.value.course_tasks || [];
  const selectedKey = normalizeDateKey(selectedDate.value);
  const fallbackDate = normalizeDateKey(todayInfo.value?.date || selectedDate.value);
  return rows.filter((task) => taskDateKey(task, fallbackDate) === selectedKey);
});
const todayTasks = computed(() => [...workoutTasks.value, ...courseTasks.value]);
const todayStatus = computed(() => {
  if (!todayTasks.value.length) {
    return hasPlans.value || todayInfo.value.hasAnyCourseEnrollment ? "No tasks" : "No workout scheduled";
  }
  return todayTasks.value.every((task) => isCompletedTask(task)) ? "Completed" : "Incomplete";
});
const canToggleTasks = computed(() => normalizeDateKey(selectedDate.value) === normalizeDateKey(todayDateKey.value));
const selectedDateKey = computed(() => normalizeDateKey(selectedDate.value));
const todayKey = computed(() => normalizeDateKey(todayDateKey.value));
const selectedDateMode = computed(() => {
  if (!selectedDateKey.value || !todayKey.value) return "today";
  const relation = compareDateKeys(selectedDateKey.value, todayKey.value);
  if (relation < 0) return "past";
  if (relation > 0) return "future";
  return "today";
});
const isPastSelectedDate = computed(() => selectedDateMode.value === "past");
const isFutureSelectedDate = computed(() => selectedDateMode.value === "future");
const isTodaySelectedDate = computed(() => selectedDateMode.value === "today");
const dateReadonlyHint = computed(() => {
  if (isPastSelectedDate.value) return "This is a past record. Tasks are read-only.";
  if (isFutureSelectedDate.value) return "This is a scheduled plan. Tasks cannot be completed yet.";
  return "";
});

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatKcal(value) {
  return `${Math.round(asNumber(value))} kcal`;
}

function getExerciseName(input) {
  return String(input?.exercise_name || input?.exerciseName || input?.type || "").trim();
}

function getDurationMinutes(input) {
  const raw = input?.duration_per_day ?? input?.durationPerDay ?? input?.duration;
  return asNumber(raw);
}

function getMetForExerciseName(name) {
  const direct = MET_MAP[name];
  if (direct) return direct;
  const lower = String(name || "").toLowerCase();
  const key = Object.keys(MET_MAP).find((k) => k.toLowerCase() === lower);
  return key ? MET_MAP[key] : 0;
}

function estimateBurnKcal(input) {
  const weight = asNumber(userWeight.value);
  if (weight <= 0) return 0;
  const met = getMetForExerciseName(getExerciseName(input));
  if (met <= 0) return 0;
  const hours = getDurationMinutes(input) / 60;
  return Math.max(0, met * weight * hours);
}

function isCompletedTask(task) {
  return task?.is_completed === true || task?.completed === true || String(task?.status || "").toLowerCase() === "completed";
}

function isCourseExerciseCompleted(exercise) {
  return String(exercise?.status || "") === "completed";
}

function isCourseExerciseInProgress(exercise) {
  return String(exercise?.status || "") === "in_progress";
}

function courseTaskKey(task) {
  return String(task?.enrolled_course_id || task?.course_id || task?._id || "");
}

function toggleCourseTaskExpanded(task) {
  const key = courseTaskKey(task);
  if (!key) return;
  const next = new Set(expandedCourseIds.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedCourseIds.value = next;
}

function isCourseTaskExpanded(task) {
  return expandedCourseIds.value.has(courseTaskKey(task));
}

function courseProgressText(task) {
  const done = Number(courseTaskCompletedCount(task));
  const total = Number(courseTaskTotalCount(task));
  return `Progress: ${done} / ${total} exercises completed`;
}

function courseTaskTotalCount(task) {
  return Math.max(0, Number(task?.total_exercises || (Array.isArray(task?.exercises) ? task.exercises.length : 0)));
}

function courseTaskCompletedCount(task) {
  if (Array.isArray(task?.exercises)) {
    return task.exercises.filter((exercise) => isCourseExerciseCompleted(exercise)).length;
  }
  return Math.max(0, Number(task?.completed_exercises || 0));
}

function hasCourseTaskStarted(task) {
  if (Array.isArray(task?.exercises)) {
    return task.exercises.some((exercise) => {
      const status = String(exercise?.status || "");
      return status === "in_progress" || status === "completed";
    });
  }
  const status = String(task?.status || "");
  return status === "in_progress" || status === "completed" || Number(task?.completed_exercises || 0) > 0;
}

function isCourseTaskFullyCompleted(task) {
  const total = courseTaskTotalCount(task);
  return total > 0 && courseTaskCompletedCount(task) >= total;
}

function courseMainActionLabel(task) {
  if (isPastSelectedDate.value) return "View Summary";
  if (isFutureSelectedDate.value) {
    return hasCourseTaskStarted(task) || isCourseTaskFullyCompleted(task) ? "View" : "Scheduled";
  }
  if (isCourseTaskFullyCompleted(task)) return "Completed";
  if (!hasCourseTaskStarted(task)) return "Start Course";
  return "Continue";
}

function shouldDisableCourseMainAction(task) {
  if (isFutureSelectedDate.value) return !hasCourseTaskStarted(task) && !isCourseTaskFullyCompleted(task);
  if (isPastSelectedDate.value) return false;
  return false;
}

function handleCourseMainAction(task) {
  if (isFutureSelectedDate.value && !hasCourseTaskStarted(task) && !isCourseTaskFullyCompleted(task)) return;
  if (isTodaySelectedDate.value && isCourseTaskFullyCompleted(task)) return;
  const key = courseTaskKey(task);
  if (!key) return;
  const next = new Set(expandedCourseIds.value);
  next.add(key);
  expandedCourseIds.value = next;
}

function courseExerciseMeta(exercise) {
  if (exercise?.type === "hold" && Number(exercise?.hold_seconds || 0) > 0) return `${exercise.hold_seconds} sec`;
  if (exercise?.type === "reps" && Number(exercise?.reps || 0) > 0) return `${exercise.reps} reps`;
  if (Number(exercise?.duration_minutes || 0) > 0) return `${exercise.duration_minutes} min`;
  return "";
}

function courseExerciseLoadingKey(task, exercise) {
  return `${courseTaskKey(task)}:${String(exercise?.exercise_id || "")}`;
}

function isRepsCourseExercise(exercise) {
  return String(exercise?.type || "").toLowerCase() === "reps";
}

function isTimerCourseExercise(exercise) {
  return !isRepsCourseExercise(exercise);
}

function getCourseExerciseDurationMinutes(exercise) {
  const minutes = Number(exercise?.duration_minutes || 0);
  if (minutes > 0) return Math.max(1, Math.round(minutes));
  const holdSeconds = Number(exercise?.hold_seconds || 0);
  if (holdSeconds > 0) return Math.max(1, Math.ceil(holdSeconds / 60));
  return 1;
}

function courseExerciseStatusLabel(exercise) {
  if (isFutureSelectedDate.value) return "Scheduled";
  if (isPastSelectedDate.value) return isCourseExerciseCompleted(exercise) ? "Completed" : "Missed";
  if (isCourseExerciseCompleted(exercise)) return "Completed";
  if (isCourseExerciseInProgress(exercise)) return "In Progress";
  return "Not Started";
}

function courseExerciseActionLabel(exercise) {
  if (!isTodaySelectedDate.value) return "";
  if (isCourseExerciseCompleted(exercise)) return "Completed";
  if (isCourseExerciseInProgress(exercise)) {
    return isRepsCourseExercise(exercise) ? "Complete" : "Continue Timer";
  }
  return "Start";
}

function getCourseTaskPlannedBurn(task) {
  if (Number.isFinite(Number(task?.estimated_burn))) return asNumber(task.estimated_burn);
  if (!Array.isArray(task?.exercises)) return 0;
  return task.exercises.reduce((sum, exercise) => sum + asNumber(exercise?.estimated_burn), 0);
}

function getCourseTaskCompletedBurn(task) {
  if (Number.isFinite(Number(task?.burned_so_far))) return asNumber(task.burned_so_far);
  if (!Array.isArray(task?.exercises)) return 0;
  return task.exercises.reduce((sum, exercise) => (isCourseExerciseCompleted(exercise) ? sum + asNumber(exercise?.estimated_burn) : sum), 0);
}

async function updateCourseExercise(task, exercise, nextStatus) {
  if (!canToggleTasks.value) {
    window.alert(isPastSelectedDate.value ? "Past records are read-only." : "Scheduled tasks cannot be completed yet.");
    return;
  }
  const enrolledId = task?.enrolled_course_id;
  const exerciseId = String(exercise?.exercise_id || "");
  if (!enrolledId || !exerciseId) return;
  const loadingKey = courseExerciseLoadingKey(task, exercise);
  courseExerciseLoadingKeys.value = new Set([...courseExerciseLoadingKeys.value, loadingKey]);
  try {
    await api.post("/courses/progress", {
      enrolled_course_id: enrolledId,
      date: todayInfo.value.date || selectedDate.value,
      exercise_id: exerciseId,
      exercise_status: nextStatus,
    });
    await loadTodayInfo();
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to update course exercise.";
  } finally {
    const next = new Set(courseExerciseLoadingKeys.value);
    next.delete(loadingKey);
    courseExerciseLoadingKeys.value = next;
  }
}

async function handleCourseExerciseAction(task, exercise) {
  if (!isTodaySelectedDate.value) return;
  if (isCourseExerciseCompleted(exercise)) return;
  if (isTimerCourseExercise(exercise)) {
    if (!isCourseExerciseInProgress(exercise)) {
      await updateCourseExercise(task, exercise, "in_progress");
    }
    router.push({
      path: "/workout/session",
      query: {
        sessionMode: "course_exercise",
        courseEnrolledId: String(task?.enrolled_course_id || ""),
        courseExerciseId: String(exercise?.exercise_id || ""),
        date: selectedDate.value,
        exercise: String(exercise?.title || "Course Exercise"),
        duration: String(getCourseExerciseDurationMinutes(exercise)),
        category: "Course",
        estimatedBurn: String(Math.round(asNumber(exercise?.estimated_burn))),
      },
    });
    return;
  }

  const nextStatus = isCourseExerciseInProgress(exercise) ? "completed" : "in_progress";
  await updateCourseExercise(task, exercise, nextStatus);
}

const plannedBurn = computed(() => {
  const workoutBurn = workoutTasks.value.reduce((sum, task) => sum + estimateBurnKcal(task), 0);
  const courseBurn = courseTasks.value.reduce((sum, task) => sum + getCourseTaskPlannedBurn(task), 0);
  return workoutBurn + courseBurn;
});

const burnedSoFar = computed(() => {
  const workoutBurn = workoutTasks.value.reduce((sum, task) => (isCompletedTask(task) ? sum + estimateBurnKcal(task) : sum), 0);
  const courseBurn = courseTasks.value.reduce((sum, task) => sum + getCourseTaskCompletedBurn(task), 0);
  return workoutBurn + courseBurn;
});

const showWeightUnavailableHint = computed(() => typeof userWeight.value !== "number" && workoutTasks.value.length > 0);

const hasCustomOrUnknownTask = computed(() =>
  workoutTasks.value.some((task) => getMetForExerciseName(getExerciseName(task)) <= 0)
);

function startWorkoutTask(task) {
  if (!isTodaySelectedDate.value) return;
  const planId = task.workout_plan_id || task.id || task._id;
  const scheduleItemId = task.schedule_item_id || "";
  if (!planId && !scheduleItemId) return;
  const taskId = buildWorkoutSessionTaskId({
    planId: planId ? String(planId) : "",
    scheduleItemId: scheduleItemId ? String(scheduleItemId) : "",
  });
  const saved = loadWorkoutSessionState({
    userId: currentUserId.value,
    taskId,
    date: selectedDate.value,
  });
  const remainingFromSaved =
    saved && saved.status === "in_progress" && saved.remainingTime > 0 ? saved.remainingTime : Number(task.remaining_seconds || 0);
  router.push({
    path: "/workout/session",
    query: {
      planId: planId ? String(planId) : "",
      scheduleItemId: scheduleItemId ? String(scheduleItemId) : "",
      date: selectedDate.value,
      exercise: task.exercise_name,
      duration: String(task.duration_per_day),
      category: task.category || "",
      remaining: remainingFromSaved > 0 ? String(remainingFromSaved) : "",
      estimatedBurn: String(Math.round(estimateBurnKcal(task))),
    },
  });
}

function taskRuntimeState(task) {
  const planId = task?.workout_plan_id || task?.id || task?._id;
  const scheduleItemId = task?.schedule_item_id || "";
  const taskId = buildWorkoutSessionTaskId({
    planId: planId ? String(planId) : "",
    scheduleItemId: scheduleItemId ? String(scheduleItemId) : "",
  });
  if (!taskId) return null;
  const saved = loadWorkoutSessionState({
    userId: currentUserId.value,
    taskId,
    date: selectedDate.value,
  });
  if (!saved || saved.status !== "in_progress" || saved.remainingTime <= 0) return null;
  return saved;
}

function taskSourceLabel(task) {
  if (task?.source_type === "manual_schedule" || task?.schedule_item_id) return "Manual";
  if (task?.is_custom) return "Custom";
  return "Plan";
}

function workoutActionLabel(task) {
  if (isFutureSelectedDate.value) return "Scheduled";
  if (isPastSelectedDate.value) return isCompletedTask(task) ? "Completed" : "Missed";
  if (taskRuntimeState(task)) return "Continue Timer";
  return "Start";
}

function workoutRuntimeStatusLabel(task) {
  if (!isTodaySelectedDate.value || isCompletedTask(task)) return "";
  const saved = taskRuntimeState(task);
  if (!saved) return "";
  return "In Progress";
}

function showCannotAddPastDateAlert() {
  window.alert("Cannot add to past date\n\nPast dates are read-only. Please choose today or a future date.");
}

async function savePlan() {
  if (isPastSelectedDate.value) {
    showCannotAddPastDateAlert();
    return;
  }
  error.value = "";
  success.value = "";
  if (isCustomExercise.value && !form.customExercise.trim()) {
    error.value = "Please enter a custom exercise name.";
    return;
  }

  saving.value = true;
  try {
    const exerciseName = isCustomExercise.value ? form.customExercise.trim() : form.exercise;
    const category = getCategoryByExercise(form.exercise);
    const me = await api.get("/users/me").then((r) => r.data).catch(() => null);
    const existingSchedules = me?.id
      ? await api.get(`/schedules/${me.id}`).then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => [])
      : [];
    const totalDays = Math.max(1, Number(form.days || 1));
    const durationMinutes = Math.max(1, Number(form.durationPerDay || 1));
    const selectedStartMinutes = form.startTime ? parseClockToMinutes(form.startTime) : null;
    if (form.startTime && !Number.isFinite(selectedStartMinutes)) {
      error.value = "Invalid start time.";
      return;
    }
    const plannedScheduleRows = [];
    for (let i = 0; i < totalDays; i += 1) {
      const d = new Date(`${selectedDate.value}T00:00:00`);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateValue = `${y}-${m}-${day}`;
      let startMinutes = selectedStartMinutes;
      if (!Number.isFinite(startMinutes)) {
        startMinutes = pickAutoStartMinutes(existingSchedules, dateValue, durationMinutes);
      }
      if (!Number.isFinite(startMinutes)) {
        error.value = `No available time slot on ${dateValue}.`;
        return;
      }
      if (Number.isFinite(selectedStartMinutes) && hasScheduleConflict(existingSchedules, dateValue, selectedStartMinutes, durationMinutes)) {
        window.alert("This time slot is already occupied. Please choose another time.");
        return;
      }
      const startTime = formatMinutesToClock(startMinutes);
      plannedScheduleRows.push({
        title: exerciseName,
        itemType: "workout",
        category,
        subtitle: `Plan Day ${i + 1}/${totalDays}`,
        date: dateValue,
        time: startTime,
        durationMinutes,
        overlapAccepted: true,
      });
      existingSchedules.push({
        date: dateValue,
        time: startTime,
        durationMinutes,
        itemType: "workout",
      });
    }
    const fixedTime = plannedScheduleRows[0]?.time || "07:00";
    const planRes = await api.post("/workout/plan", {
      exerciseName,
      category,
      durationPerDay: durationMinutes,
      days: totalDays,
      isCustom: isCustomExercise.value,
      startDate: selectedDate.value,
      fixedTime,
    });
    const createdPlanId = String(planRes?.data?._id || planRes?.data?.id || "");
    if (me?.id && plannedScheduleRows.length) {
      const items = plannedScheduleRows.map((row) => ({
        ...row,
        planId: createdPlanId || null,
      }));
      await api.post("/schedules/batch", { userId: me.id, items });
    }
    success.value = "Workout plan saved.";
    form.days = 7;
    form.durationPerDay = 30;
    form.startTime = "";
    form.exercise = "Running";
    form.customExercise = "";
    showForm.value = false;
    await loadPlans();
    await loadTodayInfo();
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to save workout plan.";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const routeDate = typeof route.query.date === "string" ? normalizeDateKey(route.query.date) : "";
  if (route.query.fromSession === "1" && routeDate) {
    selectedDate.value = routeDate;
  } else {
    selectedDate.value = getTodayLocalDate();
  }
  try {
    await Promise.all([loadPlans(), loadProfile(), loadTodayInfo(), ensureFavoritesLoaded()]);
    await focusPlanFromQuery();
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to load workout data.";
  }
});

onActivated(async () => {
  try {
    await Promise.all([loadProfile(), loadTodayInfo()]);
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to refresh workout data.";
  }
});

watch(
  () => route.query.focusItem,
  async () => {
    await focusPlanFromQuery();
  }
);

watch(
  () => route.query.date,
  async (nextDate) => {
    if (typeof nextDate !== "string" || !nextDate) return;
    const normalized = normalizeDateKey(nextDate);
    if (!normalized) return;
    if (route.query.fromSession === "1") {
      selectedDate.value = normalized;
    }
    await loadTodayInfo();
  }
);

async function handleDateChange(dateKey) {
  selectedDate.value = dateKey;
  await loadTodayInfo();
}
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">💪 Workout</h2>
    <WorkoutDateSlider :selected-date="selectedDate" @update:selectedDate="handleDateChange" />

    <section class="workout-layout">
      <article class="panel calories-panel">
        <h3>Goal for Selected Date</h3>
        <p class="goal-status" :class="{
          completed: todayStatus === 'Completed',
          incomplete: todayStatus === 'Incomplete'
        }">
          Status: {{ todayStatus }}
        </p>
        <p v-if="dateReadonlyHint" class="date-mode-hint">{{ dateReadonlyHint }}</p>

        <div class="task-section">
          <h4>Workout Tasks</h4>
          <div v-if="!workoutTasks.length" class="estimate-unavailable">No workout scheduled for this day</div>
          <ul v-else class="today-list">
            <li v-for="task in workoutTasks" :key="task.workout_plan_id || task.schedule_item_id || task.id || task._id" class="today-item">
              <div class="today-text">
                <strong>{{ task.exercise_name }}</strong>
                <span>- {{ task.duration_per_day }} min</span>
                <span class="task-source">{{ taskSourceLabel(task) }}</span>
                <span v-if="workoutRuntimeStatusLabel(task)" class="task-source">{{ workoutRuntimeStatusLabel(task) }}</span>
                <span class="task-kcal">Estimated burn: {{ formatKcal(estimateBurnKcal(task)) }}</span>
              </div>
              <div class="task-action">
                <button
                  v-if="!isCompletedTask(task) && (isTodaySelectedDate || isFutureSelectedDate)"
                  class="start-btn"
                  type="button"
                  :disabled="!isTodaySelectedDate"
                  @click="startWorkoutTask(task)"
                >
                  {{ workoutActionLabel(task) }}
                </button>
                <span v-else-if="isCompletedTask(task)" class="done-badge">Completed</span>
                <span v-else class="missed-badge">Missed</span>
              </div>
            </li>
          </ul>
        </div>

        <div class="task-section">
          <h4>Course Tasks</h4>
          <div v-if="!courseTasks.length" class="estimate-unavailable">No course task for this day</div>
          <ul v-else class="today-list">
            <li v-for="task in courseTasks" :key="task.enrolled_course_id" class="today-item course-task-item">
              <div class="today-text">
                <strong>{{ task.title }}</strong>
                <span>- Day {{ task.day }}/{{ task.duration_days }}</span>
                <span class="task-source">Course</span>
              </div>
              <div class="task-action">
                <button
                  v-if="isPastSelectedDate || isFutureSelectedDate || !isCourseTaskFullyCompleted(task)"
                  class="start-btn"
                  type="button"
                  :disabled="shouldDisableCourseMainAction(task)"
                  @click="handleCourseMainAction(task)"
                >
                  {{ courseMainActionLabel(task) }}
                </button>
                <span v-else class="done-badge">Completed</span>
              </div>
              <div v-if="Array.isArray(task.exercises) && task.exercises.length" class="course-task-detail">
                <div class="course-task-summary">
                  <span>{{ courseProgressText(task) }}</span>
                  <span>Burned: {{ formatKcal(task.burned_so_far || 0) }} / {{ formatKcal(task.estimated_burn || 0) }}</span>
                </div>
                <ul v-if="isCourseTaskExpanded(task)" class="course-exercise-list">
                  <li
                    v-for="exercise in task.exercises"
                    :key="exercise.exercise_id"
                    class="course-exercise-item"
                  >
                    <div class="course-exercise-text">
                      <strong>{{ exercise.title }}</strong>
                      <span v-if="courseExerciseMeta(exercise)">- {{ courseExerciseMeta(exercise) }}</span>
                      <span class="task-kcal">Estimated burn: {{ formatKcal(exercise.estimated_burn || 0) }}</span>
                      <span class="task-source">{{ courseExerciseStatusLabel(exercise) }}</span>
                    </div>
                    <div class="task-action">
                      <button
                        v-if="!isCourseExerciseCompleted(exercise) && isTodaySelectedDate"
                        class="start-btn"
                        type="button"
                        :disabled="courseExerciseLoadingKeys.has(courseExerciseLoadingKey(task, exercise))"
                        @click="handleCourseExerciseAction(task, exercise)"
                      >
                        {{ courseExerciseActionLabel(exercise) }}
                      </button>
                      <span v-else-if="isCourseExerciseCompleted(exercise)" class="done-badge">Completed</span>
                      <span v-else-if="isFutureSelectedDate" class="scheduled-badge">Scheduled</span>
                      <span v-else class="missed-badge">Missed</span>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </div>
        <div class="calories-block">
          <h4>Workout Tracking</h4>
          <p class="muted">Based on your saved body weight and workout duration.</p>
          <div v-if="showWeightUnavailableHint" class="estimate-unavailable">
            Weight not available. Please complete your profile first.
          </div>
          <div class="estimation-grid">
            <div class="estimate-wrap">
              <div class="estimate-label">Planned Burn</div>
              <div class="estimate-value">{{ formatKcal(plannedBurn) }}</div>
            </div>
            <div class="estimate-wrap">
              <div class="estimate-label">Burned So Far</div>
              <div class="estimate-value">{{ formatKcal(burnedSoFar) }}</div>
            </div>
          </div>
          <p v-if="hasCustomOrUnknownTask" class="muted custom-note">
            Some custom exercises use 0 kcal until a mapped type is provided.
          </p>
        </div>
      </article>

      <article class="panel plan-panel">
        <div class="plan-header">
          <h3>📋 Add Workout Plan</h3>
          <button
            class="add-btn"
            type="button"
            :disabled="isPastSelectedDate"
            :title="isPastSelectedDate ? 'Past dates are read-only' : ''"
            @click="showForm = !showForm"
          >
            {{ showForm ? "Close" : "+ Add Workout Plan" }}
          </button>
        </div>
        <p v-if="isPastSelectedDate" class="muted add-plan-disabled-hint">Past dates are read-only.</p>
        <p class="muted">You can add exercises here, and join courses from the Courses page.</p>

        <form v-if="showForm" novalidate @submit.prevent="savePlan">
          <label>
            Exercise
            <select v-model="form.exercise" required>
              <optgroup v-for="group in EXERCISE_GROUPS" :key="group.category" :label="group.category">
                <option v-for="option in group.options" :key="option" :value="option">
                  {{ option }}
                </option>
              </optgroup>
              <option value="Other">Other</option>
            </select>
          </label>

          <label v-if="isCustomExercise">
            Custom exercise name
            <input v-model.trim="form.customExercise" type="text" placeholder="Type your exercise" required />
          </label>

          <div class="grid grid-2">
            <label>
              Days
              <input v-model.number="form.days" type="number" min="1" max="30" required />
            </label>
            <label>
              Duration per day (minutes)
              <input v-model.number="form.durationPerDay" type="number" min="1" required />
            </label>
          </div>

          <label>
            Start time (optional)
            <input v-model="form.startTime" type="time" />
          </label>

          <button type="submit" :disabled="saving || isPastSelectedDate">{{ saving ? "Saving..." : "Save Plan" }}</button>
        </form>

        <p v-if="error" class="error-text">{{ error }}</p>
        <p v-if="success" class="success-text">{{ success }}</p>

        <section class="plan-list">
          <article
            v-for="plan in plans"
            :key="plan.id || plan._id"
            class="card"
            :class="{ focused: focusedPlanId === workoutItemId(plan) }"
            :data-plan-id="workoutItemId(plan)"
          >
            <div class="plan-row-head">
              <button type="button" class="tiny-fav-btn" :class="{ active: isWorkoutFavorited(plan) }" @click="toggleWorkoutFavorite(plan)">
                {{ isWorkoutFavorited(plan) ? "★ Saved" : "☆ Save" }}
              </button>
            </div>
            <h4>{{ plan.exercise_name || plan.exerciseName }}</h4>
            <p>Category: {{ plan.category }}</p>
            <p>Days: {{ plan.days }}</p>
            <p>Duration / day: {{ plan.duration_per_day || plan.durationPerDay }} min</p>
            <p>Estimated burn: {{ formatKcal(estimateBurnKcal(plan)) }}</p>
          </article>
        </section>
      </article>
    </section>
  </main>
</template>

<style scoped>
.workout-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.calories-panel {
  flex: 0 0 35%;
}

.plan-panel {
  flex: 0 0 65%;
}

.plan-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}

.add-btn {
  font-weight: 600;
}

.add-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.add-plan-disabled-hint {
  margin-top: -2px;
}

.estimate-wrap {
  text-align: center;
  padding: 14px;
  border-radius: 14px;
  background: linear-gradient(140deg, rgba(72, 174, 164, 0.15), rgba(49, 104, 121, 0.2));
}

.estimation-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 16px;
}

.estimate-label {
  color: var(--c5);
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 4px;
}

.estimate-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--c6);
  line-height: 1.2;
}

.goal-status {
  margin: 10px 0 14px;
  font-weight: 700;
}

.goal-status.completed {
  color: #1d7f4d;
}

.goal-status.incomplete {
  color: #b45309;
}

.date-mode-hint {
  margin: -6px 0 12px;
  color: #486170;
  font-size: 12px;
}

.task-section {
  margin-top: 12px;
}

.task-section h4 {
  margin: 0 0 8px;
}

.today-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}

.today-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f2f7f7;
}

.course-task-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.course-task-detail {
  grid-column: 1 / -1;
  margin-top: 8px;
  border-top: 1px solid #d7e7e6;
  padding-top: 8px;
  display: grid;
  gap: 8px;
}

.course-task-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: #486170;
  font-size: 12px;
}

.course-exercise-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.course-exercise-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #dbe7e6;
}

.course-exercise-text {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.today-text {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.task-action {
  flex: 0 0 108px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.task-kcal {
  color: var(--c5);
  font-size: 12px;
}

.task-source {
  font-size: 11px;
  color: #2f4858;
  background: #e5f2ef;
  border: 1px solid #c9e1dc;
  border-radius: 999px;
  padding: 1px 8px;
}

.start-btn {
  border: none;
  background: linear-gradient(90deg, var(--c4), var(--c5));
  color: #fff;
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 600;
  cursor: pointer;
  min-width: 94px;
  text-align: center;
}

.start-btn:hover {
  filter: brightness(1.06);
}

.start-btn:disabled {
  cursor: not-allowed;
  filter: grayscale(0.18);
  opacity: 0.72;
}

.done-badge {
  background: #e4f4ee;
  color: #1b7e5a;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  min-width: 94px;
  text-align: center;
}

.scheduled-badge,
.missed-badge {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  min-width: 94px;
  text-align: center;
}

.scheduled-badge {
  background: #e7f0ef;
  color: #486170;
}

.missed-badge {
  background: #eceff1;
  color: #6b7280;
}

.calories-block {
  margin-top: 16px;
}

.custom-note {
  margin-top: 8px;
}

.estimate-unavailable {
  margin-top: 16px;
  padding: 20px;
  border-radius: 12px;
  color: var(--c6);
  background: #eef5f5;
  font-weight: 600;
  text-align: center;
}

.plan-list {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

.plan-list .card.focused {
  border-color: #4ab7a1;
  box-shadow: 0 0 0 2px rgba(72, 174, 164, 0.2);
  background: #f8fefd;
}

.plan-row-head {
  display: flex;
  justify-content: flex-end;
}

.tiny-fav-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #d7e7e6;
  background: #f3f8f7;
  color: var(--c6);
  font-size: 12px;
}

.tiny-fav-btn.active {
  background: #fff8e5;
  border-color: #e7ce8d;
  color: #9a6a00;
}

.error-text {
  color: #b03a48;
}

.success-text {
  color: #24785e;
}

@media (max-width: 960px) {
  .workout-layout {
    flex-direction: column;
  }

  .calories-panel,
  .plan-panel {
    flex-basis: 100%;
    width: 100%;
  }

}
</style>

