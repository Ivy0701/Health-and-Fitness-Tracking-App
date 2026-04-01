<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const route = useRoute();
const course = ref(null);

const courseId = computed(() => route.params.id);

onMounted(async () => {
  const { data } = await api.get(`/courses/${courseId.value}`);
  course.value = data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <section class="panel">
      <h2 class="title">🎓 Start Learning</h2>
      <template v-if="course">
        <h3>{{ course.title }}</h3>
        <p class="muted">{{ course.description }}</p>
      </template>
      <p v-else>Loading course...</p>
    </section>
  </main>
</template>
