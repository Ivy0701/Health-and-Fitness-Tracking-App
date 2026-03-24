<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const workouts = ref([]);
onMounted(async () => {
  const { data } = await api.get("/workouts");
  workouts.value = data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2>Workout</h2>
    <div v-for="w in workouts" :key="w.id" class="card">
      <h3>{{ w.name }}</h3>
      <p>{{ w.description }}</p>
    </div>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
.card { border: 1px solid #ddd; margin-bottom: 12px; padding: 12px; }
</style>
