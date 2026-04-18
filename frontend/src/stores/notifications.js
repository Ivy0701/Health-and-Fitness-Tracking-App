import { defineStore } from "pinia";
import api from "../services/api";

function asList(value) {
  return Array.isArray(value) ? value : [];
}

export const useNotificationsStore = defineStore("notifications", {
  state: () => ({
    items: [],
    loading: false,
  }),
  getters: {
    unreadCount: (state) => asList(state.items).filter((item) => item?.isRead === false).length,
  },
  actions: {
    async fetchList() {
      this.loading = true;
      try {
        const rows = await api.get("/notifications").then((r) => (Array.isArray(r.data) ? r.data : []));
        this.items = asList(rows);
      } catch {
        this.items = [];
      } finally {
        this.loading = false;
      }
    },
    patchItem(updated) {
      const id = String(updated?._id || updated?.id || "").trim();
      if (!id) return;
      this.items = this.items.map((row) => (String(row?._id || row?.id || "") === id ? { ...row, ...updated } : row));
    },
    markAllReadLocal() {
      this.items = this.items.map((item) => ({ ...item, isRead: true }));
    },
    async markOneRead(id) {
      const nid = String(id || "").trim();
      if (!nid) return null;
      try {
        const { data } = await api.post(`/notifications/item/${nid}/read`);
        this.patchItem(data);
        return data;
      } catch {
        return null;
      }
    },
    async markAllRead() {
      try {
        await api.post("/notifications/read");
        this.markAllReadLocal();
      } catch {
        /* ignore */
      }
    },
    clear() {
      this.items = [];
      this.loading = false;
    },
  },
});
