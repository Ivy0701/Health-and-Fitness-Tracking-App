<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useFavorites } from "../services/favorites";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { useForumCenterStore } from "../stores/forumCenter";

const route = useRoute();
const form = reactive({ title: "", content: "" });
const publishErrors = reactive({ title: "", content: "" });
const publishNotice = ref("");
const searchQuery = ref("");
const activeFilter = ref("all");
const expandedComments = ref({});
const commentDrafts = ref({});
const commentInputRefs = ref({});
const { favorites, isFavorited, toggleFavorite, ensureFavoritesLoaded } = useFavorites();
const focusedPostId = ref("");
const createModalOpen = ref(false);
const saveNotice = ref("");
const feedError = ref("");
const postsLoading = ref(true);
const publishSubmitting = ref(false);
const publishError = ref(false);
const likeBusyPostId = ref("");
const commentBusyPostId = ref("");
/** Current user's posts from `GET /forum/posts/mine` (includes warned/removed). */
const myPosts = ref([]);
let focusTimer = null;

const forumCenter = useForumCenterStore();
const { currentUser: me, posts, savedPostIds } = storeToRefs(forumCenter);

const BASE_TAG_OPTIONS = [
  { value: "diet", label: "Diet" },
  { value: "training", label: "Training" },
  { value: "fat_loss", label: "Fat loss" },
  { value: "recovery", label: "Recovery" },
  { value: "notes", label: "Notes" },
];
const tagOptions = ref([...BASE_TAG_OPTIONS]);
const selectedTags = ref([]);
const customTagInput = ref("");
const showCustomTagInput = ref(false);

const TAG_LABEL_MAP = computed(() =>
  tagOptions.value.reduce((map, item) => ({ ...map, [item.value]: item.label }), { general: "General" })
);

/** Content filters only — “My Posts” lives in the header next to notifications. */
const FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "diet", label: "Diet" },
  { id: "train", label: "Training" },
  { id: "favorites", label: "Favorites" },
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
  const known = TAG_LABEL_MAP.value[tag];
  if (known) return known;
  return String(tag || "")
    .split("_")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function tagClass(tag) {
  if (tag === "general") return "tag-general";
  return "tag-recipe";
}

function displayTags(p) {
  const raw = Array.isArray(p.tags) ? p.tags.filter(Boolean) : [];
  return raw.length ? raw : ["general"];
}

function getPostComments(post) {
  return Array.isArray(post?.comments) ? post.comments : [];
}

function getCommentCount(post) {
  // Unified rule: include all comments currently stored (top-level + replies).
  return getPostComments(post).length;
}

function engagementScore(p) {
  return (p.likeCount || 0) + getCommentCount(p);
}

/** Match backend posts (`userId` + `authorName`) and any client-normalized shape. */
function isCurrentUserPost(p) {
  const uid = String(me.value?.id || me.value?._id || "").trim();
  const uname = String(me.value?.username || "").trim().toLowerCase();
  if (!uid && !uname) return false;
  const pid = String(p?.userId ?? "").trim();
  if (uid && pid && pid === uid) return true;
  const author = String(p?.authorName || "").trim().toLowerCase();
  if (uname && author && author === uname) return true;
  return false;
}

const feedSource = computed(() => (activeFilter.value === "mine" ? myPosts.value : posts.value));

