<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const courses = ref([]);
onMounted(async () => {
  const { data } = await api.get("/courses");
  courses.value = data;
});

async function book(id) {
  await api.post(`/courses/${id}/bookings`);
  alert("Booked");
}
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">📚 Courses</h2>
    <div v-for="c in courses" :key="c.id" class="card">
      <h3>🏋️ {{ c.title }}</h3>
      <p class="muted">{{ c.description }}</p>
      <button @click="book(c.id)">✅ Book this course</button>
    </div>
  </main>
</template>
