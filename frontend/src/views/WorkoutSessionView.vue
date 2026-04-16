<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import api from "../services/api";
import ArcCountdownTimer from "../components/workout/ArcCountdownTimer.vue";
import { buildWorkoutSessionTaskId, loadWorkoutSessionState, saveWorkoutSessionState } from "../utils/workoutSessionState";
import { getTodayLocalDate } from "../utils/dateLocal";

const route = useRoute();
const router = useRouter();

const planId = ref(String(route.query.planId || ""));
const scheduleItemId = ref(String(route.query.scheduleItemId || ""));
const sessionMode = ref(String(route.query.sessionMode || ""));
const courseEnrolledId = ref(String(route.query.courseEnrolledId || ""));
const courseExerciseId = ref(String(route.query.courseExerciseId || ""));
const selectedDate = ref(String(route.query.date || getTodayLocalDate()));
const exerciseName = ref(String(route.query.exercise || ""));
const durationMinutes = ref(Number(route.query.duration || 0));
const category = ref(String(route.query.category || ""));
const initialRemainingSeconds = ref(Number(route.query.remaining || 0));
const estimatedBurn = ref(Number(route.query.estimatedBurn || 0));

const started = ref(false);
const running = ref(false);
const submitting = ref(false);
const error = ref("");
const doneMessage = ref("");
const currentUserId = ref("");
const exiting = ref(false);
const completed = ref(false);

const totalSeconds = computed(() => Math.max(0, Number(durationMinutes.value) * 60));
const isCourseExerciseSession = computed(
  () => sessionMode.value === "course_exercise" && Boolean(courseEnrolledId.value) && Boolean(courseExerciseId.value)
);
const remainingSeconds = ref(0);
const workoutTaskId = computed(() =>
  buildWorkoutSessionTaskId({
    planId: planId.value,
    scheduleItemId: scheduleItemId.value,
    sessionMode: sessionMode.value,
    courseEnrolledId: courseEnrolledId.value,
    courseExerciseId: courseExerciseId.value,
  })
);
const sessionStatusText = computed(() => {
  if (!started.value) return "Ready";
  return running.value ? "Running" : "Paused";
});
const isPausedState = computed(() => started.value && !running.value && remainingSeconds.value > 0);
let timerId = null;

function stopInterval() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function saveLocalSessionState(status = "in_progress") {
  if (!currentUserId.value || !workoutTaskId.value) return;
  saveWorkoutSessionState({
    userId: currentUserId.value,
    taskId: workoutTaskId.value,
    state: {
      status,
      remainingTime: remainingSeconds.value,
      totalDuration: totalSeconds.value,
      isPaused: status === "completed" ? false : !running.value,
      exerciseId: workoutTaskId.value,
      date: selectedDate.value,
    },
  });
}

async function persistRemoteInProgress() {
  if (!started.value || completed.value || remainingSeconds.value <= 0) return;
  if (isCourseExerciseSession.value) {
    await api.post("/courses/progress", {
      enrolled_course_id: courseEnrolledId.value,
      date: selectedDate.value,
      exercise_id: courseExerciseId.value,
      exercise_status: "in_progress",
    });
    return;
  }
  if (!planId.value && !scheduleItemId.value) return;
  const payload = {
    date: selectedDate.value,
    is_completed: false,
    remaining_seconds: remainingSeconds.value,
    task_status: running.value ? "in_progress" : "paused",
  };
  if (scheduleItemId.value) payload.schedule_item_id = scheduleItemId.value;
  else payload.workout_plan_id = planId.value;
  await api.post("/workout/today/status", payload);
}

function tick() {
  if (remainingSeconds.value <= 0) {
    stopInterval();
    running.value = false;
    finishWorkout(true);
    return;
  }
  remainingSeconds.value -= 1;
}

function startTimer() {
  if (!totalSeconds.value) return;
  if (!started.value) {
    started.value = true;
    remainingSeconds.value = initialRemainingSeconds.value > 0 ? initialRemainingSeconds.value : totalSeconds.value;
  }
  if (running.value) return;
  running.value = true;
  stopInterval();
  timerId = setInterval(tick, 1000);
  saveLocalSessionState("in_progress");
  persistRemoteInProgress().catch(() => null);
}

function pauseTimer() {
  running.value = false;
  stopInterval();
  saveLocalSessionState("paused");
  persistRemoteInProgress().catch(() => null);
}

async function loadTaskFallback() {
  if (!planId.value || (exerciseName.value && durationMinutes.value)) return;
  try {
    const { data } = await api.get(`/workout/task/${planId.value}`);
    exerciseName.value = data.exercise_name || data.exerciseName || exerciseName.value;
    durationMinutes.value = Number(data.duration_per_day || data.durationPerDay || durationMinutes.value || 0);
    category.value = data.category || category.value;
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to load workout task.";
  }
}

async function loadCurrentUser() {
  try {
    const user = await api.get("/users/me").then((r) => r.data);
    currentUserId.value = String(user?.id || user?._id || "");
  } catch {
    currentUserId.value = "";
  }
}

