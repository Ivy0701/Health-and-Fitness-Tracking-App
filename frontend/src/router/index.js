import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

import LandingView from "../views/LandingView.vue";
import LoginView from "../views/LoginView.vue";
import RegisterView from "../views/RegisterView.vue";
import AssessmentView from "../views/AssessmentView.vue";
import DashboardView from "../views/DashboardView.vue";
import CoursesView from "../views/CoursesView.vue";
import WorkoutView from "../views/WorkoutView.vue";
import DietView from "../views/DietView.vue";
import ScheduleView from "../views/ScheduleView.vue";
import ProfileView from "../views/ProfileView.vue";
import FavoritesView from "../views/FavoritesView.vue";
import ForumView from "../views/ForumView.vue";
import VipView from "../views/VipView.vue";

const routes = [
  { path: "/", component: LandingView },
  { path: "/login", component: LoginView },
  { path: "/register", component: RegisterView },
  { path: "/assessment", component: AssessmentView, meta: { auth: true } },
  { path: "/dashboard", component: DashboardView, meta: { auth: true } },
  { path: "/courses", component: CoursesView, meta: { auth: true } },
  { path: "/workout", component: WorkoutView, meta: { auth: true } },
  { path: "/diet", component: DietView, meta: { auth: true } },
  { path: "/schedule", component: ScheduleView, meta: { auth: true } },
  { path: "/profile", component: ProfileView, meta: { auth: true } },
  { path: "/favorites", component: FavoritesView, meta: { auth: true } },
  { path: "/forum", component: ForumView, meta: { auth: true } },
  { path: "/vip", component: VipView, meta: { auth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.auth && !auth.isLoggedIn) {
    return "/login";
  }

  if (auth.isLoggedIn && !auth.user) {
    try {
      await auth.fetchMe();
    } catch (error) {
      auth.logout();
      return "/login";
    }
  }

  if (auth.isLoggedIn && auth.user) {
    const completed = !!auth.user.assessment_completed;
    if (!completed && to.path !== "/assessment") {
      return "/assessment";
    }
    if (completed && to.path === "/assessment") {
      return "/dashboard";
    }
    if ((to.path === "/login" || to.path === "/register") && completed) {
      return "/dashboard";
    }
    if ((to.path === "/login" || to.path === "/register") && !completed) {
      return "/assessment";
    }
  }

  return true;
});

export default router;
