<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const courses = ref([]);
const favorites = ref(new Set());
const form = ref({ title: "", description: "", difficulty: "beginner", duration: 30, category: "fitness" });
const state = ref({ error: "" });

async function loadCourses() {
  const { data } = await api.get("/courses");
  courses.value = data;
}

async function loadFavorites() {
  const me = await api.get("/users/me").then((r) => r.data);
  const rows = await api.get(`/favorites/${me.id}`).then((r) => r.data);
  favorites.value = new Set(rows.filter((x) => x.itemType === "course").map((x) => x.itemId));
}

async function addFavorite(course) {
  const me = await api.get("/users/me").then((r) => r.data);
  await api.post("/favorites", { userId: me.id, itemType: "course", itemId: course._id, title: course.title });
  favorites.value.add(course._id);
}

async function createCourse() {
  state.value.error = "";
  try {
    await api.post("/courses", form.value);
    form.value = { title: "", description: "", difficulty: "beginner", duration: 30, category: "fitness" };
    await loadCourses();
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to create course.";
  }
}

onMounted(async () => {
  await Promise.all([loadCourses(), loadFavorites()]);
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">📚 Courses</h2>

    <section class="panel">
      <h3>Create Course</h3>
      <form novalidate @submit.prevent="createCourse">
        <input v-model="form.title" placeholder="Course title" />
        <input v-model="form.description" placeholder="Description" />
        <div class="grid grid-2">
          <select v-model="form.difficulty">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <input v-model.number="form.duration" type="number" min="1" placeholder="Duration (minutes)" />
        </div>
        <input v-model="form.category" placeholder="Category" />
        <button type="submit">Add Course</button>
      </form>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </section>

    <section class="grid grid-2 list">
      <article v-for="c in courses" :key="c._id" class="card">
        <h3>{{ c.title }}</h3>
        <p class="muted">{{ c.description }}</p>
        <p>Difficulty: <strong>{{ c.difficulty }}</strong></p>
        <p>Duration: <strong>{{ c.duration }}</strong> min</p>
        <p>Category: <strong>{{ c.category }}</strong></p>
        <button :disabled="favorites.has(c._id)" @click="addFavorite(c)">
          {{ favorites.has(c._id) ? "Favorited" : "Add to Favorites" }}
        </button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.list { margin-top: 16px; }
.error { color: #b42318; }
</style>