async function finishWorkout(autoDone = false) {
  if ((!planId.value && !scheduleItemId.value && !isCourseExerciseSession.value) || submitting.value) return;
  submitting.value = true;
  stopInterval();
  running.value = false;
  try {
    const isCompleted = autoDone || remainingSeconds.value <= 0;
    if (isCourseExerciseSession.value) {
      await api.post("/courses/progress", {
        enrolled_course_id: courseEnrolledId.value,
        date: selectedDate.value,
        exercise_id: courseExerciseId.value,
        exercise_status: isCompleted ? "completed" : "in_progress",
      });
      doneMessage.value = isCompleted ? "Course exercise completed!" : "Progress saved. Continue this course exercise later.";
      if (isCompleted) {
        completed.value = true;
        saveLocalSessionState("completed");
      } else {
        saveLocalSessionState("in_progress");
      }
      setTimeout(() => {
        router.push({ path: "/workout", query: { date: selectedDate.value, fromSession: "1" } });
      }, 900);
      return;
    }
    const payload = {
      date: selectedDate.value,
      is_completed: isCompleted,
      remaining_seconds: isCompleted ? 0 : remainingSeconds.value,
      task_status: isCompleted ? "completed" : "in_progress",
    };
    if (scheduleItemId.value) payload.schedule_item_id = scheduleItemId.value;
    else payload.workout_plan_id = planId.value;
    await api.post("/workout/today/status", payload);
    doneMessage.value = isCompleted ? "Workout completed!" : "Progress saved. You can continue this workout later.";
    if (isCompleted) {
      completed.value = true;
      saveLocalSessionState("completed");
    } else {
      saveLocalSessionState("paused");
    }
    setTimeout(() => {
      router.push({ path: "/workout", query: { date: selectedDate.value, fromSession: "1" } });
    }, 900);
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to complete workout.";
  } finally {
    submitting.value = false;
  }
}

async function goBack() {
  stopInterval();
  running.value = false;
  if (started.value && !completed.value && remainingSeconds.value > 0) {
    saveLocalSessionState("paused");
    await persistRemoteInProgress().catch(() => null);
  }
  exiting.value = true;
  router.push({ path: "/workout", query: { date: selectedDate.value, fromSession: "1" } });
}

onMounted(async () => {
  await Promise.all([loadCurrentUser(), loadTaskFallback()]);
  remainingSeconds.value = initialRemainingSeconds.value > 0 ? initialRemainingSeconds.value : totalSeconds.value;

  const saved = loadWorkoutSessionState({
    userId: currentUserId.value,
    taskId: workoutTaskId.value,
    date: selectedDate.value,
  });
  if (saved && ["in_progress", "paused"].includes(String(saved.status || "")) && saved.remainingTime > 0) {
    started.value = true;
    remainingSeconds.value = saved.remainingTime;
    if (saved.isPaused) {
      running.value = false;
      stopInterval();
    } else {
      running.value = true;
      stopInterval();
      timerId = setInterval(tick, 1000);
    }
    return;
  }

  if (initialRemainingSeconds.value > 0 && initialRemainingSeconds.value < totalSeconds.value) {
    started.value = true;
  }
});

onBeforeUnmount(() => {
  stopInterval();
  running.value = false;
  if (!exiting.value && started.value && !completed.value && remainingSeconds.value > 0) {
    saveLocalSessionState("paused");
    persistRemoteInProgress().catch(() => null);
  }
});

onBeforeRouteLeave(() => {
  if (started.value && !completed.value && remainingSeconds.value > 0) {
    running.value = false;
    saveLocalSessionState("paused");
    persistRemoteInProgress().catch(() => null);
  }
});
</script>

<template>
  <main class="page">
    <section class="panel session-panel">
      <div class="head">
        <button type="button" class="btn-muted" @click="goBack">Back</button>
        <h2>Workout Session</h2>
      </div>

      <div class="meta">
        <p><strong>Exercise:</strong> {{ exerciseName || "-" }}</p>
        <p><strong>Duration:</strong> {{ durationMinutes || 0 }} min</p>
        <p><strong>Estimated Burn:</strong> {{ Math.max(0, Math.round(estimatedBurn || 0)) }} kcal</p>
        <p><strong>Date:</strong> {{ selectedDate }}</p>
        <p v-if="category"><strong>Category:</strong> {{ category }}</p>
        <p><strong>Status:</strong> {{ sessionStatusText }}</p>
      </div>

      <div :class="{ 'timer-paused': isPausedState }">
        <ArcCountdownTimer :total-seconds="totalSeconds" :remaining-seconds="remainingSeconds" />
      </div>

      <div class="actions">
        <button v-if="!started" type="button" class="btn-primary" @click="startTimer">Start</button>
        <button v-else-if="running" type="button" class="btn-muted" @click="pauseTimer">Pause</button>
        <button v-else type="button" class="btn-primary" @click="startTimer">Resume</button>
        <button type="button" class="btn-finish" :disabled="submitting" @click="finishWorkout(true)">Complete Early</button>
        <button type="button" class="btn-muted" @click="goBack">Back</button>
      </div>

      <p v-if="doneMessage" class="success">{{ doneMessage }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </main>
</template>

<style scoped>
.session-panel {
  max-width: 760px;
  margin: 24px auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.head h2 {
  margin: 0;
}
.meta {
  margin-bottom: 12px;
  color: var(--c6);
}
.actions {
  margin-top: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.btn-primary {
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(90deg, var(--c4), var(--c5));
}
.btn-muted {
  border: 1px solid #48aea4;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
  background: transparent;
  color: #348b93;
  font-weight: 500;
  opacity: 1;
}
.btn-muted:hover {
  background: #e6f5f3;
  border-color: #48aea4;
  color: #2f7c83;
}
.btn-muted:active {
  background: #d2eeea;
}
.btn-finish {
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(90deg, #2e9e8b, #1f7d6c);
}
.success {
  color: #117a52;
  margin-top: 10px;
}
.error {
  color: #b42318;
  margin-top: 10px;
}
.timer-paused {
  opacity: 0.72;
  filter: grayscale(0.22);
}
</style>
