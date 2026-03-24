<template>
  <nav class="nav">
    <router-link to="/dashboard">Dashboard</router-link>
    <router-link to="/courses">Courses</router-link>
    <router-link to="/workouts">Workout</router-link>
    <router-link to="/diet">Diet</router-link>
    <router-link to="/schedule">Schedule</router-link>
    <router-link to="/profile">Profile</router-link>
    <router-link to="/favorites">Favorites</router-link>
    <router-link to="/feedback">Feedback</router-link>
    <router-link to="/vip">VIP</router-link>
  </nav>
</template>

<style scoped>
.nav {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #eaf3ff;
  flex-wrap: wrap;
}
a {
  color: #1e3a8a;
  text-decoration: none;
}
</style>
