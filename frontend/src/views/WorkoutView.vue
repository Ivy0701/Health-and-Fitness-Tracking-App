<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import WorkoutDateSlider from "../components/workout/WorkoutDateSlider.vue";
import api from "../services/api";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const showForm = ref(false);
const saving = ref(false);
const plans = ref([]);
const error = ref("");
const success = ref("");
const userWeight = ref(null);
const todayInfo = ref({
  date: "",
  hasAnyPlan: false,
  hasAnyCourseEnrollment: false,
  status: "No workout scheduled",
  tasks: [],
  workout_tasks: [],
  course_tasks: [],
});
const selectedDate = ref(new Date().toISOString().slice(0, 10));
const todayDateKey = new Date().toISOString().slice(0, 10);

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
});

const isCustomExercise = computed(() => form.exercise === "Other");

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

async function loadProfile() {
  const { data } = await api.get("/user/profile");
  userWeight.value = typeof data?.weight === "number" ? data.weight : null;
}

async function loadTodayInfo() {
  const { data } = await api.get("/workout/day", { params: { date: selectedDate.value } });
  todayInfo.value = data;
}

const hasPlans = computed(() => plans.value.length > 0);
const workoutTasks = computed(() => todayInfo.value.workout_tasks || todayInfo.value.tasks || []);
const courseTasks = computed(() => todayInfo.value.course_tasks || []);
const todayTasks = computed(() => [...workoutTasks.value, ...courseTasks.value]);
const todayStatus = computed(() => {
  if (!hasPlans.value && !todayInfo.value.hasAnyCourseEnrollment) return "No workout scheduled";
  if (!todayTasks.value.length) return "No tasks";
  return todayInfo.value.status;
});
const canToggleTasks = computed(() => selectedDate.value === todayDateKey);

const knownCalories = computed(() => {
  if (!workoutTasks.value.length || typeof userWeight.value !== "number") return null;
  const total = workoutTasks.value.reduce((sum, task) => {
    const met = MET_MAP[task.exercise_name];
    if (!met) return sum;
    const hours = Number(task.duration_per_day || 0) / 60;
    return sum + met * userWeight.value * hours;
  }, 0);
  return Math.round(total);
});

const hasCustomOrUnknownTask = computed(() =>
  workoutTasks.value.some((task) => !MET_MAP[task.exercise_name])
);

function startWorkoutTask(task) {
  const planId = task.workout_plan_id || task.id || task._id;
  if (!planId) return;
  router.push({
    path: "/workout/session",
    query: {
      planId: String(planId),
      date: selectedDate.value,
      exercise: task.exercise_name,
      duration: String(task.duration_per_day),
      category: task.category || "",
      remaining: task.remaining_seconds != null ? String(task.remaining_seconds) : "",
    },
  });
}

function workoutActionLabel(task) {
  const total = Number(task.duration_per_day || 0) * 60;
  const remaining = Number(task.remaining_seconds);
  if (Number.isFinite(remaining) && remaining > 0 && remaining < total) return "Continue";
  return "Start";
}

async function toggleCourseTask(task) {
  if (!canToggleTasks.value) {
    window.alert("You can only check plans for today!");
    return;
  }
  const enrolledId = task.enrolled_course_id;
  if (!enrolledId) return;
  try {
    await api.post("/courses/progress", {
      enrolled_course_id: enrolledId,
      date: todayInfo.value.date,
      is_completed: !task.is_completed,
    });
    await loadTodayInfo();
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to update course status.";
  }
}

