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
    <h2 class="title">👤 Profile</h2>
    <div v-if="profile" class="card">
      <p>📧 Email: {{ profile.email }}</p>
      <p>🙍 Username: {{ profile.username }}</p>
      <p>📏 Height: {{ profile.height_cm || "-" }} cm</p>
      <p>⚖️ Weight: {{ profile.weight_kg || "-" }} kg</p>
      <p>🎯 Target Weight: {{ profile.target_weight_kg || "-" }} kg</p>
    </div>
  </main>
</template>
