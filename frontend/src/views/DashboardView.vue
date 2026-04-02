<script setup>
import { computed, onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useBmiStore } from "../stores/bmi";

const payload = ref(null);
const loading = ref(true);
const bmiStore = useBmiStore();

const summary = computed(() => payload.value?.summary || {});
const charts = computed(() => payload.value?.charts || {});
const recent = computed(() => payload.value?.recentActivity || {});

const summaryCards = computed(() => [
  { label: "Total Workouts", value: summary.value.totalWorkouts ?? 0, suffix: "" },
  { label: "Calories Burned", value: summary.value.caloriesBurned ?? 0, suffix: "kcal" },
  { label: "Calories Consumed", value: summary.value.caloriesConsumed ?? 0, suffix: "kcal" },
  { label: "BMI", value: bmiStore.sessionBmi || summary.value.bmi || 0, suffix: "" },
  { label: "Schedule Completion Rate", value: summary.value.scheduleCompletionRate ?? 0, suffix: "%" },
]);

const weeklyWorkoutMax = computed(() => {
  const rows = charts.value.weeklyWorkout || [];
  return Math.max(...rows.map((item) => item.value || 0), 1);
});

const monthlyMax = computed(() => {
  const rows = charts.value.monthlyTrend || [];
  return Math.max(...rows.flatMap((item) => [item.in || 0, item.out || 0]), 1);
});

const monthlyPolyline = computed(() => {
  const rows = charts.value.monthlyTrend || [];
  if (!rows.length) return { inPoints: "", outPoints: "" };
  const step = rows.length > 1 ? 100 / (rows.length - 1) : 100;
  const inPoints = rows
    .map((item, index) => `${index * step},${100 - ((item.in || 0) / monthlyMax.value) * 100}`)
    .join(" ");
  const outPoints = rows
    .map((item, index) => `${index * step},${100 - ((item.out || 0) / monthlyMax.value) * 100}`)
    .join(" ");
  return { inPoints, outPoints };
});

const safeActivity = (item, emptyLabel) =>
  item
    ? {
        title: item.title || "No data yet",
        value: item.value || "No data yet",
        extra: item.extra || "",
      }
    : { title: "No data yet", value: emptyLabel, extra: "" };

