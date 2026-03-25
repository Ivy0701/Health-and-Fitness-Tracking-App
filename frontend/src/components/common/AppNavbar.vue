<script setup>
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth";

const router = useRouter();
const auth = useAuthStore();

function logout() {
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <nav class="nav">
    <router-link to="/dashboard">🏠 Dashboard</router-link>
    <router-link to="/courses">📚 Courses</router-link>
    <router-link to="/workouts">💪 Workout</router-link>
    <router-link to="/diet">🥗 Diet</router-link>
    <router-link to="/schedule">🗓 Schedule</router-link>
    <router-link to="/profile">👤 Profile</router-link>
    <router-link to="/favorites">⭐ Favorites</router-link>
    <router-link to="/forum">💬 论坛</router-link>
    <router-link to="/vip">👑 VIP</router-link>
    <button class="logout" @click="logout">🚪 Logout</button>
  </nav>
</template>

<style scoped>
.nav {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(90deg, #a7f2ad 0%, #70d1ac 40%, #48aea4 100%);
  flex-wrap: wrap;
  border-bottom: 2px solid #2f4858;
}
a {
  color: #16313f;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(47, 72, 88, 0.16);
  padding: 6px 10px;
  border-radius: 999px;
}
a.router-link-active {
  background: #2f4858;
  color: #fff;
}
.logout {
  margin-left: auto;
  border: none;
  border-radius: 999px;
  background: #2f4858;
  color: #fff;
  padding: 6px 12px;
  cursor: pointer;
}
</style>
