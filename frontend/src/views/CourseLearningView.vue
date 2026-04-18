<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";
import { fetchEnrolledCourses } from "../services/courses";
import { buildDailyScheduleRangeFromCourse, formatCourseSuggestedDailyTime } from "../utils/courseSuggestedTime";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const course = ref(null);
const blocked = ref(false);
const enrollmentRow = ref(null);

const courseId = computed(() => route.params.id);

const courseDailySchedule = computed(() => {
  const ds = enrollmentRow.value?.daily_schedule;
  if (ds?.startTime && ds?.endTime) return ds;
  return buildDailyScheduleRangeFromCourse(course.value) || null;
});

onMounted(async () => {
  const { data } = await api.get(`/courses/${courseId.value}`);
  if (data?.isPremium && !auth.vipStatus) {
    blocked.value = true;
    router.replace("/vip");
    return;
  }
  course.value = data;
  try {
    const rows = await fetchEnrolledCourses();
    const match = (rows || []).find(
      (r) => String(r?.course_id?._id || r?.course_id || "") === String(courseId.value) && r.status === "active"
    );
    enrollmentRow.value = match || null;
  } catch {
    enrollmentRow.value = null;
  }
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
        <p class="meta-block">
          <strong>Default session duration:</strong> {{ Number(course.duration || 30) }} min
        </p>
        <p v-if="formatCourseSuggestedDailyTime(course)" class="meta-block">
          <strong>Suggested time:</strong> {{ formatCourseSuggestedDailyTime(course) }}
        </p>
        <p v-if="enrollmentRow && courseDailySchedule?.startTime" class="meta-block">
          <strong>Daily time:</strong> {{ courseDailySchedule.startTime }} - {{ courseDailySchedule.endTime }}
        </p>
        <p v-else-if="enrollmentRow" class="muted">You are enrolled. Open the Courses page or Schedule to see session times.</p>
      </template>
      <p v-else-if="blocked">Redirecting to VIP page...</p>
      <p v-else>Loading course...</p>
    </section>
  </main>
</template>

<style scoped>
.meta-block {
  margin: 10px 0 0;
  font-size: 14px;
  color: #2f4858;
  line-height: 1.5;
}
</style>
