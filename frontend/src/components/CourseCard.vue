<script setup>
import { computed } from "vue";

const props = defineProps({
  course: { type: Object, required: true },
  isVipUser: { type: Boolean, default: false },
  isFavorited: { type: Boolean, default: false },
  isEnrolled: { type: Boolean, default: false },
  slotText: { type: String, default: "" },
});

const emit = defineEmits(["start", "favorite", "drop", "enroll"]);

/** 1 = easiest … 5 = hardest; legacy `advanced` is treated like expert (5⭐) */
const DIFFICULTY_STARS = {
  beginner: 1,
  easy: 2,
  intermediate: 3,
  hard: 4,
  expert: 5,
  advanced: 5,
};

const difficultyStarCount = computed(() => {
  const k = String(props.course.difficulty || "").toLowerCase();
  const n = DIFFICULTY_STARS[k];
  return Number.isFinite(n) ? n : 3;
});

const difficultyStarsLabel = computed(() => "🌟".repeat(difficultyStarCount.value));
</script>

<template>
  <article class="card" :class="{ premium: props.course.isPremium }">
    <div class="head-row">
      <h3>{{ props.course.title }}</h3>
      <span v-if="props.course.isPremium" class="vip-badge">VIP</span>
    </div>
    <p class="muted">{{ props.course.description }}</p>
    <p class="diff-row">
      Difficulty: <strong>{{ props.course.difficulty }}</strong>
      <span class="star-rating" :title="`${difficultyStarCount} / 5 — 1 easiest, 5 hardest`">
        {{ difficultyStarsLabel }}
      </span>
      <span class="star-hint">({{ difficultyStarCount }}/5)</span>
    </p>
    <p>Duration: <strong>{{ props.course.duration }}</strong> min</p>
    <p>Program: <strong>{{ props.course.duration_days || 7 }} days</strong></p>
    <p>Category: <strong>{{ props.course.category }}</strong></p>
    <p class="schedule-line"><span class="sched-icon">🗓</span> {{ props.slotText }}</p>
    <div class="card-actions">
      <button
        v-if="props.course.isPremium && !props.isVipUser"
        type="button"
        class="btn-upgrade"
        @click="emit('start', props.course)"
      >
        🔒 Upgrade to Join
      </button>

      <button
        type="button"
        class="btn-schedule"
        :disabled="props.isEnrolled"
        @click="emit('enroll', props.course)"
      >
        Enroll-add full term to schedule
      </button>
      <button
        v-if="props.isEnrolled"
        type="button"
        class="btn-drop"
        @click="emit('drop', props.course)"
      >
        Drop course remove all sessions
      </button>
      <button :disabled="props.isFavorited" @click="emit('favorite', props.course)">
        {{ props.isFavorited ? "Favorited" : "Add to Favorites" }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.head-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.vip-badge {
  background: linear-gradient(90deg, #6d28d9, #f59e0b);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 4px 10px;
}
.premium {
  border: 1px solid #e9d5ff;
  box-shadow: 0 8px 24px rgba(109, 40, 217, 0.12);
  background: linear-gradient(180deg, #fff 0%, #faf5ff 100%);
}
.schedule-line { font-size: 13px; color: var(--c5); margin: 8px 0; }
.sched-icon { margin-right: 4px; }
.diff-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.star-rating { letter-spacing: 1px; font-size: 13px; line-height: 1; }
.star-hint { font-size: 12px; color: #6b7280; }
.card-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.btn-start {
  background: linear-gradient(90deg, #2563eb, #4f46e5);
  color: #fff; border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600;
}
.btn-upgrade {
  background: linear-gradient(90deg, #7c3aed, #f59e0b);
  color: #fff; border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600;
}
.btn-schedule {
  background: linear-gradient(90deg, var(--c3), var(--c4));
  color: #fff; border: none; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600;
}
.btn-drop {
  background: #fff5f5; color: #9b2c2c; border: 1px solid #e8a09e; border-radius: 10px; padding: 10px 12px; cursor: pointer; font-weight: 600;
}
</style>
