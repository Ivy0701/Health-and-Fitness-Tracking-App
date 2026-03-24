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
    <h2 class="title">💪 Workout</h2>
    <div v-for="w in workouts" :key="w.id" class="card">
      <h3>🏃 {{ w.name }}</h3>
      <p class="muted">{{ w.description }}</p>
    </div>
  </main>
</template>
