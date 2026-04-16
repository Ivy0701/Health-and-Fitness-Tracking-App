<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useFavorites } from "../services/favorites";

const router = useRouter();
const activeTab = ref("all");
const searchTerm = ref("");
const sortBy = ref("newest");
const toast = ref("");
let toastTimer = null;

const { favorites, loading, ensureFavoritesLoaded, normalizeType, removeFavoriteByRowId, addFavorite, isFavorited } = useFavorites();
const recommendationPool = ref([]);

const TAB_ITEMS = [
  { id: "all", label: "All" },
  { id: "workout", label: "Workouts" },
  { id: "diet", label: "Diet / Recipes" },
  { id: "course", label: "Courses" },
  { id: "forum", label: "Forum" },
];

const SORT_OPTIONS = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "az", label: "A-Z" },
  { id: "category", label: "Category" },
];

const TYPE_LABEL = {
  workout: "Workout",
  diet: "Diet",
  course: "Course",
  forum: "Forum",
};

const TYPE_ICON = {
  workout: "💪",
  diet: "🥗",
  course: "📚",
  forum: "💬",
};

const DEFAULT_RECOMMENDATIONS = {
  workout: [
    {
      id: "default-workout-hiit",
      type: "workout",
      title: "Quick HIIT Session",
      description: "20-minute high-intensity circuit to boost daily burn and cardio capacity.",
      tags: ["hiit", "cardio"],
      category: "Cardio",
      difficulty: "Intermediate",
      sourcePage: "workout",
      route: "/workout",
    },
  ],
  course: [
    {
      id: "default-course-foundation",
      type: "course",
      title: "Fitness Foundation Course",
      description: "Build consistency with guided day-by-day training and recovery basics.",
      tags: ["training", "foundation"],
      category: "General",
      difficulty: "Beginner",
      sourcePage: "courses",
      route: "/courses",
    },
  ],
  diet: [
    {
      id: "default-diet-protein",
      type: "diet",
      title: "High Protein Daily Plan",
      description: "Balanced meals with higher protein and practical prep-friendly structure.",
      tags: ["diet", "high protein"],
      category: "high_protein",
      difficulty: "Easy",
      sourcePage: "diet",
      route: "/diet",
    },
  ],
  forum: [
    {
      id: "default-forum-habits",
      type: "forum",
      title: "How to stay consistent?",
      description: "Share your routine tips for keeping healthy habits during busy weeks.",
      tags: ["training", "notes"],
      category: "forum",
      difficulty: "",
      sourcePage: "forum",
      route: "/forum",
    },
  ],
};

function showToast(message) {
  toast.value = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = "";
  }, 1800);
}

function routeByType(type) {
  if (type === "workout") return "/workout";
  if (type === "course") return "/courses";
  if (type === "diet") return "/diet";
  if (type === "forum") return "/forum";
  return "/favorites";
}

function normalizeRow(row) {
  const type = normalizeType(row.itemType);
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...row,
    type,
    metadata,
    title: row.title || "Untitled item",
    description: row.description || metadata.preview || "",
    image: row.image || metadata.image || "",
  };
}

const normalizedFavorites = computed(() => favorites.value.map(normalizeRow));

const stats = computed(() => {
  const out = { total: normalizedFavorites.value.length, workout: 0, diet: 0, course: 0, forum: 0 };
  for (const row of normalizedFavorites.value) {
    if (out[row.type] != null) out[row.type] += 1;
  }
  return out;
});

const filteredFavorites = computed(() => {
  let rows = [...normalizedFavorites.value];
  if (activeTab.value !== "all") {
    rows = rows.filter((row) => row.type === activeTab.value);
  }
  const keyword = searchTerm.value.trim().toLowerCase();
  if (keyword) {
    rows = rows.filter((row) => {
      const blob = [
        row.title,
        row.description,
        row.metadata?.category,
        row.metadata?.difficulty,
        row.metadata?.authorName,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(keyword);
    });
  }

  if (sortBy.value === "oldest") {
    rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sortBy.value === "az") {
    rows.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  } else if (sortBy.value === "category") {
    rows.sort((a, b) => String(a.type).localeCompare(String(b.type)));
  } else {
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return rows;
});

const hasAnyFavorites = computed(() => stats.value.total > 0);
const hasCurrentTabItems = computed(() => filteredFavorites.value.length > 0);
const recommendationSubtitle = computed(() =>
  hasAnyFavorites.value ? "Based on your saved items" : "Popular picks to get started"
);

const recommendationTypes = computed(() => {
  if (!hasAnyFavorites.value) return ["workout", "course", "diet", "forum"];
  const sorted = ["workout", "course", "diet", "forum"].sort((a, b) => stats.value[b] - stats.value[a]);
  return sorted;
});

function toText(value) {
  return String(value || "").trim();
}

function inferTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => toText(item).toLowerCase()).filter(Boolean);
  return [toText(value).toLowerCase()].filter(Boolean);
}

