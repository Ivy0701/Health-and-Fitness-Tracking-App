<script setup>
import { onMounted, ref } from "vue";
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

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">⭐ Favorites</h2>
    <div v-if="list.length" class="grid">
      <article v-for="f in list" :key="f._id" class="card">
        <h3>{{ f.title || "Untitled item" }}</h3>
        <p>Type: {{ f.itemType }}</p>
        <p class="muted">Item ID: {{ f.itemId }}</p>
        <button @click="removeFavorite(f._id)">Remove</button>
      </article>
    </div>
    <p v-else class="muted">No favorites yet.</p>
  </main>
</template>

