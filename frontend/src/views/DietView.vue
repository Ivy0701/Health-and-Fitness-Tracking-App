<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const tips = ref([]);
onMounted(async () => {
  const { data } = await api.get("/diets/recommendations");
  tips.value = data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">🥗 Diet Tips</h2>
    <ul class="card list">
      <li v-for="(tip, idx) in tips" :key="idx">🍽 {{ tip }}</li>
    </ul>
  </main>
</template>

<style scoped>
.list { margin: 0; padding-left: 20px; }
.list li { margin-bottom: 8px; }
</style>