function normalizeRecommendation(item) {
  if (!item) return null;
  const id = toText(item.id || item.itemId || item._id);
  const type = normalizeType(item.type || item.itemType);
  if (!id || !type) return null;
  const title = toText(item.title) || "Recommended item";
  const description = toText(item.description || item.summary || item.content || item.subtitle);
  const category = toText(item.category || item.planType || item.sourcePage);
  const difficulty = toText(item.difficulty);
  const tags = inferTags(item.tags || item.metadata?.tags || category);
  const sourcePage = toText(item.sourcePage) || type;
  return {
    id,
    type,
    title,
    description,
    category,
    difficulty,
    tags,
    sourcePage,
    route: item.route || routeByType(type),
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

function flattenDefaults() {
  return Object.values(DEFAULT_RECOMMENDATIONS)
    .flatMap((rows) => rows)
    .map(normalizeRecommendation)
    .filter(Boolean);
}

async function loadRecommendationPool() {
  const [coursesRes, workoutRes, forumRes] = await Promise.all([
    api.get("/courses").catch(() => ({ data: [] })),
    api.get("/workout/plan").catch(() => ({ data: [] })),
    api.get("/forum/posts").catch(() => ({ data: [] })),
  ]);

  const courseRows = (Array.isArray(coursesRes.data) ? coursesRes.data : []).map((row) =>
    normalizeRecommendation({
      id: row?._id || row?.id,
      type: "course",
      title: row?.title,
      description: row?.description,
      category: row?.category,
      difficulty: row?.difficulty,
      tags: [row?.category, row?.difficulty].filter(Boolean),
      sourcePage: "courses",
      route: "/courses",
      createdAt: row?.createdAt,
    })
  );

  const workoutRows = (Array.isArray(workoutRes.data) ? workoutRes.data : []).map((row) =>
    normalizeRecommendation({
      id: row?._id || row?.id,
      type: "workout",
      title: row?.exercise_name || row?.exerciseName || "Workout Plan",
      description: `${Math.max(0, Number(row?.duration_per_day || row?.durationPerDay || 0))} min/day`,
      category: row?.category,
      difficulty: row?.is_custom ? "Custom" : "Standard",
      tags: [row?.category, row?.is_custom ? "custom" : "standard"].filter(Boolean),
      sourcePage: "workout",
      route: "/workout",
      createdAt: row?.createdAt,
    })
  );

  const forumRows = (Array.isArray(forumRes.data) ? forumRes.data : []).map((row) =>
    normalizeRecommendation({
      id: row?._id || row?.id,
      type: "forum",
      title: row?.title,
      description: row?.content,
      tags: row?.tags,
      category: "forum",
      sourcePage: "forum",
      route: "/forum",
      createdAt: row?.createdAt,
    })
  );

  const dietRows = flattenDefaults().filter((row) => row.type === "diet");
  const merged = [...courseRows, ...workoutRows, ...dietRows, ...forumRows, ...flattenDefaults()].filter(Boolean);
  const seen = new Set();
  recommendationPool.value = merged.filter((row) => {
    const key = `${row.type}::${row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasIntersection(a, b) {
  if (!a.size || !b.size) return false;
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

const recommendations = computed(() => {
  const savedKeys = new Set(normalizedFavorites.value.map((row) => `${row.type}::${String(row.itemId || "")}`));
  const uniquePool = recommendationPool.value.filter((item) => !savedKeys.has(`${item.type}::${item.id}`));
  const fallbackByType = recommendationTypes.value
    .flatMap((type) => DEFAULT_RECOMMENDATIONS[type] || [])
    .map(normalizeRecommendation)
    .filter((item) => item && !savedKeys.has(`${item.type}::${item.id}`));

  if (!hasAnyFavorites.value) {
    const picks = [];
    for (const type of ["course", "workout", "diet", "forum"]) {
      const hit = uniquePool.find((item) => item.type === type) || fallbackByType.find((item) => item.type === type);
      if (hit) picks.push(hit);
    }
    if (picks.length) return picks.slice(0, 4);
    return fallbackByType.slice(0, 4);
  }

  const favoriteTypes = new Map();
  const favoriteCategories = new Set();
  const favoriteDifficulties = new Set();
  const favoriteTags = new Set();
  for (const row of normalizedFavorites.value) {
    favoriteTypes.set(row.type, (favoriteTypes.get(row.type) || 0) + 1);
    const meta = row.metadata || {};
    if (meta.category) favoriteCategories.add(String(meta.category).toLowerCase());
    if (meta.difficulty) favoriteDifficulties.add(String(meta.difficulty).toLowerCase());
    for (const tag of inferTags(meta.tags || meta.planType || row.type)) favoriteTags.add(tag);
  }

  const scored = uniquePool.map((item) => {
    let score = 0;
    score += (favoriteTypes.get(item.type) || 0) * 4;
    if (favoriteCategories.has(String(item.category || "").toLowerCase())) score += 3;
    if (favoriteDifficulties.has(String(item.difficulty || "").toLowerCase())) score += 2;
    if (hasIntersection(new Set(item.tags || []), favoriteTags)) score += 3;
    return { item, score };
  });

  const picks = scored
    .sort((a, b) => b.score - a.score || String(a.item.title).localeCompare(String(b.item.title)))
    .map((row) => row.item)
    .slice(0, 4);

  if (picks.length) return picks;
  return fallbackByType.slice(0, 4);
});

function isRecommendedSaved(item) {
  return isFavorited(item.type, item.id);
}

async function addRecommendedToFavorites(item) {
  if (isRecommendedSaved(item)) return;
  await addFavorite({
    itemType: item.type,
    itemId: item.id,
    title: item.title,
    description: item.description,
    sourceType: `${item.type}_recommendation`,
    metadata: {
      category: item.category,
      difficulty: item.difficulty,
      tags: item.tags,
      sourcePage: item.sourcePage,
      createdAt: item.createdAt,
    },
  });
  showToast("Added to favorites");
}

async function removeItem(row) {
  await removeFavoriteByRowId(row._id);
  showToast("Removed from favorites");
}

function openItem(row) {
  router.push({
    path: routeByType(row.type),
    query: { focusItem: String(row.itemId || "") },
  });
}

function startWorkout(row) {
  router.push({ path: "/workout", query: { focusItem: String(row.itemId || "") } });
}

function addWorkoutToPlan(row) {
  router.push({ path: "/workout", query: { focusItem: String(row.itemId || "") } });
}

function detailBadges(row) {
  const meta = row.metadata || {};
  if (row.type === "workout") {
    return [
      meta.duration ? `${meta.duration} min` : "",
      meta.calories ? `${meta.calories} kcal` : "",
      meta.difficulty || "",
      meta.category || "",
    ].filter(Boolean);
  }
  if (row.type === "diet") {
    return [meta.mealType || meta.planType || row.planType || "Meal plan", row.targetCalories ? `${Math.round(row.targetCalories)} kcal` : ""].filter(Boolean);
  }
  if (row.type === "course") {
    return [meta.durationDays ? `${meta.durationDays} days` : "", meta.difficulty || "", meta.category || ""].filter(Boolean);
  }
  if (row.type === "forum") {
    return [meta.authorName || "", Number.isFinite(meta.likeCount) ? `♥ ${meta.likeCount}` : "", Number.isFinite(meta.commentCount) ? `💬 ${meta.commentCount}` : ""].filter(Boolean);
  }
  return [];
}

onMounted(async () => {
  await Promise.all([ensureFavoritesLoaded(), loadRecommendationPool()]);
});
</script>

<template>
  <AppNavbar />
  <main class="page favorites-page">
    <section class="panel favorites-hero">
      <div class="hero-top">
        <div>
          <h2 class="title">Favorites</h2>
          <p class="muted hero-subtitle">Save your favorite workouts, meals, courses, and forum posts for quick access.</p>
          <p class="saved-count">{{ stats.total }} saved items</p>
        </div>
        <div class="hero-controls">
          <input v-model.trim="searchTerm" type="search" placeholder="Search favorites..." />
          <select v-model="sortBy">
            <option v-for="opt in SORT_OPTIONS" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          </select>
        </div>
      </div>
      <div class="stats-row">
        <div class="stat-chip"><span>Workouts</span><strong>{{ stats.workout }}</strong></div>
        <div class="stat-chip"><span>Diet</span><strong>{{ stats.diet }}</strong></div>
        <div class="stat-chip"><span>Courses</span><strong>{{ stats.course }}</strong></div>
        <div class="stat-chip"><span>Forum</span><strong>{{ stats.forum }}</strong></div>
      </div>
    </section>

    <section class="tabs-row">
      <button
        v-for="tab in TAB_ITEMS"
        :key="tab.id"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </section>

    <section v-if="loading && !hasAnyFavorites" class="grid favorite-grid">
      <article v-for="idx in 4" :key="idx" class="card favorite-card skeleton-card">
        <div class="skeleton-box" />
        <div class="skeleton-line" />
        <div class="skeleton-line short" />
      </article>
    </section>

    <section v-else-if="!hasAnyFavorites" class="panel empty-state">
      <div class="empty-icon">☆</div>
      <h3>No favorites yet</h3>
      <p class="muted">Start saving workouts, courses, meals, and forum posts you love.</p>
      <div class="empty-actions">
        <button type="button" class="ghost-action" @click="router.push('/workout')">Explore Workouts</button>
        <button type="button" class="ghost-action" @click="router.push('/courses')">Browse Courses</button>
        <button type="button" class="ghost-action" @click="router.push('/forum')">Visit Forum</button>
        <button type="button" class="ghost-action" @click="router.push('/diet')">Discover Diet Plans</button>
      </div>
    </section>

    <section v-else-if="!hasCurrentTabItems" class="panel empty-state slim">
      <h3>No items found for this filter</h3>
      <p class="muted">Try another tab or clear your search keyword.</p>
    </section>

    <section v-else class="grid favorite-grid">
      <article v-for="row in filteredFavorites" :key="row._id" class="card favorite-card">
        <div class="card-thumb">
          <img v-if="row.image" :src="row.image" :alt="row.title" />
          <span v-else class="thumb-placeholder">{{ TYPE_ICON[row.type] || "⭐" }}</span>
        </div>
        <div class="card-main">
          <div class="card-head">
            <h3>{{ row.title }}</h3>
            <button type="button" class="inline-fav" @click="removeItem(row)">★</button>
          </div>
          <span class="type-pill">{{ TYPE_LABEL[row.type] || "Item" }}</span>
          <p class="muted desc-text">{{ row.description || "Saved item from your health app journey." }}</p>
          <div class="meta-badges">
            <span v-for="badge in detailBadges(row)" :key="badge" class="meta-chip">{{ badge }}</span>
          </div>
          <div class="quick-actions">
            <button v-if="row.type === 'workout'" type="button" class="small-btn" @click="startWorkout(row)">Start</button>
            <button v-if="row.type === 'workout'" type="button" class="small-btn ghost" @click="addWorkoutToPlan(row)">Add to Plan</button>
            <button type="button" class="small-btn ghost" @click="openItem(row)">
              {{
                row.type === "course"
                  ? "Go to Course"
                  : row.type === "workout"
                  ? "Go to Workout"
                  : row.type === "diet"
                  ? "View Diet"
                  : row.type === "forum"
                  ? "Go to Post"
                  : "Open Module"
              }}
            </button>
            <button type="button" class="small-btn danger" @click="removeItem(row)">Remove</button>
          </div>
        </div>
      </article>
    </section>

    <section class="panel quick-panel">
      <h3>Quick actions</h3>
      <div class="quick-links">
        <button type="button" class="ghost-action" @click="router.push('/workout')">Start a workout</button>
        <button type="button" class="ghost-action" @click="router.push('/courses')">Go to courses</button>
        <button type="button" class="ghost-action" @click="router.push('/diet')">View diet plans</button>
        <button type="button" class="ghost-action" @click="router.push('/forum')">Join forum</button>
      </div>
    </section>

    <section class="panel recommendation-panel">
      <h3>You may also like</h3>
      <p class="muted recommendation-subtitle">{{ recommendationSubtitle }}</p>
      <div class="grid recommend-grid">
        <article v-for="item in recommendations" :key="item.id" class="recommend-card">
          <div class="recommend-head">
            <span class="recommend-icon">{{ TYPE_ICON[item.type] || "⭐" }}</span>
            <span class="type-pill">{{ TYPE_LABEL[item.type] || "Item" }}</span>
          </div>
          <h4>{{ item.title }}</h4>
          <p class="muted">{{ item.description || "Recommended for your goals." }}</p>
          <div class="meta-badges">
            <span v-if="item.category" class="meta-chip">{{ item.category }}</span>
            <span v-if="item.difficulty" class="meta-chip">{{ item.difficulty }}</span>
            <span v-for="tag in (item.tags || []).slice(0, 2)" :key="`${item.id}-${tag}`" class="meta-chip">#{{ tag }}</span>
          </div>
          <div class="quick-actions">
            <button
              type="button"
              class="small-btn"
              :disabled="isRecommendedSaved(item)"
              @click="addRecommendedToFavorites(item)"
            >
              {{ isRecommendedSaved(item) ? "Saved" : "Add to Favorites" }}
            </button>
            <button type="button" class="small-btn ghost" @click="router.push(item.route)">
              {{ item.type === "course" ? "Go to Courses" : item.type === "workout" ? "Go to Workout" : item.type === "diet" ? "Go to Diet" : "Go to Forum" }}
            </button>
          </div>
        </article>
      </div>
      <p v-if="!recommendations.length" class="muted recommendation-fallback">
        No suitable recommendations right now. Try exploring courses, workout plans, diet, or forum posts.
      </p>
    </section>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </main>
</template>

<style scoped>
.favorites-page {
  max-width: 1140px;
  display: grid;
  gap: 14px;
}

.favorites-hero {
  background: linear-gradient(140deg, #f8fcfb 0%, #edf6f4 45%, #e3f1ee 100%);
}

.hero-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-subtitle {
  margin: -4px 0 8px;
  max-width: 640px;
}

.saved-count {
  margin: 0;
  font-weight: 700;
  color: var(--c5);
}

.hero-controls {
  width: 320px;
  max-width: 100%;
  display: grid;
  gap: 8px;
}

.stats-row {
  margin-top: 12px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.stat-chip {
  border: 1px solid #d4e7e2;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
}

.stat-chip span {
  font-size: 12px;
  color: #4d6774;
}

.stat-chip strong {
  display: block;
  font-size: 22px;
  color: #2f4858;
}

.tabs-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-btn {
  border: 1px solid #d2e4df;
  border-radius: 999px;
  background: #f4f9f8;
  color: var(--c5);
  padding: 7px 14px;
}

.tab-btn.active {
  background: linear-gradient(90deg, var(--c3), var(--c4));
  color: #fff;
  border-color: transparent;
}

.favorite-grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.favorite-grid .card + .card {
  margin-top: 0;
}

.favorite-card {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-thumb {
  height: 130px;
  background: linear-gradient(140deg, #e8f4f2, #dceef0);
  display: grid;
  place-items: center;
}

.card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  font-size: 34px;
}

.card-main {
  padding: 12px;
  display: grid;
  gap: 8px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.card-head h3 {
  margin: 0;
  color: var(--c6);
  font-size: 17px;
}

.inline-fav {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid #ebd49c;
  background: #fff8e5;
  color: #9a6a00;
}

.type-pill {
  width: fit-content;
  background: #e8f3f0;
  color: #316879;
  border: 1px solid #c9dfd9;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
}

.desc-text {
  margin: 0;
  line-height: 1.45;
  min-height: 40px;
}

.meta-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 8px;
  background: #eef6f4;
  color: #45626f;
  border: 1px solid #d8e8e4;
}

.quick-actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.small-btn {
  width: auto;
  padding: 7px 11px;
  font-size: 12px;
}

.small-btn.ghost {
  background: #ecf2f0;
  color: #355462;
}

.small-btn.danger {
  background: #fff5f5;
  color: #9b2c2c;
  border: 1px solid #e8a09e;
}

.quick-panel h3,
.recommendation-panel h3 {
  margin: 0 0 10px;
  color: var(--c6);
}

.quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ghost-action {
  width: auto;
  border: 1px solid #d2e4df;
  color: var(--c5);
  background: #f5faf8;
}

.recommend-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.recommend-card {
  border: 1px solid #d9e9e6;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  display: grid;
  gap: 8px;
}

.recommend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.recommend-icon {
  font-size: 18px;
}

.recommend-card h4 {
  margin: 0 0 8px;
  color: var(--c6);
}

.recommend-card p {
  margin: 0 0 10px;
  min-height: 40px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.recommendation-subtitle {
  margin: -4px 0 10px;
}

.recommendation-fallback {
  margin: 10px 0 0;
}

@media (max-width: 1080px) {
  .recommend-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.empty-state {
  text-align: center;
  padding: 32px 20px;
}

.empty-state.slim {
  padding: 18px;
}

.empty-icon {
  font-size: 42px;
  margin-bottom: 8px;
  color: #c59d2b;
}

.empty-state h3 {
  margin: 0 0 8px;
  color: var(--c6);
}

.empty-actions {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

.skeleton-card {
  min-height: 240px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.skeleton-box,
.skeleton-line {
  border-radius: 8px;
  background: linear-gradient(90deg, #edf4f2 0%, #f8fcfb 40%, #edf4f2 100%);
}

.skeleton-box {
  height: 110px;
}

.skeleton-line {
  height: 14px;
}

.skeleton-line.short {
  width: 60%;
}

.toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  background: #1b7e5a;
  color: #fff;
  padding: 10px 14px;
  border-radius: 10px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

@media (max-width: 760px) {
  .hero-top {
    flex-direction: column;
  }

  .recommend-grid {
    grid-template-columns: 1fr;
  }
}
</style>

