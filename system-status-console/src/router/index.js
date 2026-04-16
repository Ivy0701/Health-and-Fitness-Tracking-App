import { createRouter, createWebHistory } from "vue-router";
import AdminLoginView from "../views/AdminLoginView.vue";
import StatusView from "../views/StatusView.vue";
import { isAdminAuthenticated } from "../services/adminAuth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "admin-login",
      component: AdminLoginView,
      meta: { guestOnly: true },
    },
    {
      path: "/",
      name: "admin-dashboard",
      component: StatusView,
      meta: { requiresAdminAuth: true },
    },
    {
      path: "/system-status",
      redirect: "/",
    },
    {
      path: "/dashboard",
      redirect: "/",
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

router.beforeEach((to) => {
  const authed = isAdminAuthenticated();
  if (to.meta?.requiresAdminAuth && !authed) {
    return { name: "admin-login", query: { redirect: to.fullPath } };
  }
  if (to.meta?.guestOnly && authed) {
    return { name: "admin-dashboard" };
  }
  return true;
});

export default router;

