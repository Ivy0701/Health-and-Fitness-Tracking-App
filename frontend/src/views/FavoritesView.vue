<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const favorites = ref([]);
onMounted(async () => {
  const { data } = await api.get("/favorites");
  favorites.value = data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2>Favorites</h2>
    <pre>{{ favorites }}</pre>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
</style>
