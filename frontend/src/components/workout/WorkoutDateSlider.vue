<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
  selectedDate: { type: String, required: true },
});

const emit = defineEmits(["update:selectedDate"]);

const WINDOW_DAYS = 9;
const SHIFT_DAYS = 7;

function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(key, days) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

const todayKey = toDateKey(new Date());
const windowStart = ref(addDays(props.selectedDate, -Math.floor(WINDOW_DAYS / 2)));

watch(
  () => props.selectedDate,
  (next) => {
    const start = parseDateKey(windowStart.value);
    const end = parseDateKey(addDays(windowStart.value, WINDOW_DAYS - 1));
    const selected = parseDateKey(next);
    if (selected < start || selected > end) {
      windowStart.value = addDays(next, -Math.floor(WINDOW_DAYS / 2));
    }
  }
);

const monthLabel = computed(() => {
  const date = parseDateKey(props.selectedDate);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
});

const days = computed(() =>
  Array.from({ length: WINDOW_DAYS }).map((_, i) => {
    const key = addDays(windowStart.value, i);
    const date = parseDateKey(key);
    return {
      key,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      dayNum: date.getDate(),
      isToday: key === todayKey,
      isSelected: key === props.selectedDate,
    };
  })
);

function moveWindow(step) {
  windowStart.value = addDays(windowStart.value, step);
}
</script>

<template>
  <section class="panel date-slider">
    <div class="date-head">
      <h3>{{ monthLabel }}</h3>
      <div class="date-nav">
        <button type="button" class="nav-btn" @click="moveWindow(-SHIFT_DAYS)">&#8249;</button>
        <button type="button" class="nav-btn" @click="moveWindow(SHIFT_DAYS)">&#8250;</button>
      </div>
    </div>
    <div class="date-row">
      <button
        v-for="item in days"
        :key="item.key"
        type="button"
        class="date-pill"
        :class="{ selected: item.isSelected, today: item.isToday }"
        @click="emit('update:selectedDate', item.key)"
      >
        <span class="weekday">{{ item.weekday }}</span>
        <span class="day-num">{{ item.dayNum }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.date-slider {
  margin-bottom: 14px;
}
.date-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.date-head h3 {
  margin: 0;
}
.date-nav {
  display: flex;
  gap: 8px;
}
.nav-btn {
  border: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--c6);
  background: #e9f4f1;
  font-size: 22px;
  line-height: 1;
}
.date-row {
  display: grid;
  grid-template-columns: repeat(9, minmax(64px, 1fr));
  gap: 8px;
}
.date-pill {
  border: 1px solid #dcebe6;
  border-radius: 14px;
  padding: 8px 6px;
  background: #f8fcfb;
  color: var(--c6);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.date-pill:hover {
  background: #eef8f5;
}
.date-pill.selected {
  background: linear-gradient(120deg, #4ab7a1, #2f8a7b);
  color: #fff;
  border-color: transparent;
}
.date-pill.today:not(.selected) {
  box-shadow: inset 0 0 0 1px #3aa58e;
}
.weekday {
  font-size: 12px;
}
.day-num {
  font-size: 20px;
  font-weight: 700;
}
@media (max-width: 960px) {
  .date-row {
    grid-template-columns: repeat(3, minmax(64px, 1fr));
  }
}
</style>
