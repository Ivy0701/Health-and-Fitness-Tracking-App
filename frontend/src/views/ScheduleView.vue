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
    <h2>Schedule</h2>
    <ul>
      <li v-for="s in list" :key="s.id">{{ s.title }} - {{ s.status }}</li>
    </ul>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
</style>
