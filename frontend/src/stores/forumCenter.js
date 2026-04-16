import { defineStore } from "pinia";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

export const useForumCenterStore = defineStore("forumCenter", {
  state: () => ({
    currentUser: null,
    posts: [],
    notifications: [],
    savedPostIds: [],
  }),
  getters: {
    unreadCount: (state) => asList(state.notifications).filter((item) => item?.isRead === false).length,
  },
  actions: {
    setCurrentUser(user) {
      this.currentUser = user || null;
    },
    setSavedPostIds(ids) {
      const next = [...new Set(asList(ids).map((id) => String(id || "").trim()).filter(Boolean))];
      this.savedPostIds = next;
    },
    addSavedPostId(id) {
      const key = String(id || "").trim();
      if (!key || this.savedPostIds.includes(key)) return;
      this.savedPostIds = [...this.savedPostIds, key];
    },
    removeSavedPostId(id) {
      const key = String(id || "").trim();
      this.savedPostIds = this.savedPostIds.filter((item) => item !== key);
    },
    setNotifications(rows) {
      this.notifications = asList(rows);
    },
    markAllNotificationsRead() {
      this.notifications = this.notifications.map((item) => ({ ...item, isRead: true }));
    },
    syncPosts(nextPosts) {
      this.posts = asList(nextPosts);
    },
    replacePost(updatedPost) {
      if (!updatedPost?._id) return;
      const next = this.posts.map((item) => (String(item?._id || "") === String(updatedPost._id) ? updatedPost : item));
      this.syncPosts(next);
    },
  },
});
