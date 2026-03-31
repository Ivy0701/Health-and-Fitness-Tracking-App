<script setup>
import { computed, onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import BmiCalculatorPanel from "../components/BmiCalculatorPanel.vue";
import api from "../services/api";
import { useBmiStore } from "../stores/bmi";
import { formatBmiForDisplay } from "../utils/bmi";

const data = ref(null);
const bmiStore = useBmiStore();
const bmiPanelOpen = ref(false);

const displayLatestBmi = computed(() => {
  if (bmiStore.sessionBmi) return bmiStore.sessionBmi;
  const v = data.value?.latestBmi?.bmi;
  const formatted = formatBmiForDisplay(v);
  return formatted ?? "-";
});

onMounted(async () => {
  const res = await api.get("/dashboard/overview");
  data.value = res.data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">📊 Dashboard Overview</h2>
    <div v-if="data" class="grid grid-2">
      <article class="card">💪 Today Workout: <strong>{{ data.todayWorkoutMinutes }}</strong> min</article>
      <article class="card">📚 Available Courses: <strong>{{ data.todayCoursesCount }}</strong></article>
      <article class="card">🔥 Today Calories: <strong>{{ data.todayCalories }}</strong> kcal</article>
      <article
        class="card card-bmi-trigger"
        role="button"
        tabindex="0"
        :aria-expanded="bmiPanelOpen"
        aria-label="Toggle BMI calculator"
        @click="bmiPanelOpen = !bmiPanelOpen"
        @keydown.enter.prevent="bmiPanelOpen = !bmiPanelOpen"
        @keydown.space.prevent="bmiPanelOpen = !bmiPanelOpen"
      >
        <div class="card-bmi-row">
          <span>⚖️ Latest BMI: <strong>{{ displayLatestBmi }}</strong></span>
          <span class="card-bmi-chevron" :class="{ open: bmiPanelOpen }" aria-hidden="true">▼</span>
        </div>
        <p class="card-bmi-hint">{{ bmiPanelOpen ? "Click to hide" : "Click to calculate / update" }}</p>
      </article>
    </div>
    <BmiCalculatorPanel v-if="data && bmiPanelOpen" />
    <p v-else class="muted">Loading your healthy stats...</p>
  </main>
</template>

<style scoped>
.card-bmi-trigger {
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.card-bmi-trigger:hover {
  border-color: var(--c3);
  box-shadow: 0 4px 14px rgba(52, 139, 147, 0.15);
}

.card-bmi-trigger:focus-visible {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--c4);
}

.card-bmi-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card-bmi-chevron {
  font-size: 10px;
  color: var(--c5);
  transition: transform 0.2s ease;
}

.card-bmi-chevron.open {
  transform: rotate(-180deg);
}

.card-bmi-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #486170;
}
</style>
