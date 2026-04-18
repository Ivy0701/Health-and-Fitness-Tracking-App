<script setup>
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();

/** Feature cards: whole card is a link — logged-in users go to the module; guests go to login. */
const landingModules = [
  {
    key: "dashboard",
    theme: "dashboard",
    icon: "📊",
    title: "Dashboard",
    desc: "Track your daily progress and key stats.",
    path: "/dashboard",
  },
  {
    key: "courses",
    theme: "courses",
    icon: "📚",
    title: "Courses",
    desc: "Browse and join structured training programs.",
    path: "/courses",
  },
  {
    key: "workout",
    theme: "workout",
    icon: "💪",
    title: "Workout",
    desc: "Log workouts and monitor performance.",
    path: "/workout",
  },
  {
    key: "diet",
    theme: "diet",
    icon: "🥗",
    title: "Diet",
    desc: "Manage calorie intake and nutrition.",
    path: "/diet",
  },
  {
    key: "schedule",
    theme: "schedule",
    icon: "📅",
    title: "Schedule",
    desc: "Plan and organize your fitness routine.",
    path: "/schedule",
  },
  {
    key: "profile",
    theme: "profile",
    icon: "👤",
    title: "Profile",
    desc: "Manage your personal data and fitness goals.",
    path: "/profile",
  },
  {
    key: "favorites",
    theme: "favorites",
    icon: "⭐",
    title: "Favorites",
    desc: "Save and quickly access your preferred content.",
    path: "/favorites",
  },
  {
    key: "forum",
    theme: "forum",
    icon: "💬",
    title: "Forum",
    desc: "Share experiences and interact with the community.",
    path: "/forum",
  },
];
</script>

<template>
  <main class="page landing-page">
    <div class="landing-bg" aria-hidden="true">
      <span class="landing-blob landing-blob--a" />
      <span class="landing-blob landing-blob--b" />
      <span class="landing-blob landing-blob--c" />
    </div>
    <div class="landing-shell">
      <section class="hero hero-card panel">
        <div class="hero-brand" aria-hidden="true">
          <span class="hero-logo-ring">
            <span class="hero-logo-inner">🌿</span>
          </span>
        </div>
        <h1 class="hero-title">🌿 Health & Fitness Tracking App</h1>
        <p class="hero-slogan">Track small steps, shape your healthy rhythm.</p>
        <p class="hero-lead">
          Track BMI, workouts, diet, schedule, and your daily progress in one dashboard.
        </p>
        <div class="hero-actions">
          <router-link class="landing-btn landing-btn--primary" to="/login">🔐 Login</router-link>
          <router-link class="landing-btn landing-btn--secondary" to="/register">📝 Register</router-link>
        </div>
      </section>

      <section class="features-section">
        <div class="features-grid">
          <router-link
            v-for="mod in landingModules"
            :key="mod.key"
            :to="auth.isLoggedIn ? mod.path : '/login'"
            class="feature-card"
            :class="`feature-card--${mod.theme}`"
          >
            <div class="feature-head">
              <span class="feature-icon-wrap" aria-hidden="true"><span class="feature-icon">{{ mod.icon }}</span></span>
              <div class="feature-title">{{ mod.title }}</div>
            </div>
            <p class="feature-desc">{{ mod.desc }}</p>
          </router-link>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.landing-page.page {
  position: relative;
  isolation: isolate;
  padding: 28px 20px 36px;
  min-height: calc(100vh - 24px);
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: none;
  margin: 0;
  overflow-x: hidden;
  background: linear-gradient(
    165deg,
    #f0fcf7 0%,
    #e4f7f2 28%,
    #dff5f0 52%,
    #e8faf6 78%,
    #f5fdfb 100%
  );
}

.landing-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.landing-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(64px);
  opacity: 0.45;
}

.landing-blob--a {
  width: min(72vw, 420px);
  height: min(72vw, 420px);
  background: radial-gradient(circle at 30% 30%, rgba(112, 209, 172, 0.55), rgba(167, 242, 173, 0.2) 55%, transparent 70%);
  top: -8%;
  right: -12%;
}

.landing-blob--b {
  width: min(55vw, 320px);
  height: min(55vw, 320px);
  background: radial-gradient(circle at 50% 50%, rgba(72, 174, 164, 0.35), rgba(221, 239, 242, 0.25) 60%, transparent 72%);
  bottom: 18%;
  left: -10%;
}

.landing-blob--c {
  width: min(40vw, 260px);
  height: min(40vw, 260px);
  background: radial-gradient(circle at 60% 40%, rgba(200, 235, 220, 0.7), transparent 65%);
  top: 42%;
  left: 50%;
  transform: translateX(-42%);
  opacity: 0.35;
  filter: blur(48px);
}

.landing-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.hero {
  text-align: center;
  margin: 0;
}

.hero.panel {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 24px;
  padding: 28px 26px 30px;
  box-shadow:
    0 4px 6px rgba(47, 72, 88, 0.04),
    0 18px 40px rgba(52, 139, 147, 0.1),
    0 1px 0 rgba(255, 255, 255, 0.9) inset;
}

.hero-brand {
  display: flex;
  justify-content: center;
  margin-bottom: 14px;
}

.hero-logo-ring {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(167, 242, 173, 0.55), rgba(72, 174, 164, 0.35));
  box-shadow:
    0 6px 16px rgba(52, 139, 147, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.6);
}

.hero-logo-inner {
  font-size: 1.65rem;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(47, 72, 88, 0.12));
}

