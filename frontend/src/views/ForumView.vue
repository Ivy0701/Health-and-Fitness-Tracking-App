<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useFavorites } from "../services/favorites";
import { formatRelativeTime } from "../utils/formatRelativeTime";

const posts = ref([]);
const route = useRoute();
const form = reactive({ title: "", content: "" });
const me = ref(null);
const searchQuery = ref("");
const activeFilter = ref("all");
const expandedComments = ref({});
const commentDrafts = ref({});
const likeLoading = ref({});
const commentLoading = ref({});
const commentEditDrafts = ref({});
const commentEditLoading = ref({});
const { isFavorited, toggleFavorite, ensureFavoritesLoaded } = useFavorites();
const focusedPostId = ref("");
let focusTimer = null;

/** Tag keys stored in API (English slugs). */
const TAG_OPTIONS = [
  { value: "diet", label: "Diet" },
  { value: "training", label: "Training" },
  { value: "fat_loss", label: "Fat loss" },
  { value: "recovery", label: "Recovery" },
  { value: "notes", label: "Notes" },
];
const selectedTags = ref([]);

const TAG_LABEL_MAP = {
  diet: "Diet",
  training: "Training",
  fat_loss: "Fat loss",
  recovery: "Recovery",
  notes: "Notes",
  general: "General",
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
    diet: "tag-diet",
    training: "tag-train",
    fat_loss: "tag-cut",
    recovery: "tag-recover",
    notes: "tag-note",
    general: "tag-general",
  };
  return map[tag] || "tag-general";
}

