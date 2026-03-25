<script setup>
import { onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const form = reactive({
  title: "",
  content: "",
});

const posts = ref([]);
const loading = ref(false);

async function loadMyPosts() {
  loading.value = true;
  try {
    posts.value = await api.get("/forum/me").then((r) => r.data);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  await api.post("/forum", form);
  alert("Posted");
  form.title = "";
  form.content = "";
  await loadMyPosts();
}

onMounted(loadMyPosts);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <section class="panel forum">
      <h2 class="title">💬 论坛</h2>
      <form @submit.prevent="submit">
        <input v-model.trim="form.title" type="text" placeholder="帖子标题" required />
        <textarea v-model="form.content" placeholder="发表你的内容" required />
        <button type="submit">🚀 发布</button>
      </form>
    </section>

    <section class="panel forum-list">
      <h3 class="subtitle">我的帖子</h3>

      <div v-if="loading">加载中...</div>
      <div v-else-if="posts.length === 0">暂无帖子</div>

      <article v-for="post in posts" :key="post.id" class="post">
        <h4 class="post-title">{{ post.title }}</h4>
        <p class="post-content">{{ post.content }}</p>
        <small class="post-time">{{ new Date(post.created_at).toLocaleString() }}</small>
      </article>
    </section>
  </main>
</template>

<style scoped>
.forum {
  max-width: 720px;
}

.forum-list {
  margin-top: 16px;
  max-width: 720px;
}

.subtitle {
  margin: 0 0 12px;
  font-size: 16px;
  color: #2f4858;
}

.post {
  padding: 12px 14px;
  border: 1px solid rgba(47, 72, 88, 0.16);
  border-radius: 12px;
  margin-bottom: 12px;
  background: rgba(255, 255, 255, 0.6);
}

.post-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #16313f;
}

.post-content {
  margin: 0 0 10px;
  white-space: pre-wrap;
}

.post-time {
  color: rgba(22, 49, 63, 0.7);
}
</style>

