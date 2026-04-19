import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

import LandingView from "../views/LandingView.vue";
import LoginView from "../views/LoginView.vue";
import RegisterView from "../views/RegisterView.vue";
import ResetPasswordView from "../views/ResetPasswordView.vue";
import AssessmentView from "../views/AssessmentView.vue";
import DashboardView from "../views/DashboardView.vue";
import CoursesView from "../views/CoursesView.vue";
import WorkoutView from "../views/WorkoutView.vue";
import WorkoutSessionView from "../views/WorkoutSessionView.vue";
import DietView from "../views/DietView.vue";
import ScheduleView from "../views/ScheduleView.vue";
import ProfileView from "../views/ProfileView.vue";
import FavoritesView from "../views/FavoritesView.vue";
import ForumView from "../views/ForumView.vue";
import VipView from "../views/VipView.vue";
import PremiumCoursePage from "../views/PremiumCoursePage.vue";
import CourseLearningView from "../views/CourseLearningView.vue";
import api from "../services/api";

const routes = [
  { path: "/", component: LandingView },
  { path: "/login", component: LoginView },
  { path: "/register", component: RegisterView },
  { path: "/reset-password", component: ResetPasswordView },
  { path: "/assessment", component: AssessmentView, meta: { auth: true } },
  { path: "/dashboard", component: DashboardView, meta: { auth: true } },
  { path: "/courses", component: CoursesView, meta: { auth: true } },
  {
    path: "/courses/:id/learn",
    component: CourseLearningView,
    meta: { auth: true },
    beforeEnter: async (to) => {
      const auth = useAuthStore();
      const courseId = to.params.id;
      if (!courseId) return "/courses";
      try {
        const { data } = await api.get(`/courses/${courseId}`);
        if (data?.isPremium && !auth.vipStatus) {
          return "/vip";
        }
        return true;
      } catch {
        return "/courses";
      }
    },
  },
  { path: "/workout", component: WorkoutView, meta: { auth: true } },
  { path: "/workout/session", component: WorkoutSessionView, meta: { auth: true } },
  { path: "/diet", component: DietView, meta: { auth: true } },
  { path: "/schedule", component: ScheduleView, meta: { auth: true } },
  { path: "/profile", component: ProfileView, meta: { auth: true } },
  { path: "/favorites", component: FavoritesView, meta: { auth: true } },
  { path: "/forum", component: ForumView, meta: { auth: true } },
  { path: "/vip", component: VipView, meta: { auth: true } },
  { path: "/premium-course", component: PremiumCoursePage, meta: { auth: true, vip: true } },
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
    if (!completed && to.path !== "/assessment" && to.path !== "/reset-password") {
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
