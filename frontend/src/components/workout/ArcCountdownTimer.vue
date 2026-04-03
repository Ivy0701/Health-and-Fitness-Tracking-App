<script setup>
import { computed } from "vue";

const props = defineProps({
  totalSeconds: { type: Number, required: true },
  remainingSeconds: { type: Number, required: true },
});

const size = 260;
const stroke = 14;
const radius = (size - stroke) / 2;
const circumference = 2 * Math.PI * radius;

const progressRatio = computed(() => {
  if (props.totalSeconds <= 0) return 0;
  return Math.max(0, Math.min(1, props.remainingSeconds / props.totalSeconds));
});
const dashOffset = computed(() => circumference * (1 - progressRatio.value));

const timeText = computed(() => {
  const safe = Math.max(0, Math.floor(props.remainingSeconds));
  const m = String(Math.floor(safe / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
});
</script>

<template>
  <div class="timer-wrap">
    <svg :width="size" :height="size" viewBox="0 0 260 260" class="timer-svg">
      <circle class="track" cx="130" cy="130" :r="radius" fill="none" :stroke-width="stroke" />
      <circle
        class="progress"
        cx="130"
        cy="130"
        :r="radius"
        fill="none"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
      />
    </svg>
    <div class="time">{{ timeText }}</div>
  </div>
</template>

<style scoped>
.timer-wrap {
  position: relative;
  width: 260px;
  height: 260px;
  margin: 0 auto;
}
.timer-svg {
  transform: rotate(-90deg);
}
.track {
  stroke: #dcefee;
}
.progress {
  stroke: url(#grad);
  stroke: #2e9e8b;
  transition: stroke-dashoffset 0.8s linear;
}
.time {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 700;
  color: #0b3554;
}
</style>
