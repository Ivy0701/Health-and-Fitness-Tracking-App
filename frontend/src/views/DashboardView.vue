<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const data = ref(null);
onMounted(async () => {
  const res = await api.get("/dashboard");
  data.value = res.data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2>Dashboard</h2>
    <div v-if="data">
      <p>Today Workout Minutes: {{ data.todayWorkoutMinutes }}</p>
      <p>Today Courses: {{ data.todayCourses }}</p>
      <p>Today Calories: {{ data.todayCalories }}</p>
      <p>Latest BMI: {{ data.latestBmi?.bmi || '-' }}</p>
    </div>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
</style>
