<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { formatRelativeTime } from "../utils/formatRelativeTime";

const posts = ref([]);
const form = reactive({ title: "", content: "" });
const me = ref(null);
const searchQuery = ref("");
const activeFilter = ref("all");

/** Stored tag keys (API / DB); labels shown in English in the UI. */
const TAG_OPTIONS = [
  { value: "饮食", label: "Diet" },
  { value: "训练", label: "Training" },
  { value: "减脂", label: "Fat loss" },
  { value: "恢复", label: "Recovery" },
  { value: "心得", label: "Notes" },
];
const selectedTags = ref([]);

const TAG_LABEL_MAP = {
  饮食: "Diet",
  训练: "Training",
  减脂: "Fat loss",
  恢复: "Recovery",
  心得: "Notes",
  综合: "General",
};

const FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "diet", label: "Diet" },
  { id: "train", label: "Training" },
];

const AVATAR_BG = ["#48aea4", "#70d1ac", "#316879", "#348b93", "#a7f2ad", "#2f4858"];

function avatarColor(seed) {
  const str = String(seed ?? "");
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

function avatarInitial(authorName) {
  const s = String(authorName || "").trim();
  if (!s) return "?";
  const ch = s[0];
  return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ch;
}

function displayNickname(name) {
  if (!name || !String(name).trim()) return "Community friend";
  const s = String(name).trim();
  if (/^\d+$/.test(s)) return `Buddy · #${s}`;
  return s;
}

function tagLabel(tag) {
  return TAG_LABEL_MAP[tag] || tag;
}

function tagClass(tag) {
  const map = {
    饮食: "tag-diet",
    训练: "tag-train",
    减脂: "tag-cut",
    恢复: "tag-recover",
    心得: "tag-note",
    综合: "tag-general",
  };
  return map[tag] || "tag-general";
}

function displayTags(p) {
  const raw = Array.isArray(p.tags) ? p.tags.filter(Boolean) : [];
  return raw.length ? raw : ["综合"];
}

function engagementScore(p) {
  return (p.likeCount || 0) + (p.commentCount || 0);
}

const visiblePosts = computed(() => {
  let rows = [...posts.value];
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (p) =>
        String(p.title || "")
          .toLowerCase()
          .includes(q) ||
        String(p.content || "")
          .toLowerCase()
          .includes(q) ||
        String(p.authorName || "")
          .toLowerCase()
          .includes(q)
    );
  }

  if (activeFilter.value === "diet") {
    rows = rows.filter((p) => (p.tags || []).includes("饮食"));
  } else if (activeFilter.value === "train") {
    rows = rows.filter((p) => (p.tags || []).includes("训练"));
  }

  if (activeFilter.value === "hot") {
    rows.sort((a, b) => engagementScore(b) - engagementScore(a) || new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return rows;
});

function toggleFormTag(value) {
  const i = selectedTags.value.indexOf(value);
  if (i === -1) selectedTags.value = [...selectedTags.value, value];
  else selectedTags.value = selectedTags.value.filter((t) => t !== value);
}

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  posts.value = await api.get("/forum/posts").then((r) => r.data);
}