async function savePlan() {
  error.value = "";
  success.value = "";
  if (isCustomExercise.value && !form.customExercise.trim()) {
    error.value = "Please enter a custom exercise name.";
    return;
  }

  saving.value = true;
  try {
    await api.post("/workout/plan", {
      exerciseName: isCustomExercise.value ? form.customExercise.trim() : form.exercise,
      category: getCategoryByExercise(form.exercise),
      durationPerDay: Number(form.durationPerDay),
      days: Number(form.days),
      isCustom: isCustomExercise.value,
    });
    success.value = "Workout plan saved.";
    form.days = 7;
    form.durationPerDay = 30;
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
  if (typeof route.query.date === "string" && route.query.date) {
    selectedDate.value = route.query.date;
  }
  try {
    await Promise.all([loadPlans(), loadProfile(), loadTodayInfo()]);
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to load workout data.";
  }
});

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

        <div class="task-section">
          <h4>Workout Tasks</h4>
          <div v-if="!workoutTasks.length" class="estimate-unavailable">No workout scheduled for this day</div>
          <ul v-else class="today-list">
            <li v-for="task in workoutTasks" :key="task.workout_plan_id || task.id || task._id" class="today-item">
              <div class="today-text">
                <strong>{{ task.exercise_name }}</strong>
                <span>- {{ task.duration_per_day }} min</span>
              </div>
              <button
                v-if="!task.is_completed"
                class="start-btn"
                type="button"
                @click="startWorkoutTask(task)"
              >
                {{ workoutActionLabel(task) }}
              </button>
              <span v-else class="done-badge">Completed</span>
            </li>
          </ul>
        </div>

        <div class="task-section">
          <h4>Course Tasks</h4>
          <div v-if="!courseTasks.length" class="estimate-unavailable">No course task for this day</div>
          <ul v-else class="today-list">
            <li v-for="task in courseTasks" :key="task.enrolled_course_id" class="today-item">
              <div class="today-text">
                <strong>{{ task.title }}</strong>
                <span>- Day {{ task.day }}/{{ task.duration_days }}</span>
              </div>
              <button
                class="check-btn"
                type="button"
                @click="toggleCourseTask(task)"
              >
                {{ task.is_completed ? "☑" : "☐" }}
              </button>
            </li>
          </ul>
        </div>
        <div v-if="workoutTasks.length" class="calories-block">
          <h4>Calories Estimation</h4>
          <p class="muted">Based on your saved body weight and workout duration.</p>
          <div v-if="typeof userWeight !== 'number'" class="estimate-unavailable">
            Weight not available. Please complete your profile first.
          </div>
          <div v-else class="estimate-wrap">
            <div class="estimate-kcal">{{ knownCalories ?? 0 }}</div>
            <div class="estimate-unit">kcal / day</div>
          </div>
          <p v-if="hasCustomOrUnknownTask" class="muted custom-note">
            Calories estimation not available for custom exercise.
          </p>
        </div>
      </article>

      <article class="panel plan-panel">
        <div class="plan-header">
          <h3>📋 Add Workout Plan</h3>
          <button class="add-btn" type="button" @click="showForm = !showForm">
            {{ showForm ? "Close" : "+ Add Workout Plan" }}
          </button>
        </div>
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

          <button type="submit" :disabled="saving">{{ saving ? "Saving..." : "Save Plan" }}</button>
        </form>

        <p v-if="error" class="error-text">{{ error }}</p>
        <p v-if="success" class="success-text">{{ success }}</p>

        <section class="plan-list">
          <article v-for="plan in plans" :key="plan.id || plan._id" class="card">
            <h4>{{ plan.exercise_name || plan.exerciseName }}</h4>
            <p>Category: {{ plan.category }}</p>
            <p>Days: {{ plan.days }}</p>
            <p>Duration / day: {{ plan.duration_per_day || plan.durationPerDay }} min</p>
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

.estimate-wrap {
  margin-top: 16px;
  text-align: center;
  padding: 20px;
  border-radius: 14px;
  background: linear-gradient(140deg, rgba(72, 174, 164, 0.15), rgba(49, 104, 121, 0.2));
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

.today-text {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.check-btn {
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--c6);
}

.start-btn {
  border: none;
  background: linear-gradient(90deg, var(--c4), var(--c5));
  color: #fff;
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 600;
  cursor: pointer;
}

.start-btn:hover {
  filter: brightness(1.06);
}

.done-badge {
  background: #e4f4ee;
  color: #1b7e5a;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.calories-block {
  margin-top: 16px;
}

.custom-note {
  margin-top: 8px;
}

.estimate-kcal {
  font-size: 48px;
  font-weight: 700;
  color: var(--c6);
  line-height: 1;
}

.estimate-unit {
  margin-top: 8px;
  font-size: 18px;
  color: var(--c5);
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