.hero-title {
  margin: 0 0 12px;
  font-size: clamp(1.45rem, 4vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: #1e3d3a;
  background: linear-gradient(120deg, #2a5c55 0%, #2f4858 40%, #348b93 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-slogan {
  margin: 0 auto 14px;
  max-width: 36rem;
  font-size: clamp(1.02rem, 2.4vw, 1.2rem);
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: 0.01em;
  color: #2d6b62;
}

.hero-lead {
  margin: 0 auto 22px;
  max-width: 34rem;
  font-size: 0.94rem;
  line-height: 1.55;
  color: #6a8a91;
  font-weight: 500;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.landing-btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 128px;
  padding: 12px 22px;
  font-size: 0.95rem;
  font-weight: 700;
  border-radius: 12px;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.landing-btn--primary {
  color: #fff;
  border: 1px solid rgba(47, 143, 125, 0.45);
  background: linear-gradient(135deg, #5ec9a8 0%, #3aa89a 45%, #2f8f7d 100%);
  box-shadow:
    0 4px 14px rgba(47, 143, 125, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.landing-btn--primary:hover {
  transform: translateY(-1px);
  box-shadow:
    0 8px 22px rgba(47, 143, 125, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  filter: brightness(1.04);
}

.landing-btn--primary:active {
  transform: translateY(0);
  filter: brightness(0.97);
  box-shadow: 0 2px 10px rgba(47, 143, 125, 0.28);
}

.landing-btn--secondary {
  color: #2a5f58;
  border: 1.5px solid rgba(72, 174, 164, 0.55);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 2px 8px rgba(47, 72, 88, 0.06);
}

.landing-btn--secondary:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(52, 139, 147, 0.65);
  box-shadow: 0 6px 16px rgba(47, 72, 88, 0.08);
}

.landing-btn--secondary:active {
  transform: translateY(0);
  background: rgba(240, 252, 248, 0.95);
}

.features-section {
  width: 100%;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  width: 100%;
  margin: 0;
  align-items: stretch;
  gap: 14px;
}

.feature-card {
  margin: 0;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 140px;
  padding: 18px 16px;
  justify-content: flex-start;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 18px;
  box-shadow:
    0 2px 8px rgba(47, 72, 88, 0.05),
    0 10px 28px rgba(52, 139, 147, 0.06);
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.1),
    0 12px 28px rgba(47, 72, 88, 0.08),
    0 16px 36px rgba(52, 139, 147, 0.07);
}

.feature-card:active {
  transform: scale(0.97);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.feature-card:focus-visible {
  outline: 2px solid rgba(52, 139, 147, 0.65);
  outline-offset: 2px;
}

.feature-card--dashboard {
  border-top: 3px solid rgba(139, 120, 198, 0.55);
}
.feature-card--dashboard .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(232, 224, 255, 0.95), rgba(210, 196, 250, 0.45));
  border-color: rgba(180, 160, 230, 0.35);
}

.feature-card--courses {
  border-top: 3px solid rgba(52, 120, 168, 0.6);
}
.feature-card--courses .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(220, 236, 255, 0.95), rgba(160, 200, 240, 0.45));
  border-color: rgba(120, 170, 220, 0.4);
}

.feature-card--workout {
  border-top: 3px solid rgba(232, 150, 96, 0.65);
}
.feature-card--workout .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(255, 236, 220, 0.95), rgba(255, 200, 160, 0.45));
  border-color: rgba(240, 180, 130, 0.4);
}

.feature-card--diet {
  border-top: 3px solid rgba(72, 174, 124, 0.65);
}
.feature-card--diet .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(224, 248, 232, 0.95), rgba(167, 242, 173, 0.4));
  border-color: rgba(112, 209, 172, 0.45);
}

.feature-card--schedule {
  border-top: 3px solid rgba(72, 160, 174, 0.65);
}
.feature-card--schedule .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(220, 244, 244, 0.95), rgba(160, 220, 218, 0.45));
  border-color: rgba(100, 190, 188, 0.4);
}

.feature-card--profile {
  border-top: 3px solid rgba(100, 140, 160, 0.55);
}
.feature-card--profile .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(230, 240, 245, 0.95), rgba(180, 210, 220, 0.4));
  border-color: rgba(120, 170, 190, 0.4);
}

.feature-card--favorites {
  border-top: 3px solid rgba(210, 170, 80, 0.65);
}
.feature-card--favorites .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(255, 248, 220, 0.95), rgba(255, 220, 140, 0.45));
  border-color: rgba(230, 190, 100, 0.45);
}

.feature-card--forum {
  border-top: 3px solid rgba(90, 150, 140, 0.6);
}
.feature-card--forum .feature-icon-wrap {
  background: linear-gradient(145deg, rgba(224, 248, 242, 0.95), rgba(140, 220, 200, 0.4));
  border-color: rgba(72, 180, 160, 0.4);
}

.feature-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 28px;
}

.feature-icon-wrap {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 2px 8px rgba(47, 72, 88, 0.06);
}

.feature-icon {
  line-height: 1;
  font-size: 1.25rem;
}

.feature-title {
  font-weight: 700;
  color: #2a4549;
  font-size: 0.95rem;
  line-height: 1.35;
  min-height: calc(1.35em * 1);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  padding-top: 2px;
}

.feature-desc {
  margin: 0;
  color: #5a7a82;
  font-size: 0.875rem;
  line-height: 1.45;
  min-height: calc(1.45em * 2);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

@media (max-width: 920px) {
  .landing-page.page {
    min-height: auto;
    padding: 22px 16px 28px;
    align-items: stretch;
  }

  .landing-shell {
    max-width: 640px;
    gap: 18px;
  }

  .features-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .hero.panel {
    padding: 24px 20px 26px;
  }
}

@media (max-width: 620px) {
  .landing-page.page {
    padding: 18px 14px 24px;
  }

  .landing-shell {
    gap: 16px;
  }

  .features-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .landing-btn {
    width: 100%;
    min-width: 0;
  }
}
</style>
