<script setup>
import { computed, onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const loading = ref(true);
const error = ref("");
const payload = ref(null);

const blocks = computed(() => {
  const featureUsage = payload.value?.featureUsage || {};
  const community = payload.value?.community || {};
  const systemRuntime = payload.value?.systemRuntime || {};

  const uptimeSeconds = Number(systemRuntime.processUptimeSeconds || 0);
  const uptimeHours = Math.floor(uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeText = `${uptimeHours}h ${uptimeMinutes}m`;

  return [
    {
      title: "Feature Usage",
      items: [
        { label: "Workout Plans Created", value: featureUsage.workoutPlansCreated ?? 0 },
        { label: "Workout Tasks Completed", value: featureUsage.workoutTasksCompleted ?? 0 },
        { label: "Diet Entries", value: featureUsage.dietEntries ?? 0 },
        { label: "Schedule Items", value: featureUsage.scheduleItems ?? 0 },
        { label: "Course Enrollments", value: featureUsage.courseEnrollments ?? 0 },
        { label: "Completed Course Days", value: featureUsage.completedCourseDays ?? 0 },
      ],
    },
    {
      title: "Community",
      items: [
        { label: "Posts Today", value: community.postsToday ?? 0 },
        { label: "Total Posts", value: community.postsTotal ?? 0 },
        { label: "Total Likes", value: community.likesTotal ?? 0 },
        { label: "Total Comments", value: community.commentsTotal ?? 0 },
        { label: "Total Interactions", value: community.totalInteractions ?? 0 },
      ],
    },
    {
      title: "System Runtime",
      items: [
        { label: "API Status", value: systemRuntime.apiStatus || "unknown" },
        { label: "Database Status", value: systemRuntime.databaseStatus || "unknown" },
        { label: "Process Uptime", value: uptimeText },
        { label: "Server Time", value: systemRuntime.serverTime || "-" },
        { label: "Latest Platform Activity", value: systemRuntime.latestPlatformActivityAt || "-" },
        { label: "Stats Date", value: systemRuntime.statsDate || "-" },
      ],
    },
  ];
});

onMounted(async () => {
  try {
    const res = await api.get("/dashboard/system-status");
    payload.value = res.data;
  } catch (err) {
    error.value = err?.response?.data?.message || "Failed to load system status.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AppNavbar />
  <main class="status-wrap">
    <section class="status-shell">
      <header class="status-header">
        <h1>System Status Dashboard</h1>
        <p>Track feature usage, community activity, and runtime health.</p>
      </header>

      <div v-if="loading" class="state-block">Loading system status...</div>
      <div v-else-if="error" class="state-block error">{{ error }}</div>

      <section v-else class="status-grid">
        <article v-for="block in blocks" :key="block.title" class="status-card">
          <h2>{{ block.title }}</h2>
          <ul>
            <li v-for="item in block.items" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </li>
          </ul>
        </article>
      </section>
    </section>
  </main>
</template>

<style scoped>
.status-wrap {
  min-height: calc(100vh - 72px);
  padding: 24px 16px 40px;
  background: linear-gradient(180deg, #a7f2ad 0%, #ffffff 28%);
  display: flex;
  justify-content: center;
}

.status-shell {
  width: 100%;
  max-width: 1120px;
  display: grid;
  gap: 18px;
}

.status-header {
  border-radius: 18px;
  padding: 24px 16px;
  text-align: center;
  color: #2f4858;
  background: linear-gradient(120deg, #a7f2ad 0%, #70d1ac 35%, #48aea4 60%, #348b93 80%, #316879 100%);
  box-shadow: 0 12px 24px rgba(49, 104, 121, 0.18);
}

.status-header h1 {
  margin: 0;
  font-size: clamp(24px, 4vw, 34px);
}

.status-header p {
  margin: 8px 0 0;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.status-card {
  background: #ffffff;
  border: 1px solid #70d1ac;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.07);
}

.status-card h2 {
  margin: 0 0 12px;
  color: #2f4858;
  font-size: 20px;
}

.status-card ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.status-card li {
  border-radius: 10px;
  padding: 10px 12px;
  background: linear-gradient(120deg, #f5fff7 0%, #e6f9f0 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #316879;
}

.status-card strong {
  color: #2f4858;
}

.state-block {
  border-radius: 12px;
  border: 1px solid #70d1ac;
  padding: 16px;
  background: #ffffff;
  color: #2f4858;
}

.state-block.error {
  border-color: #d97777;
  color: #b42323;
}

@media (max-width: 900px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
