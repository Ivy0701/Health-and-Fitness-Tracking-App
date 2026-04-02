import { defineStore } from "pinia";
import api from "../services/api";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem("token") || "",
    user: null
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    assessmentCompleted: (state) => !!state.user?.assessment_completed
  },
  actions: {
    normalizeUser(user) {
      if (!user) return null;
      return {
        ...user,
        vip_status: Boolean(user.vip_status ?? user.isVip)
      };
    },
    async login(payload) {
      const { data } = await api.post("/auth/login", payload);
      this.token = data.token;
      this.user = this.normalizeUser(data.user);
      localStorage.setItem("token", data.token);
    },
    async register(payload) {
      const { data } = await api.post("/auth/register", payload);
      this.token = data.token;
      this.user = this.normalizeUser(data.user);
      localStorage.setItem("token", data.token);
    },
    logout() {
      this.token = "";
      this.user = null;
      localStorage.removeItem("token");
    },
    async fetchMe() {
      if (!this.token) return;
      const { data } = await api.get("/users/me");
      this.user = this.normalizeUser(data);
    },
    setVipStatus(vipStatus) {
      if (!this.user) return;
      this.user = {
        ...this.user,
        vip_status: Boolean(vipStatus),
        isVip: Boolean(vipStatus)
      };
    }
  }
});
