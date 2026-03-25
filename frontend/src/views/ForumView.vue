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
const submitError = ref("");

async function loadMyPosts() {
  loading.value = true;
  submitError.value = "";
  try {
    const res = await api.get("/forum/me");
    posts.value = res.data || [];
  } catch (e) {
    submitError.value = e?.response?.data?.message || "Failed to load posts.";
  } finally {
    loading.value = false;
  }
}

async function submit() {
  submitError.value = "";

  const title = String(form.title || "").trim();
  const content = String(form.content || "").trim();
  if (!title || !content) {
    submitError.value = "Title and content are required.";
    return;
  }

  await api.post("/forum", { title, content });
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

      <form @submit.prevent="submit" class="grid">
        <div class="field">
          <label class="label" for="forum-title">帖子标题</label>
          <input
            id="forum-title"
            v-model.trim="form.title"
            type="text"
            placeholder="Enter a title"
            required
          />
        </div>

        <div class="field">
          <label class="label" for="forum-content">内容</label>
          <textarea
            id="forum-content"
            v-model.trim="form.content"
            placeholder="Write your post..."
            rows="5"
            required
          />
        </div>

        <button type="submit">🚀 发布</button>

        <div v-if="submitError" class="error">{{ submitError }}</div>
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
  color: var(--c6);
}

.field {
  display: grid;
  gap: 6px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c5);
}

.error {
  margin-top: 6px;
  font-size: 12px;
  color: #c0392b;
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

