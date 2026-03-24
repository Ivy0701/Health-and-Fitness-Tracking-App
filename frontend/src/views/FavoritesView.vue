<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const favorites = ref([]);
onMounted(async () => {
  const { data } = await api.get("/favorites");
  favorites.value = data;
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">⭐ Favorites</h2>
    <div class="card" v-if="favorites.length">
      <p v-for="f in favorites" :key="f.id">💚 {{ f.type }} #{{ f.item_id }}</p>
    </div>
    <p class="muted" v-else>还没有收藏内容，快去添加吧。</p>
  </main>
</template>
