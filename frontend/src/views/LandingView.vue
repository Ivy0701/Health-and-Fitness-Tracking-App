<template>
  <main class="page">
    <h1>Health and Fitness Tracking Web App</h1>
    <p>Track BMI, workouts, diet, schedule, and more.</p>
    <div class="actions">
      <router-link to="/login">Login</router-link>
      <router-link to="/register">Register</router-link>
    </div>
  </main>
</template>

<style scoped>
.page { padding: 40px; text-align: center; }
.actions { display: flex; justify-content: center; gap: 16px; }
</style>
