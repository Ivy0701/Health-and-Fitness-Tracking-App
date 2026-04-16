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
    <section class="features-grid">
      <article class="feature-card">
        <div class="feature-head">
          <span class="feature-icon">📊</span>
          <div class="feature-title">Dashboard overview</div>
        </div>
        <p class="feature-desc">Track your daily progress and key stats.</p>
      </article>
      <article class="feature-card">
        <div class="feature-head">
          <span class="feature-icon">💪</span>
          <div class="feature-title">Workout records</div>
        </div>
        <p class="feature-desc">Log workouts and monitor performance.</p>
      </article>
      <article class="feature-card">
        <div class="feature-head">
          <span class="feature-icon">🥗</span>
          <div class="feature-title">Diet tracking</div>
        </div>
        <p class="feature-desc">Manage calorie intake and nutrition.</p>
      </article>
      <article class="feature-card">
        <div class="feature-head">
          <span class="feature-icon">🗓</span>
          <div class="feature-title">Smart schedule</div>
        </div>
        <p class="feature-desc">Plan and organize your fitness routine.</p>
      </article>
    </section>
  </main>
</template>

<style scoped>
.hero { text-align: center; margin-bottom: 16px; }
.actions { display: flex; justify-content: center; gap: 12px; margin: 14px 0; }
.ghost { background: linear-gradient(90deg, #48aea4, #348b93); }

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  align-items: stretch;
  gap: 16px;
}

.feature-card {
  margin: 0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 132px;
  height: 132px;
  padding: 16px;
  justify-content: flex-start;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #d9e9e6;
  border-radius: 16px;
  box-shadow: 0 2px 6px rgba(47, 72, 88, 0.06);
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 18px rgba(47, 72, 88, 0.14);
}

.feature-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
}

.feature-icon {
  line-height: 1;
  flex: 0 0 auto;
}

.feature-title {
  font-weight: 700;
  color: var(--c6);
  font-size: 0.95rem;
  line-height: 1.3;
  min-height: calc(1.3em * 1);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.feature-desc {
  margin: 0;
  color: #56737f;
  font-size: 0.9rem;
  line-height: 1.4;
  min-height: calc(1.4em * 2);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

@media (max-width: 920px) {
  .features-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
