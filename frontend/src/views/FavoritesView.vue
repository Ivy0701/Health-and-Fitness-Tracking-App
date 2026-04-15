<script setup>
import { computed, onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const me = ref(null);
const list = ref([]);

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  list.value = await api.get(`/favorites/${me.value.id}`).then((r) => r.data);
}

async function removeFavorite(id) {
  await api.delete(`/favorites/${id}`);
  await load();
}

function normalizeType(type) {
  const t = String(type || "").toLowerCase();
  if (t === "course") return "Course";
  if (t === "workout") return "Workout";
  if (t === "article") return "Article";
  if (t === "diet") return "Diet";
  return "Other";
}

const stats = computed(() => {
  const out = { total: list.value.length, course: 0, workout: 0, article: 0, diet: 0, other: 0 };
  for (const item of list.value) {
    const t = String(item?.itemType || "").toLowerCase();
    if (t === "course") out.course += 1;
    else if (t === "workout") out.workout += 1;
    else if (t === "article") out.article += 1;
    else if (t === "diet") out.diet += 1;
    else out.other += 1;
  }
  return out;
});

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page favorites-page">
    <section class="panel favorites-hero">
      <h2 class="title">⭐ Favorites</h2>
      <p class="muted">Keep your saved items in one place for quick access.</p>
      <div class="stats-row">
        <div class="stat-chip">
          <span>Total saved</span>
          <strong>{{ stats.total }}</strong>
        </div>
        <div class="stat-chip">
          <span>Courses</span>
          <strong>{{ stats.course }}</strong>
        </div>
        <div class="stat-chip">
          <span>Workouts</span>
          <strong>{{ stats.workout }}</strong>
        </div>
        <div class="stat-chip">
          <span>Articles</span>
          <strong>{{ stats.article }}</strong>
        </div>
        <div class="stat-chip">
          <span>Diet</span>
          <strong>{{ stats.diet }}</strong>
        </div>
      </div>
    </section>

    <section v-if="list.length" class="grid grid-2 favorites-grid">
      <article v-for="f in list" :key="f._id" class="card favorite-card">
        <div class="card-head">
          <h3>{{ f.title || "Untitled item" }}</h3>
          <span class="type-pill">{{ normalizeType(f.itemType) }}</span>
        </div>
        <p class="muted meta-line">Reference ID: <span class="mono">{{ f.itemId }}</span></p>
        <p v-if="String(f.itemType).toLowerCase() === 'diet' && Number.isFinite(Number(f.targetCalories))" class="muted meta-line">
          Target calories: <strong>{{ Math.round(Number(f.targetCalories)) }} kcal/day</strong>
        </p>
        <p v-if="String(f.itemType).toLowerCase() === 'diet' && f.description" class="muted meta-line">
          {{ f.description }}
        </p>
        <div class="actions">
          <button class="remove-btn" @click="removeFavorite(f._id)">Remove</button>
        </div>
      </article>
    </section>

    <section v-else class="panel empty-state">
      <h3>No favorites yet</h3>
      <p class="muted">When you save a course, workout, or article, it will show up here.</p>
    </section>
  </main>
</template>

<style scoped>
.favorites-page {
  max-width: 1120px;
}

.favorites-hero {
  background: linear-gradient(140deg, #f8fcfb 0%, #edf6f4 45%, #e3f1ee 100%);
  border: 1px solid #cfe4df;
}

.stats-row {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.stat-chip {
  border: 1px solid #d4e7e2;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
  display: grid;
  gap: 3px;
}

.stat-chip span {
  font-size: 12px;
  color: #4d6774;
}

.stat-chip strong {
  font-size: 20px;
  color: #2f4858;
}

.favorites-grid {
  margin-top: 14px;
}

.favorites-grid .card + .card {
  margin-top: 0;
}

.favorite-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid #d5e7e3;
  box-shadow: 0 8px 20px rgba(47, 72, 88, 0.07);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.card-head h3 {
  margin: 0;
  line-height: 1.3;
  color: #2f4858;
}

.type-pill {
  background: #e8f3f0;
  color: #316879;
  border: 1px solid #c9dfd9;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.meta-line {
  margin: 0;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.actions {
  margin-top: auto;
}

.remove-btn {
  background: #fff5f5;
  color: #9b2c2c;
  border: 1px solid #e8a09e;
}

.empty-state {
  margin-top: 14px;
  text-align: center;
}

.empty-state h3 {
  margin: 2px 0 6px;
  color: #2f4858;
}
</style>

