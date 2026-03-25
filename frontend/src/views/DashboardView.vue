<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const data = ref(null);
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
      <article class="card">⚖️ Latest BMI: <strong>{{ data.latestBmi?.bmi || "-" }}</strong></article>
    </div>
    <p v-else class="muted">Loading your healthy stats...</p>
  </main>
</template>
