<template>
  <main class="page">
    <section class="hero panel">
      <h1 class="title">🌿 Health & Fitness Tracking App</h1>
      <p class="muted">
        Track BMI, workouts, diet, schedule, and your daily progress in one dashboard.
      </p>
      <div class="actions">
        <router-link class="btn" to="/login">🔐 Login</router-link>
        <router-link class="btn ghost" to="/register">📝 Register</router-link>
      </div>
    </section>
    <section class="grid grid-2">
      <article class="card">📊 Dashboard overview</article>
      <article class="card">💪 Workout records</article>
      <article class="card">🥗 Diet tracking</article>
      <article class="card">🗓 Smart schedule</article>
    </section>
  </main>
</template>

<style scoped>
.hero { text-align: center; margin-bottom: 16px; }
.actions { display: flex; justify-content: center; gap: 12px; margin: 14px 0; }
.ghost { background: linear-gradient(90deg, #48aea4, #348b93); }
</style>
