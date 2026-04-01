<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const course = ref(null);
const blocked = ref(false);

const courseId = computed(() => route.params.id);

onMounted(async () => {
  const { data } = await api.get(`/courses/${courseId.value}`);
  if (data?.isPremium && !auth.vipStatus) {
    blocked.value = true;
    router.replace("/vip");
    return;
  }
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
      <p v-else-if="blocked">Redirecting to VIP page...</p>
      <p v-else>Loading course...</p>
    </section>
  </main>
</template>
