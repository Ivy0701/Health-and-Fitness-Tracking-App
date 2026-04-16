<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import api from "../services/api";
import ArcCountdownTimer from "../components/workout/ArcCountdownTimer.vue";

const route = useRoute();
const router = useRouter();

const planId = ref(String(route.query.planId || ""));
const scheduleItemId = ref(String(route.query.scheduleItemId || ""));
const sessionMode = ref(String(route.query.sessionMode || ""));
const courseEnrolledId = ref(String(route.query.courseEnrolledId || ""));
const courseExerciseId = ref(String(route.query.courseExerciseId || ""));
const selectedDate = ref(String(route.query.date || new Date().toISOString().slice(0, 10)));
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

const totalSeconds = computed(() => Math.max(0, Number(durationMinutes.value) * 60));
const isCourseExerciseSession = computed(
  () => sessionMode.value === "course_exercise" && Boolean(courseEnrolledId.value) && Boolean(courseExerciseId.value)
);
const remainingSeconds = ref(0);
let timerId = null;

function stopInterval() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
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
    remainingSeconds.value =
      initialRemainingSeconds.value > 0 ? initialRemainingSeconds.value : totalSeconds.value;
  }
  if (running.value) return;
  running.value = true;
  stopInterval();
  timerId = setInterval(tick, 1000);
}

function pauseTimer() {
  running.value = false;
  stopInterval();
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
      doneMessage.value = isCompleted
        ? "Course exercise completed!"
        : "Progress saved. Continue this course exercise later.";
      setTimeout(() => {
        router.push({ path: "/workout", query: { date: selectedDate.value } });
      }, 900);
      return;
    }
    const payload = {
      date: selectedDate.value,
      is_completed: isCompleted,
      remaining_seconds: isCompleted ? 0 : remainingSeconds.value,
    };
    if (scheduleItemId.value) {
      payload.schedule_item_id = scheduleItemId.value;
    } else {
      payload.workout_plan_id = planId.value;
    }
    await api.post("/workout/today/status", payload);
    doneMessage.value = isCompleted
      ? "Workout completed!"
      : "Progress saved. You can continue this workout later.";
    setTimeout(() => {
      router.push({ path: "/workout", query: { date: selectedDate.value } });
    }, 900);
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to complete workout.";
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  stopInterval();
  router.push({ path: "/workout", query: { date: selectedDate.value } });
}

onMounted(async () => {
  await loadTaskFallback();
  remainingSeconds.value =
    initialRemainingSeconds.value > 0 ? initialRemainingSeconds.value : totalSeconds.value;
  if (initialRemainingSeconds.value > 0 && initialRemainingSeconds.value < totalSeconds.value) {
    started.value = true;
  }
});

onBeforeUnmount(() => {
  stopInterval();
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
      </div>

      <ArcCountdownTimer :total-seconds="totalSeconds" :remaining-seconds="remainingSeconds" />

      <div class="actions">
        <button v-if="!started" type="button" class="btn-primary" @click="startTimer">Start</button>
        <button v-else-if="running" type="button" class="btn-muted" @click="pauseTimer">Pause</button>
        <button v-else type="button" class="btn-primary" @click="startTimer">Resume</button>
        <button type="button" class="btn-finish" :disabled="submitting" @click="finishWorkout(true)">Complete Early</button>
        <button type="button" class="btn-muted" @click="goBack">Cancel</button>
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
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
  background: #e9efee;
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
</style>
