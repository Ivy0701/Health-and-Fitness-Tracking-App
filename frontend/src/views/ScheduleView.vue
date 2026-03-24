<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const list = ref([]);
onMounted(async () => {
  const { data } = await api.get("/schedules");
  list.value = data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">🗓 Schedule</h2>
    <ul class="card list">
      <li v-for="s in list" :key="s.id">⏰ {{ s.title }} - <strong>{{ s.status }}</strong></li>
    </ul>
  </main>
</template>

<style scoped>
.list { margin: 0; padding-left: 20px; }
.list li { margin-bottom: 8px; }
</style>
