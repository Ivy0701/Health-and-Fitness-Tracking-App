<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const DEFAULT_WEIGHT_KG = 70;
const showForm = ref(false);
const saving = ref(false);
const plans = ref([]);
const error = ref("");
const success = ref("");

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
const selectedMet = computed(() => MET_MAP[form.exercise] || null);
const caloriesEstimate = computed(() => {
  if (!selectedMet.value || !form.durationPerDay) return null;
  const hours = Number(form.durationPerDay) / 60;
  return Math.round(selectedMet.value * DEFAULT_WEIGHT_KG * hours);
});

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
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to save workout plan.";
  } finally {
    saving.value = false;
  }
}

onMounted(loadPlans);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">💪 Workout</h2>

    <section class="workout-layout">
      <article class="panel calories-panel">
        <h3>🔥 Calories Auto Estimation</h3>
        <p class="muted">Based on {{ DEFAULT_WEIGHT_KG }} kg and duration per day.</p>
        <div v-if="isCustomExercise" class="estimate-unavailable">Calories estimation not available</div>
        <div v-else class="estimate-wrap">
          <div class="estimate-kcal">{{ caloriesEstimate ?? 0 }}</div>
          <div class="estimate-unit">kcal / day</div>
        </div>
      </article>

      <article class="panel plan-panel">
        <div class="plan-header">
          <h3>📋 Add Workout Plan</h3>
          <button class="add-btn" type="button" @click="showForm = !showForm">
            {{ showForm ? "Close" : "+ Add Workout Plan" }}
          </button>
        </div>

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

