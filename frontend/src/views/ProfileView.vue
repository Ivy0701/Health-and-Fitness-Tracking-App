<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const profile = ref(null);
onMounted(async () => {
  const { data } = await api.get("/users/me");
  profile.value = data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2>Profile</h2>
    <pre v-if="profile">{{ profile }}</pre>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
</style>