onMounted(async () => {
  try {
    const res = await api.get("/dashboard");
    payload.value = res.data;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AppNavbar />
  <main class="dashboard-wrap">
    <section class="dashboard-shell">
      <header class="hero">
        <h1>Welcome back</h1>
        <p>Here is your health progress overview</p>
      </header>

      <div v-if="loading" class="loading">Loading your healthy stats...</div>

      <template v-else>
        <section class="summary-grid">
          <article v-for="card in summaryCards" :key="card.label" class="summary-card">
            <h3>{{ card.label }}</h3>
            <p class="summary-value">
              {{ card.value }}
              <span>{{ card.suffix }}</span>
            </p>
          </article>
        </section>

        <section class="charts-grid">
          <article class="panel">
            <h3>Weekly Workout</h3>
            <div class="bar-chart">
              <div v-for="item in charts.weeklyWorkout || []" :key="item.day" class="bar-item">
                <div class="bar-track">
                  <div class="bar-fill" :style="{ height: `${((item.value || 0) / weeklyWorkoutMax) * 100}%` }"></div>
                </div>
                <span>{{ item.day }}</span>
              </div>
            </div>
          </article>

          <article class="panel">
            <h3>Calories In vs Out</h3>
            <div class="double-bar-chart">
              <div v-for="item in charts.caloriesInVsOut || []" :key="item.day" class="double-row">
                <span class="day-label">{{ item.day }}</span>
                <div class="double-bars">
                  <div class="in-bar" :style="{ width: `${Math.min((item.in || 0) / 20, 100)}%` }"></div>
                  <div class="out-bar" :style="{ width: `${Math.min((item.out || 0) / 20, 100)}%` }"></div>
                </div>
              </div>
            </div>
          </article>

          <article class="panel panel-wide">
            <h3>Monthly Trend</h3>
            <svg class="trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline :points="monthlyPolyline.inPoints" class="line-in"></polyline>
              <polyline :points="monthlyPolyline.outPoints" class="line-out"></polyline>
            </svg>
            <div class="month-labels">
              <span v-for="item in charts.monthlyTrend || []" :key="item.month">{{ item.month }}</span>
            </div>
          </article>
        </section>

        <section class="bottom-grid">
          <article class="panel">
            <h3>Recent Activity</h3>
            <ul class="activity-list">
              <li>
                <strong>Recent workout</strong>
                <p>{{ safeActivity(recent.workout, "No data yet").title }} · {{ safeActivity(recent.workout, "No data yet").value }}</p>
              </li>
              <li>
                <strong>Recent diet</strong>
                <p>{{ safeActivity(recent.diet, "No data yet").title }} · {{ safeActivity(recent.diet, "No data yet").value }}</p>
              </li>
              <li>
                <strong>Recent schedule</strong>
                <p>{{ safeActivity(recent.schedule, "No data yet").title }} · {{ safeActivity(recent.schedule, "No data yet").value }}</p>
              </li>
            </ul>
          </article>

          <article class="panel">
            <h3>Quick Actions</h3>
            <div class="actions">
              <RouterLink to="/workout" class="action-btn">Workout</RouterLink>
              <RouterLink to="/diet" class="action-btn">Diet</RouterLink>
              <RouterLink to="/schedule" class="action-btn">Schedule</RouterLink>
            </div>
          </article>
        </section>
      </template>
    </section>
  </main>
</template>

<style scoped>
.dashboard-wrap {
  min-height: calc(100vh - 72px);
  padding: 24px 16px 40px;
  background: linear-gradient(180deg, #a7f2ad 0%, #ffffff 24%);
  display: flex;
  justify-content: center;
}

.dashboard-shell {
  width: 100%;
  max-width: 1120px;
  display: grid;
  gap: 18px;
}

.hero {
  text-align: center;
  border-radius: 18px;
  padding: 24px 16px;
  color: #2f4858;
  background: linear-gradient(120deg, #a7f2ad 0%, #70d1ac 35%, #48aea4 60%, #348b93 80%, #316879 100%);
  box-shadow: 0 12px 24px rgba(49, 104, 121, 0.18);
}

.hero h1 {
  margin: 0;
  font-size: clamp(26px, 4vw, 36px);
}

.hero p {
  margin: 8px 0 0;
  font-size: 15px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}

.summary-card {
  border-radius: 14px;
  padding: 14px;
  background: linear-gradient(160deg, #ffffff 0%, #a7f2ad 100%);
  border: 1px solid #70d1ac;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.08);
}

.summary-card h3 {
  margin: 0;
  color: #316879;
  font-size: 13px;
  font-weight: 700;
}

.summary-value {
  margin: 10px 0 0;
  color: #2f4858;
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
}

.summary-value span {
  margin-left: 4px;
  font-size: 13px;
  color: #316879;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.panel {
  background: #ffffff;
  border: 1px solid #70d1ac;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.07);
}

.panel h3 {
  margin: 0 0 12px;
  color: #2f4858;
}

.panel-wide {
  grid-column: span 2;
}

.bar-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: end;
  gap: 8px;
  min-height: 150px;
}

.bar-item {
  text-align: center;
}

.bar-track {
  height: 110px;
  border-radius: 10px;
  background: #a7f2ad;
  display: flex;
  align-items: end;
  padding: 3px;
}

.bar-fill {
  width: 100%;
  border-radius: 8px;
  background: linear-gradient(180deg, #48aea4 0%, #2f4858 100%);
}

.bar-item span {
  margin-top: 5px;
  display: block;
  color: #316879;
  font-size: 12px;
}

.double-bar-chart {
  display: grid;
  gap: 8px;
}

.double-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}

.day-label {
  color: #316879;
  font-size: 12px;
}

.double-bars {
  display: grid;
  gap: 4px;
}

.in-bar,
.out-bar {
  height: 10px;
  border-radius: 999px;
}

.in-bar {
  background: linear-gradient(90deg, #a7f2ad 0%, #70d1ac 100%);
}

.out-bar {
  background: linear-gradient(90deg, #348b93 0%, #2f4858 100%);
}

.trend-svg {
  width: 100%;
  height: 180px;
  background: linear-gradient(180deg, #ffffff 0%, #a7f2ad 100%);
  border-radius: 10px;
}

.line-in,
.line-out {
  fill: none;
  stroke-width: 2.4;
}

.line-in {
  stroke: #70d1ac;
}

.line-out {
  stroke: #2f4858;
}

.month-labels {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  color: #316879;
  font-size: 12px;
  text-align: center;
}

.bottom-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.activity-list strong {
  color: #2f4858;
}

.activity-list p {
  margin: 4px 0 0;
  color: #316879;
  font-size: 14px;
}

.actions {
  display: grid;
  gap: 10px;
}

.action-btn {
  text-decoration: none;
  color: #2f4858;
  font-weight: 700;
  text-align: center;
  border-radius: 10px;
  padding: 10px 12px;
  background: linear-gradient(120deg, #a7f2ad 0%, #70d1ac 40%, #48aea4 100%);
}

.loading {
  text-align: center;
  color: #2f4858;
  padding: 20px;
}

@media (max-width: 900px) {
  .charts-grid,
  .bottom-grid {
    grid-template-columns: 1fr;
  }

  .panel-wide {
    grid-column: span 1;
  }
}
</style>
