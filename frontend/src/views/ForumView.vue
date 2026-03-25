<script setup>
import { onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const posts = ref([]);
const form = reactive({ title: "", content: "" });
const me = ref(null);

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  posts.value = await api.get("/forum/posts").then((r) => r.data);
}

async function addPost() {
  await api.post("/forum/posts", { title: form.title, content: form.content });
  form.title = "";
  form.content = "";
  await load();
}

async function removePost(id) {
  await api.delete(`/forum/posts/${id}`);
  await load();
}

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">💬 Forum</h2>

    <section class="panel">
      <h3>Create Post</h3>
      <form novalidate @submit.prevent="addPost">
        <input v-model="form.title" placeholder="Post title" />
        <textarea v-model="form.content" placeholder="Share your thoughts..." rows="4" />
        <button type="submit">Publish Post</button>
      </form>
    </section>

    <section class="list">
      <article v-for="p in posts" :key="p._id" class="card">
        <h3>{{ p.title }}</h3>
        <p>{{ p.content }}</p>
        <p class="muted">By {{ p.authorName }} · {{ new Date(p.createdAt).toLocaleString() }}</p>
        <button v-if="String(p.userId) === String(me?.id)" @click="removePost(p._id)">Delete</button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.list { margin-top: 16px; display: grid; gap: 12px; }
</style>

