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
      <div class="palette">
        <span>#A7F2AD</span><span>#70D1AC</span><span>#48AEA4</span>
        <span>#348B93</span><span>#316879</span><span>#2F4858</span>
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
.palette { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #2f4858; }
.palette span { background: #f3f9f8; border: 1px solid #d6e8e4; padding: 4px 8px; border-radius: 999px; }
</style>
