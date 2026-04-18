<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "../../stores/auth";
import { useNotificationsStore } from "../../stores/notifications";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

const auth = useAuthStore();
const notifications = useNotificationsStore();
const { items, unreadCount, loading } = storeToRefs(notifications);
const router = useRouter();

const open = ref(false);
const rootEl = ref(null);

const displayTitle = (item) => {
  const t = String(item?.title || "").trim();
  if (t) return t;
  if (item?.type === "post_removed") return "Post removed";
  if (item?.type === "post_warning") return "Post warning";
  return "Notification";
};

function notifyItemClass(item) {
  const t = String(item?.type || "");
  if (t === "post_removed") return "notify-item notify-item--removed";
  if (t === "post_warning") return "notify-item notify-item--warning";
  return "notify-item";
}

function togglePanel() {
  if (!auth.isLoggedIn) return;
  open.value = !open.value;
  if (open.value) notifications.fetchList().catch(() => null);
}

function closePanel() {
  open.value = false;
}

async function handleItemClick(item) {
  const id = String(item?._id || item?.id || "").trim();
  const postId = String(item?.relatedPostId || item?.postId || "").trim();
  const type = String(item?.type || "");

  if (id && item?.isRead === false) {
    await notifications.markOneRead(id);
  }
  closePanel();

  if (!postId) return;
  if (type === "post_removed") {
    await router.push({ path: "/forum" });
    return;
  }
  await router.push({ path: "/forum", query: { focusItem: postId } });
}

function onDocClick(e) {
  if (!open.value) return;
  const el = rootEl.value;
  if (el && !el.contains(e.target)) closePanel();
}

const showBadge = computed(() => auth.isLoggedIn && unreadCount.value > 0);

onMounted(() => {
  if (auth.isLoggedIn) notifications.fetchList().catch(() => null);
  document.addEventListener("click", onDocClick, true);
});

watch(
  () => auth.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) notifications.fetchList().catch(() => null);
    else {
      closePanel();
      notifications.clear();
    }
  }
);

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick, true);
});
</script>

<template>
  <div v-if="auth.isLoggedIn" ref="rootEl" class="notify-wrap">
    <button type="button" class="notify-btn" aria-label="Notifications" :aria-expanded="open ? 'true' : 'false'" @click.stop="togglePanel">
      <span aria-hidden="true">🔔</span>
      <span v-if="showBadge" class="notify-badge">{{ unreadCount > 99 ? "99+" : unreadCount }}</span>
    </button>
    <div v-if="open" class="notify-dropdown" role="menu" @click.stop>
      <div class="notify-head">
        <p class="notify-title">Notifications</p>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="notify-mark-all"
          @click="notifications.markAllRead()"
        >
          Mark all read
        </button>
      </div>
      <p v-if="loading" class="notify-empty">Loading…</p>
      <ul v-else-if="items.length" class="notify-list">
        <li v-for="item in items" :key="item._id || item.id" role="none">
          <button type="button" role="menuitem" :class="notifyItemClass(item)" @click="handleItemClick(item)">
            <span class="notify-item-title">{{ displayTitle(item) }}</span>
            <span class="notify-item-msg">{{ item.message }}</span>
            <span v-if="String(item.reason || '').trim()" class="notify-item-reason">
              <strong>Reason:</strong>
              {{ item.reason }}
            </span>
            <small class="notify-item-time">{{ formatRelativeTime(item.createdAt) }}</small>
          </button>
        </li>
      </ul>
      <p v-else class="notify-empty">No notifications yet.</p>
    </div>
  </div>
</template>

<style scoped>
.notify-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.notify-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid rgba(47, 72, 88, 0.2);
  background: rgba(255, 255, 255, 0.55);
  color: #16313f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.notify-btn:hover {
  border-color: rgba(47, 72, 88, 0.35);
  background: rgba(255, 255, 255, 0.85);
}

.notify-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #ffffff;
  font-size: 11px;
  line-height: 18px;
  font-weight: 700;
  text-align: center;
}

.notify-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: min(380px, 92vw);
  max-height: 360px;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid #d9e9e6;
  background: #ffffff;
  box-shadow: 0 8px 18px rgb(47 72 88 / 0.16);
  padding: 10px 10px 12px;
  z-index: 2000;
}

.notify-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.notify-title {
  margin: 0;
  font-size: 0.85rem;
  color: #2f4858;
  font-weight: 700;
}

.notify-mark-all {
  border: none;
  background: transparent;
  color: #348b93;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  padding: 2px 4px;
}

.notify-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.notify-item {
  width: 100%;
  text-align: left;
  border: 1px solid #dceae6;
  background: #f7fcfa;
  border-radius: 10px;
  padding: 10px 10px 8px;
  display: grid;
  gap: 6px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.notify-item:hover {
  border-color: #c0ddd4;
  background: #f0faf6;
}

.notify-item--removed {
  border-color: #fecaca;
  background: #fff5f5;
}

.notify-item--warning {
  border-color: #fde68a;
  background: #fffbeb;
}

.notify-item-title {
  font-size: 0.82rem;
  font-weight: 800;
  color: #1f3a42;
  line-height: 1.25;
}

.notify-item-msg {
  color: #34505b;
  font-size: 0.84rem;
  line-height: 1.4;
}

.notify-item-reason {
  font-size: 0.78rem;
  line-height: 1.45;
  color: #4a3f35;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px dashed rgba(47, 72, 88, 0.15);
}

.notify-item--removed .notify-item-reason {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(255, 255, 255, 0.9);
}

.notify-item--warning .notify-item-reason {
  border-color: rgba(217, 119, 6, 0.35);
}

.notify-item-time {
  color: #7a919a;
  font-size: 0.74rem;
}

.notify-empty {
  margin: 6px 0 2px;
  color: #7a919a;
  font-size: 0.84rem;
}
</style>
