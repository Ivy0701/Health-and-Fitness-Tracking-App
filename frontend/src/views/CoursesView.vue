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
    <h2>Courses</h2>
    <div v-for="c in courses" :key="c.id" class="card">
      <h3>{{ c.title }}</h3>
      <p>{{ c.description }}</p>
      <button @click="book(c.id)">Book</button>
    </div>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
.card { border: 1px solid #ddd; margin-bottom: 12px; padding: 12px; }
</style>