async function addPost() {
  await api.post("/forum/posts", {
    title: form.title,
    content: form.content,
    tags: selectedTags.value,
  });
  form.title = "";
  form.content = "";
  selectedTags.value = [];
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
  <main class="page forum-page">
    <header class="forum-header">
      <h2 class="title forum-title">💬 Forum</h2>
      <p class="forum-sub">Share meals, workouts, and habits—stay motivated together.</p>
    </header>

    <div class="forum-toolbar panel toolbar-panel">
      <div class="filter-scroll" role="tablist" aria-label="Post filters">
        <button
          v-for="chip in FILTER_CHIPS"
          :key="chip.id"
          type="button"
          role="tab"
          :aria-selected="activeFilter === chip.id"
          class="filter-chip"
          :class="{ active: activeFilter === chip.id }"
          @click="activeFilter = chip.id"
        >
          {{ chip.label }}
        </button>
      </div>
      <label class="search-wrap">
        <span class="sr-only">Search posts</span>
        <input
          v-model="searchQuery"
          type="search"
          class="forum-search"
          placeholder="Search posts…"
          autocomplete="off"
        />
      </label>
    </div>

    <section class="panel create-panel">
      <h3 class="create-heading">Create Post</h3>
      <form novalidate class="create-form" @submit.prevent="addPost">
        <input v-model="form.title" placeholder="Post title" />
        <textarea v-model="form.content" placeholder="Share your thoughts..." rows="4" />
        <div class="tag-picker">
          <span class="tag-picker-label">Tags</span>
          <div class="tag-picker-chips">
            <button
              v-for="tag in TAG_OPTIONS"
              :key="tag.value"
              type="button"
              class="pick-chip"
              :class="{ on: selectedTags.includes(tag.value) }"
              @click="toggleFormTag(tag.value)"
            >
              #{{ tag.label }}
            </button>
          </div>
        </div>
        <div class="create-actions">
          <button type="submit" class="publish-btn">Publish Post</button>
        </div>
      </form>
    </section>

    <section class="post-list">
      <p v-if="!visiblePosts.length" class="empty-hint muted">No posts match. Try another filter or create one.</p>
      <article v-for="p in visiblePosts" :key="p._id" class="post-card">
        <div class="post-top">
          <div class="author-block">
            <div
              class="avatar"
              :style="{ background: avatarColor(p.userId || p.authorName) }"
              :aria-label="`${displayNickname(p.authorName)} avatar`"
            >
              <span class="avatar-letter">{{ avatarInitial(p.authorName) }}</span>
            </div>
            <div class="author-text">
              <span class="nickname">{{ displayNickname(p.authorName) }}</span>
              <time class="rel-time" :datetime="p.createdAt">{{ formatRelativeTime(p.createdAt) }}</time>
            </div>
          </div>
          <button
            v-if="String(p.userId) === String(me?.id)"
            type="button"
            class="delete-post"
            @click="removePost(p._id)"
          >
            Delete
          </button>
        </div>

        <h3 class="post-title">{{ p.title }}</h3>
        <div class="tag-row">
          <span v-for="t in displayTags(p)" :key="t" class="post-tag" :class="tagClass(t)">#{{ tagLabel(t) }}</span>
        </div>
        <p class="post-content">{{ p.content }}</p>

        <div class="post-stats" role="group" aria-label="Engagement">
          <span class="stat">
            <span class="stat-icon" aria-hidden="true">❤️</span>
            <span class="stat-num">{{ p.likeCount ?? 0 }}</span>
          </span>
          <span class="stat">
            <span class="stat-icon" aria-hidden="true">💬</span>
            <span class="stat-num">{{ p.commentCount ?? 0 }}</span>
          </span>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.forum-page {
  max-width: 720px;
}

.forum-header {
  margin-bottom: 16px;
}

.forum-title {
  margin-bottom: 6px;
}

.forum-sub {
  margin: 0;
  font-size: 0.95rem;
  color: #486170;
  line-height: 1.45;
}

.toolbar-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-bottom: 16px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.filter-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex: 1 1 200px;
  min-width: 0;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

.filter-scroll::-webkit-scrollbar {
  height: 6px;
}

.filter-chip {
  flex: 0 0 auto;
  border: 1px solid #c8dbd7;
  background: #f8fcfa;
  color: var(--c6);
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.filter-chip:hover {
  border-color: var(--c3);
  color: var(--c5);
  background: #eef8f4;
}

.filter-chip.active {
  background: linear-gradient(135deg, var(--c2), var(--c3));
  border-color: transparent;
  color: #fff;
}

.search-wrap {
  flex: 1 1 180px;
  min-width: 160px;
  max-width: 320px;
}

.forum-search {
  width: 100%;
  border: 1px solid #c8dbd7;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 0.9rem;
  background: #fff;
}

.forum-search:focus {
  outline: 2px solid var(--c2);
  outline-offset: 1px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.create-panel {
  margin-bottom: 20px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.create-heading {
  margin: 0 0 12px;
  font-size: 1.05rem;
  color: var(--c6);
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-picker-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #5a7580;
  letter-spacing: 0.02em;
}

.tag-picker-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pick-chip {
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #c8dbd7;
  background: #f4faf7;
  color: var(--c5);
  transition: transform 0.12s ease, border-color 0.15s ease, background 0.15s ease;
}

.pick-chip:hover {
  border-color: var(--c3);
  background: #e8f5f0;
}

.pick-chip.on {
  background: linear-gradient(90deg, var(--c4), var(--c5));
  color: #fff;
  border-color: transparent;
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.publish-btn {
  width: auto;
  min-width: 132px;
  padding: 10px 22px;
  font-weight: 600;
  border-radius: 12px;
  transition: transform 0.18s ease, filter 0.15s ease;
}

.publish-btn:hover {
  transform: scale(1.04);
  filter: brightness(1.05);
}

.publish-btn:active {
  transform: scale(0.98);
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-hint {
  text-align: center;
  padding: 24px;
  background: #ffffffcc;
  border-radius: 16px;
  border: 1px dashed #c8dbd7;
}

.post-card {
  background: #fff;
  border: 1px solid #d9e9e6;
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.post-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.author-block {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgb(47 72 88 / 0.12);
}

.avatar-letter {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
}

.author-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.nickname {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--c6);
  letter-spacing: 0.01em;
}

.rel-time {
  font-size: 0.8rem;
  color: #6b8794;
}

.delete-post {
  flex-shrink: 0;
  background: transparent;
  color: #8a9aa3;
  border: 1px solid #d5e3df;
  padding: 6px 12px;
  font-size: 0.8rem;
  border-radius: 10px;
}

.delete-post:hover {
  color: #c44;
  border-color: #e8b4b4;
  background: #fff8f8;
  filter: none;
}

.post-title {
  margin: 0 0 10px;
  font-size: 1.15rem;
  line-height: 1.35;
  color: var(--text);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-bottom: 12px;
}

.post-tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}

.tag-diet {
  background: #e8f5e9;
  color: #1b5e20;
}

.tag-train {
  background: #e0f2f4;
  color: #0d47a1;
}

.tag-cut {
  background: #fff3e0;
  color: #e65100;
}

.tag-recover {
  background: #f3e5f5;
  color: #6a1b9a;
}

.tag-note {
  background: #e8f8f2;
  color: #1b5e4a;
}

.tag-general {
  background: #eef2f5;
  color: #455a64;
}

.post-content {
  margin: 0 0 14px;
  line-height: 1.55;
  color: #2c3d45;
  font-size: 0.95rem;
  white-space: pre-wrap;
}

.post-stats {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-top: 12px;
  border-top: 1px solid #e8f0ee;
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: #8aa0a8;
  cursor: default;
  padding: 4px 2px;
  border-radius: 8px;
  transition: color 0.15s ease, background 0.15s ease;
}

.stat:hover {
  color: var(--c5);
  background: #f0faf7;
}

.stat-icon {
  font-size: 1rem;
  opacity: 0.85;
}

.stat-num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