function displayTags(p) {
  const raw = Array.isArray(p.tags) ? p.tags.filter(Boolean) : [];
  return raw.length ? raw : ["general"];
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
    rows = rows.filter((p) => (p.tags || []).includes("diet"));
  } else if (activeFilter.value === "train") {
    rows = rows.filter((p) => (p.tags || []).includes("training"));
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

async function focusPostFromQuery() {
  const focusId = String(route.query.focusItem || "").trim();
  if (!focusId) return;
  const exists = posts.value.some((post) => String(post?._id || "") === focusId);
  if (!exists) return;
  activeFilter.value = "all";
  searchQuery.value = "";
  focusedPostId.value = focusId;
  await nextTick();
  const el = document.querySelector(`[data-post-id="${focusId}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focusTimer) window.clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => {
    focusedPostId.value = "";
  }, 2200);
}

function isCommentsExpanded(postId) {
  return Boolean(expandedComments.value[postId]);
}

function toggleComments(postId) {
  expandedComments.value = {
    ...expandedComments.value,
    [postId]: !expandedComments.value[postId],
  };
}

function getCommentDraft(postId) {
  return commentDrafts.value[postId] || "";
}

function setCommentDraft(postId, value) {
  commentDrafts.value = {
    ...commentDrafts.value,
    [postId]: value,
  };
}

function commentKey(postId, commentId) {
  return `${postId}:${commentId}`;
}

function isCommentOwner(comment) {
  return String(comment?.userId) === String(me.value?.id);
}

function getEditDraft(postId, commentId) {
  return commentEditDrafts.value[commentKey(postId, commentId)] ?? null;
}

function startEditComment(postId, comment) {
  if (!comment?._id) return;
  commentEditDrafts.value = {
    ...commentEditDrafts.value,
    [commentKey(postId, comment._id)]: String(comment.content || ""),
  };
}

function cancelEditComment(postId, commentId) {
  const key = commentKey(postId, commentId);
  const next = { ...commentEditDrafts.value };
  delete next[key];
  commentEditDrafts.value = next;
}

function setEditDraft(postId, commentId, value) {
  commentEditDrafts.value = {
    ...commentEditDrafts.value,
    [commentKey(postId, commentId)]: value,
  };
}

function replacePost(updatedPost) {
  posts.value = posts.value.map((p) => (p._id === updatedPost._id ? updatedPost : p));
}

async function toggleLike(postId) {
  if (likeLoading.value[postId]) return;
  likeLoading.value = { ...likeLoading.value, [postId]: true };
  try {
    const updated = await api.patch(`/forum/posts/${postId}/like`).then((r) => r.data);
    replacePost(updated);
  } finally {
    likeLoading.value = { ...likeLoading.value, [postId]: false };
  }
}

async function submitComment(postId) {
  const content = getCommentDraft(postId).trim();
  if (!content || commentLoading.value[postId]) return;
  commentLoading.value = { ...commentLoading.value, [postId]: true };
  try {
    const updated = await api.post(`/forum/posts/${postId}/comments`, { content }).then((r) => r.data);
    replacePost(updated);
    setCommentDraft(postId, "");
    expandedComments.value = { ...expandedComments.value, [postId]: true };
  } finally {
    commentLoading.value = { ...commentLoading.value, [postId]: false };
  }
}

async function saveCommentEdit(postId, commentId) {
  const key = commentKey(postId, commentId);
  const content = String(commentEditDrafts.value[key] || "").trim();
  if (!content || commentEditLoading.value[key]) return;
  commentEditLoading.value = { ...commentEditLoading.value, [key]: true };
  try {
    const updated = await api
      .put(`/forum/posts/${postId}/comments/${commentId}`, { content })
      .then((r) => r.data);
    replacePost(updated);
    cancelEditComment(postId, commentId);
  } finally {
    commentEditLoading.value = { ...commentEditLoading.value, [key]: false };
  }
}

async function deleteComment(postId, commentId) {
  if (!window.confirm("Delete this comment?")) return;
  const updated = await api.delete(`/forum/posts/${postId}/comments/${commentId}`).then((r) => r.data);
  replacePost(updated);
  cancelEditComment(postId, commentId);
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

function isForumFavorited(postId) {
  return isFavorited("forum", String(postId || ""));
}

async function toggleForumFavorite(post) {
  await toggleFavorite({
    itemType: "forum",
    itemId: String(post._id),
    title: post.title,
    description: String(post.content || "").slice(0, 180),
    metadata: {
      authorName: post.authorName || "",
      likeCount: Number(post.likeCount || 0),
      commentCount: Number(post.commentCount || 0),
      tags: Array.isArray(post.tags) ? post.tags : [],
    },
    sourceType: "forum_post",
  });
}

onMounted(async () => {
  await Promise.all([load(), ensureFavoritesLoaded()]);
  await focusPostFromQuery();
});

watch(
  () => route.query.focusItem,
  async () => {
    await focusPostFromQuery();
  }
);
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
      <article
        v-for="p in visiblePosts"
        :key="p._id"
        class="post-card"
        :class="{ focused: focusedPostId === String(p._id) }"
        :data-post-id="String(p._id)"
      >
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
          <div class="post-top-actions">
            <button type="button" class="fav-post-btn" :class="{ active: isForumFavorited(p._id) }" @click="toggleForumFavorite(p)">
              {{ isForumFavorited(p._id) ? "★ Saved" : "☆ Save" }}
            </button>
            <button
              v-if="String(p.userId) === String(me?.id)"
              type="button"
              class="delete-post"
              @click="removePost(p._id)"
            >
              Delete
            </button>
          </div>
        </div>

        <h3 class="post-title">{{ p.title }}</h3>
        <div class="tag-row">
          <span v-for="t in displayTags(p)" :key="t" class="post-tag" :class="tagClass(t)">#{{ tagLabel(t) }}</span>
        </div>
        <p class="post-content">{{ p.content }}</p>

        <div class="post-stats" role="group" aria-label="Engagement">
          <button
            type="button"
            class="stat stat-btn like-btn"
            :class="{ liked: p.likedByMe }"
            :disabled="likeLoading[p._id]"
            @click="toggleLike(p._id)"
          >
            <span class="stat-icon" aria-hidden="true">{{ p.likedByMe ? "♥" : "♡" }}</span>
            <span class="stat-num">{{ p.likeCount ?? 0 }}</span>
          </button>
          <button type="button" class="stat stat-btn comment-btn" @click="toggleComments(p._id)">
            <span class="stat-icon" aria-hidden="true">💬</span>
            <span class="stat-num">{{ p.commentCount ?? 0 }}</span>
            <span class="comment-expand" aria-hidden="true">{{ isCommentsExpanded(p._id) ? "▴" : "▾" }}</span>
          </button>
        </div>

        <section v-if="isCommentsExpanded(p._id)" class="comments-panel">
          <form class="comment-form" @submit.prevent="submitComment(p._id)">
            <input
              :value="getCommentDraft(p._id)"
              type="text"
              class="comment-input"
              placeholder="Write a comment..."
              @input="setCommentDraft(p._id, $event.target.value)"
            />
            <button type="submit" class="comment-submit" :disabled="commentLoading[p._id]">Post</button>
          </form>
          <div class="comments-divider" aria-hidden="true"></div>
          <div class="comments-scroll">
          <p v-if="!(p.comments || []).length" class="comments-empty">No comments yet. Be the first one.</p>
          <ul v-else class="comment-list">
            <li v-for="c in p.comments" :key="c._id || `${c.userId}-${c.createdAt}`" class="comment-item">
              <div class="comment-avatar" :style="{ background: avatarColor(c.userId || c.authorName) }">
                <span class="avatar-letter comment-avatar-letter">{{ avatarInitial(c.authorName) }}</span>
              </div>
              <div class="comment-main">
                <div class="comment-head">
                  <span class="comment-author">{{ displayNickname(c.authorName) }}</span>
                  <time class="comment-time" :datetime="c.createdAt">{{ formatRelativeTime(c.createdAt) }}</time>
                </div>
                <p v-if="getEditDraft(p._id, c._id) === null" class="comment-content">{{ c.content }}</p>
                <div v-else class="comment-edit-row">
                  <input
                    :value="getEditDraft(p._id, c._id)"
                    type="text"
                    class="comment-edit-input"
                    @input="setEditDraft(p._id, c._id, $event.target.value)"
                  />
                  <button
                    type="button"
                    class="comment-action primary"
                    :disabled="commentEditLoading[`${p._id}:${c._id}`]"
                    @click="saveCommentEdit(p._id, c._id)"
                  >
                    Save
                  </button>
                  <button type="button" class="comment-action" @click="cancelEditComment(p._id, c._id)">Cancel</button>
                </div>
                <div v-if="isCommentOwner(c) && getEditDraft(p._id, c._id) === null" class="comment-actions">
                  <button type="button" class="comment-link" @click="startEditComment(p._id, c)">Edit</button>
                  <button type="button" class="comment-link danger" @click="deleteComment(p._id, c._id)">Delete</button>
                </div>
              </div>
            </li>
          </ul>
          </div>
        </section>
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

.post-card.focused {
  border-color: #4ab7a1;
  box-shadow: 0 0 0 2px rgba(72, 174, 164, 0.2);
  background: #f8fefd;
}

.post-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.post-top-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.fav-post-btn {
  border: 1px solid #d8e4e0;
  background: #f4f9f7;
  color: var(--c6);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.78rem;
}

.fav-post-btn.active {
  background: #fff8e5;
  border-color: #e7ce8d;
  color: #9a6a00;
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
  justify-content: flex-start;
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

.stat-btn {
  border: none;
  background: transparent;
  cursor: pointer;
}

.stat-btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.stat:hover {
  color: var(--c5);
  background: #f0faf7;
}

.like-btn.liked {
  color: #d63a64;
}

.comment-expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 8px;
  border: 1px solid transparent;
  background: #f4faf8;
  color: #68828d;
  font-size: 0.78rem;
  line-height: 1;
  border-radius: 999px;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.comment-btn:hover .comment-expand {
  background: #e8f4f0;
  color: #4a6571;
  border-color: #d6e7e2;
}

.stat-icon {
  font-size: 1rem;
  opacity: 0.85;
}

.stat-num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.comments-panel {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #dceae6;
}

.comments-divider {
  height: 1px;
  background: #edf2f4;
  margin: 10px 0 8px;
}

.comments-scroll {
  max-height: 340px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.comments-scroll::-webkit-scrollbar {
  width: 6px;
}

.comments-scroll::-webkit-scrollbar-thumb {
  background: #d8e4e8;
  border-radius: 999px;
}

.comments-empty {
  margin: 0;
  color: #6e8791;
  font-size: 0.86rem;
  padding: 4px 2px;
}

.comment-list {
  list-style: none;
  padding: 0;
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.comment-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 2px;
  border-bottom: 1px solid #edf2f4;
}

.comment-item:last-child {
  border-bottom: none;
}

.comment-avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.comment-avatar-letter {
  font-size: 0.85rem;
}

.comment-main {
  flex: 1;
  min-width: 0;
}

.comment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-author {
  font-weight: 700;
  color: var(--c6);
  font-size: 0.88rem;
}

.comment-time {
  font-size: 0.75rem;
  color: #9aaab2;
}

.comment-content {
  margin: 0;
  color: #2f424b;
  font-size: 0.86rem;
  line-height: 1.45;
}

.comment-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.comment-link {
  border: none;
  background: transparent;
  color: #6f8a95;
  font-size: 0.78rem;
  padding: 0;
}

.comment-link:hover {
  color: var(--c5);
  text-decoration: underline;
}

.comment-link.danger:hover {
  color: #c44;
}

.comment-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.comment-edit-input {
  flex: 1;
  border: 1px solid #c8dbd7;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 0.84rem;
}

.comment-action {
  width: auto;
  min-width: 58px;
  border-radius: 8px;
  font-size: 0.76rem;
  padding: 7px 10px;
  background: #eef3f5;
  color: #47606b;
}

.comment-action.primary {
  background: var(--c4);
  color: #fff;
}

.comment-form {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 10px;
  background: #f9fcfb;
}

.comment-input {
  flex: 1;
  border: 1px solid #c8dbd7;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 0.86rem;
}

.comment-submit {
  width: auto;
  min-width: 72px;
  border-radius: 10px;
  font-size: 0.84rem;
  padding: 8px 12px;
}
</style>