const visiblePosts = computed(() => {
  let rows = [...feedSource.value];
  if (activeFilter.value !== "mine") {
    rows = rows.filter((p) => String(p?.status || "normal").toLowerCase() !== "removed");
  }

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

const filteredPosts = computed(() => {
  if (activeFilter.value !== "favorites") return visiblePosts.value;
  const saved = new Set(savedPostIds.value.map((id) => String(id)));
  return visiblePosts.value.filter((post) => saved.has(String(post?._id || "")));
});

const emptyFeedMessage = computed(() => {
  if (activeFilter.value === "mine") return "You haven't posted anything yet.";
  if (activeFilter.value === "favorites") return "No saved posts yet.";
  if (searchQuery.value.trim()) return "No posts match your search.";
  if (activeFilter.value === "diet") return "No Diet-tagged posts yet.";
  if (activeFilter.value === "train") return "No Training-tagged posts yet.";
  return "No posts match this filter.";
});

const isDatabaseEmpty = computed(
  () =>
    !postsLoading.value &&
    !feedError.value &&
    (Array.isArray(posts.value) ? posts.value.length : 0) === 0 &&
    activeFilter.value !== "mine" &&
    activeFilter.value !== "favorites"
);

const trimmedTitle = computed(() => String(form.title || "").trim());
const trimmedContent = computed(() => String(form.content || "").trim());
const isPublishDisabled = computed(() => !trimmedTitle.value || !trimmedContent.value);
const myUserId = computed(() => String(me.value?.id || me.value?._id || "").trim());

function syncSavedPostIdsFromFavorites() {
  const ids = (Array.isArray(favorites.value) ? favorites.value : [])
    .filter((row) => String(row?.itemType || "").toLowerCase() === "forum")
    .map((row) => String(row?.itemId || ""))
    .filter(Boolean);
  forumCenter.setSavedPostIds(ids);
}

function toggleFormTag(value) {
  const i = selectedTags.value.indexOf(value);
  if (i === -1) selectedTags.value = [...selectedTags.value, value];
  else selectedTags.value = selectedTags.value.filter((t) => t !== value);
}

function sanitizeTagSlug(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function addCustomTag() {
  const raw = String(customTagInput.value || "").trim();
  const value = sanitizeTagSlug(raw);
  if (!raw || !value) return;
  if (!tagOptions.value.some((tag) => tag.value === value)) {
    tagOptions.value = [...tagOptions.value, { value, label: raw }];
  }
  if (!selectedTags.value.includes(value)) {
    selectedTags.value = [...selectedTags.value, value];
  }
  customTagInput.value = "";
  showCustomTagInput.value = false;
}

function handleTitleInput() {
  if (publishErrors.title) publishErrors.title = "";
  if (publishNotice.value) {
    publishNotice.value = "";
    publishError.value = false;
  }
}

function handleContentInput() {
  if (publishErrors.content) publishErrors.content = "";
  if (publishNotice.value) {
    publishNotice.value = "";
    publishError.value = false;
  }
}

function validatePublishForm() {
  publishErrors.title = trimmedTitle.value ? "" : "Title cannot be empty";
  publishErrors.content = trimmedContent.value ? "" : "Content cannot be empty";
  const valid = !publishErrors.title && !publishErrors.content;
  if (!valid) {
    publishNotice.value = "Please fill in all required fields before publishing";
    publishError.value = true;
  } else {
    publishNotice.value = "";
    publishError.value = false;
  }
  return valid;
}

function normalizeComments(comments, postId) {
  const rows = Array.isArray(comments) ? comments : [];
  return rows
    .map((comment, index) => ({
      id: String(comment?.id || comment?._id || `${postId}-comment-${index + 1}`),
      userId: String(comment?.userId ?? comment?.user?._id ?? "").trim(),
      authorName: String(comment?.authorName || comment?.author?.name || "Community friend"),
      text: String(comment?.text || comment?.content || "").trim(),
      createdAt: comment?.createdAt || new Date().toISOString(),
    }))
    .filter((comment) => comment.text);
}

function initializePostState(postRows) {
  return (Array.isArray(postRows) ? postRows : []).map((post) => {
    const baseLikeCount = Number(post?.likeCount);
    const nextLikeCount = Number.isFinite(baseLikeCount)
      ? Math.max(0, baseLikeCount)
      : Math.max(0, Number(post?.likes) || 0);
    const postId = String(post?._id || post?.id || "");
    return {
      ...post,
      _id: postId,
      likeCount: nextLikeCount,
      isLiked: Boolean(post?.isLiked ?? post?.likedByMe ?? false),
      comments: normalizeComments(post?.comments, postId),
    };
  });
}

function applyPostFromApi(raw) {
  const [one] = initializePostState([raw]);
  return one;
}

function mergeNormalizedPostIntoLocalLists(normalized) {
  if (!normalized?._id) return;
  forumCenter.replacePost(normalized);
  const id = String(normalized._id || "");
  const mi = myPosts.value.findIndex((p) => String(p?._id || "") === id);
  if (mi === -1) return;
  const next = [...myPosts.value];
  next[mi] = normalized;
  myPosts.value = next;
}

async function fetchMyPosts() {
  const uid = String(me.value?.id || me.value?._id || "").trim();
  if (!uid) {
    myPosts.value = [];
    return;
  }
  try {
    const rows = await api.get("/forum/posts/mine").then((r) => (Array.isArray(r.data) ? r.data : []));
    myPosts.value = initializePostState(rows);
  } catch {
    myPosts.value = [];
  }
}

async function load() {
  postsLoading.value = true;
  feedError.value = "";
  try {
    const [user, forumPosts] = await Promise.all([
      api.get("/users/me").then((r) => r.data),
      api.get("/forum/posts").then((r) => (Array.isArray(r.data) ? r.data : [])),
    ]);
    forumCenter.setCurrentUser(user);
    forumCenter.syncPosts(initializePostState(forumPosts));
    await fetchMyPosts();
    syncSavedPostIdsFromFavorites();
  } catch (e) {
    forumCenter.syncPosts([]);
    myPosts.value = [];
    feedError.value = e?.response?.data?.message || e?.message || "Failed to load forum posts.";
  } finally {
    postsLoading.value = false;
  }
}

async function focusPostById(postId, options = {}) {
  const targetId = String(postId || "").trim();
  if (!targetId) return;
  const exists =
    posts.value.some((post) => String(post?._id || "") === targetId) ||
    myPosts.value.some((post) => String(post?._id || "") === targetId);
  if (!exists) return;
  if (options.resetFilter !== false) {
    activeFilter.value = "all";
    searchQuery.value = "";
  }
  focusedPostId.value = targetId;
  await nextTick();
  const el = document.querySelector(`[data-post-id="${targetId}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focusTimer) window.clearTimeout(focusTimer);
  focusTimer = window.setTimeout(() => {
    focusedPostId.value = "";
  }, 2200);
}

async function focusPostFromQuery() {
  const focusId = String(route.query.focusItem || "").trim();
  if (!focusId) return;
  await focusPostById(focusId);
}

function isCommentSectionOpen(postId) {
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

function setCommentInputRef(postId, element) {
  const key = String(postId || "").trim();
  if (!key) return;
  if (element) {
    commentInputRefs.value = { ...commentInputRefs.value, [key]: element };
    return;
  }
  const next = { ...commentInputRefs.value };
  delete next[key];
  commentInputRefs.value = next;
}

function postIdOf(post) {
  const id = String(post?._id || post?.id || "").trim();
  return id;
}

function validatePostForFavorite(post) {
  const postId = postIdOf(post);
  const title = String(post?.title || "").trim();
  const content = String(post?.content || "").trim();
  if (!postId || (!title && !content)) {
    const error = new Error("This post cannot be saved because required data is missing.");
    error.code = "MISSING_REQUIRED_FIELDS";
    throw error;
  }
  return { postId, title, content };
}

async function handleToggleLike(postId, event) {
  event?.stopPropagation();
  const id = String(postId || "").trim();
  if (!id || likeBusyPostId.value === id) return;
  likeBusyPostId.value = id;
  saveNotice.value = "";
  try {
    const { data } = await api.patch(`/forum/posts/${id}/like`);
    const normalized = applyPostFromApi(data);
    mergeNormalizedPostIntoLocalLists(normalized);
    await fetchMyPosts();
  } catch (e) {
    saveNotice.value = e?.response?.data?.message || e?.message || "Failed to update like.";
  } finally {
    likeBusyPostId.value = "";
  }
}

async function handleSubmitComment(postId, text) {
  const cleanText = String(text || "").trim();
  const targetId = String(postId || "").trim();
  if (!cleanText || !targetId || commentBusyPostId.value === targetId) return;
  commentBusyPostId.value = targetId;
  saveNotice.value = "";
  try {
    const { data } = await api.post(`/forum/posts/${targetId}/comments`, { content: cleanText });
    const normalized = applyPostFromApi(data);
    mergeNormalizedPostIntoLocalLists(normalized);
    await fetchMyPosts();
    setCommentDraft(postId, "");
  } catch (e) {
    saveNotice.value = e?.response?.data?.message || e?.message || "Failed to post comment.";
  } finally {
    commentBusyPostId.value = "";
  }
}

async function handleDeleteComment(postId, commentId) {
  const targetPostId = String(postId || "").trim();
  const targetCommentId = String(commentId || "").trim();
  if (!targetPostId || !targetCommentId) return;
  saveNotice.value = "";
  try {
    const { data } = await api.delete(`/forum/posts/${targetPostId}/comments/${targetCommentId}`);
    const normalized = applyPostFromApi(data);
    mergeNormalizedPostIntoLocalLists(normalized);
    await fetchMyPosts();
  } catch (e) {
    saveNotice.value = e?.response?.data?.message || e?.message || "Failed to delete comment.";
  }
}

async function handleReplyComment(postId, comment) {
  const targetPostId = String(postId || "").trim();
  if (!targetPostId) return;
  const mentionName = String(comment?.authorName || "").trim();
  if (!mentionName) return;
  setCommentDraft(targetPostId, `@${mentionName} `);
  await nextTick();
  const input = commentInputRefs.value[targetPostId];
  if (!input) return;
  input.focus();
  if (typeof input.setSelectionRange === "function") {
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }
}

async function handleShareComment(postId, commentId) {
  const targetPostId = String(postId || "").trim();
  const targetCommentId = String(commentId || "").trim();
  if (!targetPostId || !targetCommentId) return;
  const url = `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(targetPostId)}&comment=${encodeURIComponent(targetCommentId)}`;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
    console.log("Comment link copied to clipboard!", url);
  } catch {
    console.log("Comment link copied to clipboard!", url);
  }
}

async function addPost() {
  if (!validatePublishForm()) return;
  publishSubmitting.value = true;
  publishError.value = false;
  publishNotice.value = "";
  try {
    await api.post("/forum/posts", {
      title: trimmedTitle.value,
      content: trimmedContent.value,
      tags: selectedTags.value,
    });
    form.title = "";
    form.content = "";
    selectedTags.value = [];
    customTagInput.value = "";
    showCustomTagInput.value = false;
    publishErrors.title = "";
    publishErrors.content = "";
    publishNotice.value = "Post created successfully.";
    publishError.value = false;
    await load();
    createModalOpen.value = false;
  } catch (e) {
    publishNotice.value = e?.response?.data?.message || e?.message || "Failed to create post.";
    publishError.value = true;
  } finally {
    publishSubmitting.value = false;
  }
}

async function removePost(id) {
  const key = String(id || "").trim();
  if (!key) return;
  saveNotice.value = "";
  try {
    await api.delete(`/forum/posts/${key}`);
    await load();
  } catch (e) {
    saveNotice.value = e?.response?.data?.message || e?.message || "Failed to delete post.";
  }
}

function isForumFavorited(postId) {
  const key = String(postId || "").trim();
  if (!key) return false;
  return isFavorited("forum", key);
}

async function toggleForumFavorite(post) {
  try {
    saveNotice.value = "";
    const { postId, title, content } = validatePostForFavorite(post);
    const summary = String(content).slice(0, 180);
    const result = await toggleFavorite({
      itemType: "forum",
      itemId: postId,
      title: title || summary || "Forum Post",
      description: summary,
      metadata: {
        id: postId,
        type: "forum",
        summary,
        contentPreview: summary,
        createdAt: post?.createdAt || new Date().toISOString(),
        sourcePage: "forum",
        currentUserId: String(me.value?.id || ""),
        authorName: post.authorName || "",
        likeCount: Number(post.likeCount || 0),
        commentCount: Number(getCommentCount(post)),
        tags: Array.isArray(post.tags) ? post.tags : [],
      },
      sourceType: "forum",
    });
    if (result?.action === "added") forumCenter.addSavedPostId(postId);
    if (result?.action === "removed") forumCenter.removeSavedPostId(postId);
    if (!result?.action) syncSavedPostIdsFromFavorites();
  } catch (err) {
    const message = err?.message || "Failed to update favorite status.";
    console.error("[Forum Save Error]", message, post);
    saveNotice.value = message;
  }
}

async function toggleMinePostsView() {
  if (!me.value) return;
  const next = activeFilter.value === "mine" ? "all" : "mine";
  activeFilter.value = next;
  if (next === "mine") await fetchMyPosts();
}

async function openSavedPost(postId) {
  await focusPostById(postId);
}

function openCreateModal() {
  createModalOpen.value = true;
}

function closeCreateModal() {
  createModalOpen.value = false;
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && createModalOpen.value) {
    closeCreateModal();
  }
}

onMounted(async () => {
  await Promise.all([load(), ensureFavoritesLoaded()]);
  syncSavedPostIdsFromFavorites();
  await focusPostFromQuery();
  window.addEventListener("keydown", handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});

watch(
  () => route.query.focusItem,
  async () => {
    await focusPostFromQuery();
  }
);

watch(
  favorites,
  () => {
    syncSavedPostIdsFromFavorites();
  },
  { deep: true }
);

watch(me, (u) => {
  if (!u && activeFilter.value === "mine") activeFilter.value = "all";
  if (!u) myPosts.value = [];
});
</script>

<template>
  <AppNavbar />
  <main class="page forum-page">
    <header class="forum-header">
      <div class="forum-head-row">
        <div>
          <h2 class="title forum-title">💬 Forum</h2>
          <p class="forum-sub">Share meals, workouts, and habits—stay motivated together.</p>
        </div>
        <div class="forum-head-actions">
          <button
            v-if="me"
            type="button"
            class="forum-my-posts-btn"
            :class="{ active: activeFilter === 'mine' }"
            :aria-pressed="activeFilter === 'mine' ? 'true' : 'false'"
            @click="toggleMinePostsView"
          >
            My Posts
          </button>
        </div>
      </div>
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
    <p v-if="saveNotice" class="save-notice">{{ saveNotice }}</p>

    <section class="post-list">
      <p v-if="postsLoading" class="forum-loading panel">Loading posts…</p>
      <div v-else-if="feedError" class="forum-feed-error panel" role="alert">
        <p>{{ feedError }}</p>
        <button type="button" class="retry-btn" @click="load">Retry</button>
      </div>
      <article v-else-if="isDatabaseEmpty" class="post-card empty-post-card empty-post-card--hero" aria-live="polite">
        <div class="empty-icon" aria-hidden="true">💬</div>
        <h3 class="empty-state-title">No posts yet</h3>
        <p class="empty-state-body">No posts yet. Create the first one to start the discussion.</p>
        <button type="button" class="empty-create-btn" @click="openCreateModal">Create post</button>
      </article>
      <template v-else-if="filteredPosts.length">
        <article
          v-for="p in filteredPosts"
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
                <div class="author-line">
                  <span class="nickname">{{ displayNickname(p.authorName) }}</span>
                  <span v-if="activeFilter === 'mine' && isCurrentUserPost(p)" class="your-post-badge">Your post</span>
                </div>
                <time class="rel-time" :datetime="p.createdAt">{{ formatRelativeTime(p.createdAt) }}</time>
              </div>
            </div>
            <div class="post-top-actions">
              <button
                type="button"
                class="fav-post-btn"
                :class="{ active: isForumFavorited(postIdOf(p)) }"
                @click.stop="toggleForumFavorite(p)"
              >
                {{ isForumFavorited(postIdOf(p)) ? "★ Saved" : "☆ Save" }}
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
          <p v-if="p.status === 'warned' && p.warningMessage" class="post-warning">
            ⚠ Warning: {{ p.warningMessage }}
          </p>
          <div class="tag-row">
            <span v-for="t in displayTags(p)" :key="t" class="post-tag" :class="tagClass(t)">#{{ tagLabel(t) }}</span>
          </div>
          <p class="post-content">{{ p.content }}</p>

          <div class="post-stats" role="group" aria-label="Engagement">
            <button
              type="button"
              class="stat stat-btn like-btn"
              :class="{ liked: p.isLiked }"
              :disabled="likeBusyPostId === p._id"
              @click="handleToggleLike(p._id, $event)"
            >
              <span class="stat-icon" aria-hidden="true">{{ p.isLiked ? "♥" : "♡" }}</span>
              <span class="stat-num">{{ p.likeCount ?? 0 }}</span>
            </button>
            <button type="button" class="stat stat-btn comment-btn" @click="toggleComments(p._id)">
              <span class="stat-icon" aria-hidden="true">💬</span>
              <span class="stat-num">{{ getCommentCount(p) }}</span>
              <span class="comment-expand" aria-hidden="true">{{ isCommentSectionOpen(p._id) ? "▴" : "▾" }}</span>
            </button>
          </div>
          <div v-if="activeFilter === 'favorites'" class="favorites-locate-row">
            <button type="button" class="favorite-locate-btn" @click="openSavedPost(p._id)">Open in feed</button>
          </div>

          <section v-if="isCommentSectionOpen(p._id)" class="comments-panel">
            <ul v-if="getCommentCount(p)" class="forum-comment-list">
              <li v-for="comment in getPostComments(p)" :key="comment.id" class="mock-comment-item">
                <div class="mock-comment-avatar" :style="{ background: avatarColor(comment.authorName) }">
                  <span class="avatar-letter mock-comment-avatar-letter">{{ avatarInitial(comment.authorName) }}</span>
                </div>
                <div class="mock-comment-body">
                  <div class="mock-comment-head">
                    <span class="mock-comment-name">{{ displayNickname(comment.authorName) }}</span>
                    <time class="mock-comment-time" :datetime="comment.createdAt">
                      {{ formatRelativeTime(comment.createdAt) }}
                    </time>
                  </div>
                  <p class="mock-comment-text">{{ comment.text }}</p>
                  <div class="mock-comment-actions">
                    <button type="button" class="mock-comment-action" @click="handleReplyComment(p._id, comment)">Reply</button>
                    <button type="button" class="mock-comment-action" @click="handleShareComment(p._id, comment.id)">Share</button>
                    <button
                      v-if="myUserId && String(comment.userId || '') === myUserId"
                      type="button"
                      class="mock-comment-action"
                      @click="handleDeleteComment(p._id, comment.id)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            </ul>
            <p v-else class="comments-empty">No comments yet. Be the first one.</p>
            <form class="comment-form" @submit.prevent="handleSubmitComment(p._id, getCommentDraft(p._id))">
              <input
                :value="getCommentDraft(p._id)"
                type="text"
                class="comment-input"
                placeholder="Add a comment..."
                :ref="(el) => setCommentInputRef(p._id, el)"
                @input="setCommentDraft(p._id, $event.target.value)"
                @keydown.enter.prevent="handleSubmitComment(p._id, getCommentDraft(p._id))"
              />
              <button type="submit" class="comment-submit" :disabled="commentBusyPostId === p._id">
                {{ commentBusyPostId === p._id ? "Sending…" : "Send" }}
              </button>
            </form>
          </section>
        </article>
      </template>
      <article v-else class="post-card empty-post-card" aria-live="polite">
        <div class="empty-icon" aria-hidden="true">{{ activeFilter === "mine" ? "📝" : "🔎" }}</div>
        <p class="empty-title">{{ emptyFeedMessage }}</p>
        <button type="button" class="empty-create-btn empty-create-btn--ghost" @click="openCreateModal">Create post</button>
      </article>
    </section>

    <button type="button" class="create-fab" aria-label="Create post" @click="openCreateModal">+ Create</button>

    <div v-if="createModalOpen" class="create-overlay" @click.self="closeCreateModal">
      <section class="panel create-modal" role="dialog" aria-modal="true" aria-label="Create Post">
        <div class="create-modal-head">
          <h3 class="create-heading">Create Post</h3>
          <button type="button" class="create-close" aria-label="Close" @click="closeCreateModal">×</button>
        </div>
        <form novalidate class="create-form" @submit.prevent="addPost">
          <input
            v-model="form.title"
            placeholder="Post title"
            :class="{ 'field-error': publishErrors.title }"
            @input="handleTitleInput"
          />
          <p v-if="publishErrors.title" class="field-hint">{{ publishErrors.title }}</p>
          <textarea
            v-model="form.content"
            placeholder="Share your thoughts..."
            rows="4"
            :class="{ 'field-error': publishErrors.content }"
            @input="handleContentInput"
          />
          <p v-if="publishErrors.content" class="field-hint">{{ publishErrors.content }}</p>
          <div class="tag-picker">
            <span class="tag-picker-label">Tags</span>
            <div class="tag-picker-chips">
              <button
                v-for="tag in tagOptions"
                :key="tag.value"
                type="button"
                class="pick-chip"
                :class="{ on: selectedTags.includes(tag.value) }"
                @click="toggleFormTag(tag.value)"
              >
                #{{ tag.label }}
              </button>
              <button type="button" class="pick-chip pick-chip-create" @click="showCustomTagInput = !showCustomTagInput">
                + Create a new tag
              </button>
            </div>
            <div v-if="showCustomTagInput" class="tag-create-row">
              <input
                v-model.trim="customTagInput"
                type="text"
                placeholder="Enter tag name"
                @keydown.enter.prevent="addCustomTag"
              />
              <button type="button" class="pick-chip on" @click="addCustomTag">Add</button>
            </div>
          </div>
          <div class="create-actions">
            <button type="submit" class="publish-btn" :disabled="isPublishDisabled || publishSubmitting">
              {{ publishSubmitting ? "Publishing…" : "Publish Post" }}
            </button>
          </div>
          <p v-if="publishNotice" class="publish-notice" :class="{ 'publish-notice--error': publishError }">{{ publishNotice }}</p>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.forum-page {
  max-width: 1180px;
}

.forum-header {
  margin-bottom: 16px;
  position: relative;
}

.forum-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.forum-head-actions {
  position: relative;
  flex-shrink: 0;
}

.forum-my-posts-btn {
  border: 1px solid #c8dbd7;
  background: #f7fcfa;
  color: var(--c6);
  border-radius: 999px;
  padding: 0 14px;
  min-height: 40px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.forum-my-posts-btn:hover {
  border-color: var(--c3);
  background: #eef8f4;
  color: #2f4858;
}

.forum-my-posts-btn.active {
  background: linear-gradient(135deg, #e4f5f0, #d0ebe3);
  border-color: #5eb5a8;
  color: #1a454d;
  box-shadow: 0 0 0 1px rgba(52, 139, 147, 0.28);
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

.save-notice {
  margin: -8px 0 12px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #f0c7c7;
  background: #fff7f7;
  color: #a55858;
  font-size: 0.8rem;
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
  max-width: 420px;
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

.pick-chip-create {
  border-style: dashed;
}

.tag-create-row {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.tag-create-row input {
  flex: 1;
  min-width: 0;
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

.publish-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  filter: none;
}

.create-form input.field-error,
.create-form textarea.field-error {
  border-color: #e19c9c;
  background: #fff7f7;
}

.field-hint {
  margin: -6px 0 2px;
  color: #be5f5f;
  font-size: 0.78rem;
}

.publish-notice {
  margin: 2px 0 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #c8ded7;
  background: #f0faf6;
  color: #1b5c4a;
  font-size: 0.8rem;
}

.publish-notice--error {
  border-color: #f0c7c7;
  background: #fff7f7;
  color: #a55858;
}

.like-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.comment-submit:disabled {
  opacity: 0.6;
  cursor: wait;
}

.post-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}

.empty-post-card {
  grid-column: 1 / -1;
  text-align: center;
  padding: 26px 20px;
}

.empty-icon {
  font-size: 24px;
  margin-bottom: 8px;
  opacity: 0.72;
}

.empty-title {
  margin: 0;
  color: #6b7280;
  font-size: 0.95rem;
  font-weight: 500;
}

.forum-loading {
  grid-column: 1 / -1;
  margin: 0;
  padding: 18px 16px;
  text-align: center;
  color: #486170;
  font-size: 0.95rem;
}

.forum-feed-error {
  grid-column: 1 / -1;
  padding: 18px 16px;
  text-align: center;
  color: #a55858;
  border-color: #f0c7c7;
}

.forum-feed-error .retry-btn {
  margin-top: 12px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid #d3e1df;
  background: #eef3f2;
  color: #2f4858;
  font-weight: 600;
  cursor: pointer;
}

.empty-post-card--hero {
  padding: 32px 22px 28px;
}

.empty-state-title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--c6, #1f3b42);
}

.empty-state-body {
  margin: 0 auto 18px;
  max-width: 420px;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #486170;
}

.empty-create-btn {
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, var(--c5), var(--c6));
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 8px 16px rgb(47 72 88 / 0.18);
}

.empty-create-btn--ghost {
  margin-top: 12px;
  background: #eef3f2;
  color: #2f4858;
  border: 1px solid #d3e1df;
  box-shadow: none;
}

.post-card {
  width: 100%;
  height: 100%;
  min-height: 312px;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #d9e9e6;
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.create-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 20;
  width: auto;
  min-width: 118px;
  border-radius: 999px;
  padding: 12px 18px;
  border: none;
  background: linear-gradient(135deg, var(--c5), var(--c6));
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
  box-shadow: 0 12px 20px rgb(47 72 88 / 0.26);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}

.create-fab:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 16px 24px rgb(47 72 88 / 0.3);
  filter: brightness(1.02);
}

.create-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgb(12 28 35 / 0.36);
  display: grid;
  place-items: center;
  padding: 16px;
}

.create-modal {
  width: min(620px, 100%);
  max-height: min(88vh, 760px);
  overflow: auto;
  box-shadow: 0 16px 28px rgb(47 72 88 / 0.24);
}

.create-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.create-close {
  border: 1px solid #d5e3df;
  background: #f4faf7;
  color: #5d7782;
  border-radius: 10px;
  width: 34px;
  height: 34px;
  font-size: 22px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.create-close:hover {
  border-color: var(--c3);
  color: var(--c6);
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

.author-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}

.your-post-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #2f6f62;
  background: #e4f4ee;
  border: 1px solid #b8dfd2;
  border-radius: 999px;
  padding: 2px 8px;
  line-height: 1.3;
  flex-shrink: 0;
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
  min-height: calc(1.35em * 2);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-bottom: 12px;
  min-height: 28px;
  align-content: flex-start;
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

.tag-recipe {
  background: #e8f5f1;
  color: #205a53;
}

.post-content {
  margin: 0 0 14px;
  line-height: 1.55;
  color: #2c3d45;
  font-size: 0.95rem;
  white-space: pre-wrap;
  min-height: calc(1.55em * 3);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.post-warning {
  margin: -2px 0 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #f3d8a0;
  background: #fff8e6;
  color: #8a5a00;
  font-size: 0.82rem;
  line-height: 1.4;
}

.post-stats {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 20px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid #e8f0ee;
}

.favorites-locate-row {
  margin-top: 8px;
}

.favorite-locate-btn {
  border: 1px solid #c8dbd7;
  background: #f3faf7;
  color: var(--c5);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 600;
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
  margin: 0 0 8px;
  color: #6e8791;
  font-size: 0.86rem;
  padding: 4px 2px;
}

.forum-comment-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: grid;
  gap: 8px;
}

.mock-comment-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 10px;
  background: #f8fafb;
  padding: 8px;
}

.mock-comment-avatar {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mock-comment-avatar-letter {
  font-size: 0.7rem;
}

.mock-comment-body {
  min-width: 0;
  flex: 1;
}

.mock-comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.mock-comment-name {
  font-size: 0.78rem;
  font-weight: 700;
  color: #46606a;
}

.mock-comment-time {
  font-size: 0.7rem;
  color: #8da0a8;
}

.mock-comment-text {
  margin: 0;
  font-size: 0.82rem;
  color: #314651;
  line-height: 1.4;
}

.mock-comment-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.mock-comment-action {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 0.72rem;
  color: #9aa7ad;
  line-height: 1;
}

.mock-comment-action:hover {
  color: #627883;
  text-decoration: underline;
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

.reply-form {
  margin-top: 8px;
  margin-left: 30px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.reply-input {
  min-width: 0;
}

.reply-error {
  margin: 6px 0 0 30px;
  color: #be5f5f;
  font-size: 0.76rem;
}

.reply-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.reply-item {
  margin-left: 30px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f8fbfb;
  border: 1px solid #e4eeeb;
}

.reply-avatar {
  width: 28px;
  height: 28px;
}

.reply-item .comment-author {
  font-size: 0.82rem;
}

.reply-item .comment-time {
  font-size: 0.72rem;
}

.reply-item .comment-content {
  font-size: 0.82rem;
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

@media (max-width: 980px) {
  .post-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .create-fab {
    right: 16px;
    bottom: 16px;
    min-width: 104px;
    padding: 11px 14px;
  }

  .forum-head-row {
    align-items: center;
  }
}
</style>
