<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import {
  WEEKDAY_LABELS,
  addDays,
  clusterEnvelopeStyle,
  clusterItemsForDay,
  dateForWeekday,
  itemFlexWeight,
  mondayOfDate,
  parseTimeToMinutes,
  TIMETABLE_END_HOUR,
  TIMETABLE_START_HOUR,
  timetableBodyHeightPx,
  timetableTotalMinutes,
} from "../utils/weekSchedule";

const me = ref(null);
const items = ref([]);
const form = reactive({ title: "", date: "", startTime: "", endTime: "", note: "" });
const formError = ref("");

/** Default week includes 2026-05-01; user can jump to today or prev/next week */
const TERM_ANCHOR = new Date(2026, 4, 1);
const weekStart = ref(mondayOfDate(TERM_ANCHOR));

const hours = computed(() => {
  const out = [];
  for (let h = TIMETABLE_START_HOUR; h < TIMETABLE_END_HOUR; h += 1) out.push(h);
  return out;
});

const weekDays = computed(() => {
  const mon = weekStart.value;
  return [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const iso = dateForWeekday(mon, w);
    const [, m, d] = iso.split("-");
    return { weekday: w, iso, label: WEEKDAY_LABELS[w], md: `${m}/${d}` };
  });
});

const weekIsoSet = computed(() => new Set(weekDays.value.map((d) => d.iso)));
const weekItems = computed(() => items.value.filter((it) => weekIsoSet.value.has(it.date)));
const enrolledCourseCount = computed(() => new Set(items.value.filter((it) => it.courseId).map((it) => String(it.courseId))).size);
const weekVipCount = computed(() => weekItems.value.filter((it) => it.courseIsPremium).length);
const weekManualCount = computed(() => weekItems.value.filter((it) => !it.courseId).length);

function tickTop(h) {
  const fromStart = h * 60 - TIMETABLE_START_HOUR * 60;
  const pct = (fromStart / timetableTotalMinutes()) * 100;
  return `${pct}%`;
}

function clustersForDay(iso) {
  const dayItems = items.value.filter((s) => s.date === iso);
  return clusterItemsForDay(dayItems);
}

function clusterKey(cluster) {
  return cluster.map((x) => x._id).join("-");
}

function sortedCluster(cluster) {
  return [...cluster].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
}

function stackBlockStyle(it) {
  return {
    flex: `${itemFlexWeight(it)} 1 0%`,
    minHeight: "52px",
  };
}

const ttBodyH = timetableBodyHeightPx();

function clusterStyle(cluster) {
  const base = clusterEnvelopeStyle(cluster);
  const allDiet = Array.isArray(cluster) && cluster.length > 0 && cluster.every((it) => it.itemType === "diet");
  if (!allDiet) return base;
  const topPct = Number(String(base.top || "0").replace("%", ""));
  const heightPct = Number(String(base.height || "0").replace("%", ""));
  const minPct = (74 / ttBodyH) * 100;
  const safeTop = Number.isFinite(topPct) ? Math.max(0, topPct) : 0;
  const safeHeight = Number.isFinite(heightPct) ? heightPct : minPct;
  const nextHeight = Math.max(minPct, safeHeight);
  const clampedHeight = Math.min(nextHeight, 100 - safeTop);
  return { top: `${safeTop}%`, height: `${clampedHeight}%` };
}

function prevWeek() {
  weekStart.value = addDays(weekStart.value, -7);
}

function nextWeek() {
  weekStart.value = addDays(weekStart.value, 7);
}

function jumpTodayWeek() {
  weekStart.value = mondayOfDate(new Date());
}

function jumpTermStartWeek() {
  weekStart.value = mondayOfDate(TERM_ANCHOR);
}

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  items.value = await api.get(`/schedules/${me.value.id}`).then((r) => r.data);
}

async function addItem() {
  formError.value = "";
  const start = parseTimeToMinutes(form.startTime);
  const end = parseTimeToMinutes(form.endTime);
  if (!form.title || !form.date || !form.startTime || !form.endTime) {
    formError.value = "Please fill title, date, start time and end time.";
    return;
  }
  if (end <= start) {
    formError.value = "End time must be later than start time.";
    return;
  }
  const durationMinutes = end - start;
  await api.post("/schedules", {
    title: form.title,
    date: form.date,
    time: form.startTime,
    note: form.note,
    userId: me.value.id,
    durationMinutes,
    overlapAccepted: false,
  });
  form.title = "";
  form.date = "";
  form.startTime = "";
  form.endTime = "";
  form.note = "";
  await load();
}

async function removeItem(id) {
  await api.delete(`/schedules/${id}`);
  await load();
}

async function clearAllItems() {
  if (!items.value.length) return;
  const ok = window.confirm("Delete all schedule items?");
  if (!ok) return;
  await Promise.all(items.value.map((it) => api.delete(`/schedules/${it._id}`)));
  await load();
}

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page schedule-page">
    <section class="schedule-hero panel">
      <h2 class="title">🗓 Schedule Planner</h2>
      <p class="muted hero-sub">Weekly timeline for course sessions and personal items.</p>
      <div class="stats-row">
        <div class="stat-chip">
          <span>This week items</span>
          <strong>{{ weekItems.length }}</strong>
        </div>
        <div class="stat-chip">
          <span>Enrolled courses</span>
          <strong>{{ enrolledCourseCount }}</strong>
        </div>
        <div class="stat-chip">
          <span>VIP sessions this week</span>
          <strong>{{ weekVipCount }}</strong>
        </div>
        <div class="stat-chip">
          <span>Personal items this week</span>
          <strong>{{ weekManualCount }}</strong>
        </div>
      </div>
    </section>

    <section class="toolbar panel panel-tight">
      <div class="toolbar-group">
        <button type="button" class="nav-btn" @click="prevWeek">← Prev week</button>
        <button type="button" class="nav-btn ghost" @click="jumpTermStartWeek">Term start (May 2026)</button>
        <button type="button" class="nav-btn ghost" @click="jumpTodayWeek">This week (today)</button>
        <button type="button" class="nav-btn" @click="nextWeek">Next week →</button>
      </div>
      <div class="toolbar-group">
        <button type="button" class="nav-btn danger" @click="clearAllItems">Clear all items</button>
      </div>
      <span class="toolbar-hint">
        Time range {{ TIMETABLE_START_HOUR }}:00 – {{ TIMETABLE_END_HOUR }}:00 · overlap sessions stack in one column
      </span>
    </section>

    <section class="timetable-card panel">
      <div class="tt-grid">
        <div class="tt-corner" />
        <div v-for="d in weekDays" :key="d.iso" class="tt-day-head">
          <span class="d-lab">{{ d.label }}</span>
          <span class="d-date">{{ d.md }}</span>
        </div>

        <div class="tt-rail">
          <div v-for="h in hours" :key="h" class="tt-tick" :style="{ top: tickTop(h) }">
            {{ String(h).padStart(2, "0") }}:00
          </div>
        </div>

        <div v-for="d in weekDays" :key="'col-' + d.iso" class="tt-day-col">
          <div class="tt-body" :style="{ height: ttBodyH + 'px' }">
            <div
              v-for="cluster in clustersForDay(d.iso)"
              :key="clusterKey(cluster)"
              class="cluster"
              :class="{ 'is-stack': cluster.length > 1 }"
              :style="clusterStyle(cluster)"
            >
              <div
                v-for="it in sortedCluster(cluster)"
                :key="it._id"
                class="block"
                :class="{
                  'is-single': cluster.length === 1,
                  'is-in-stack': cluster.length > 1,
                  multi: cluster.length > 1,
                  marked: it.overlapAccepted,
                  'is-vip-course': it.courseIsPremium,
                  'is-diet-item': it.itemType === 'diet',
                }"
                :style="cluster.length > 1 ? stackBlockStyle(it) : undefined"
              >
                <span class="btitle">
                  <span v-if="it.courseIsPremium" class="vip-pill" title="VIP course">VIP</span>
                  {{ it.title }}
                </span>
                <span v-if="it.subtitle" class="bsub">{{ it.subtitle }}</span>
                <span class="bmeta">{{ it.time }} · {{ it.durationMinutes || 60 }} min</span>
                <button type="button" class="bx" aria-label="Remove" @click.stop="removeItem(it._id)">×</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel add-panel">
      <h3>Add personal schedule item</h3>
      <p class="muted">Use this form for non-course tasks and reminders.</p>
      <form novalidate @submit.prevent="addItem">
        <input v-model="form.title" placeholder="Title" />
        <div class="grid grid-3">
          <input v-model="form.date" type="date" />
          <input v-model="form.startTime" type="time" placeholder="Start time" />
          <input v-model="form.endTime" type="time" placeholder="End time" />
        </div>
        <input v-model="form.note" placeholder="Note (optional)" />
        <p v-if="formError" class="error">{{ formError }}</p>
        <button type="submit">Save Schedule</button>
      </form>
    </section>

    <details class="list-details">
      <summary>Full list view</summary>
      <article v-for="s in items" :key="s._id" class="card">
        <h3>{{ s.title }}</h3>
        <p v-if="s.subtitle">{{ s.subtitle }}</p>
        <p>Date: {{ s.date }} · {{ s.time }} ({{ s.durationMinutes || 60 }} min)</p>
        <p class="muted">{{ s.note || "No note" }}</p>
        <button @click="removeItem(s._id)">Delete</button>
      </article>
    </details>
  </main>
</template>

<style scoped>
.schedule-page {
  max-width: 1200px;
}

.schedule-hero {
  margin-bottom: 14px;
  background: linear-gradient(135deg, #f8fcfb 0%, #eef6f5 45%, #e5f2f0 100%);
  border: 1px solid #cfe4df;
}

.hero-sub {
  margin-top: -4px;
  margin-bottom: 12px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.stat-chip {
  border: 1px solid #d5e7e3;
  border-radius: 12px;
  background: #fff;
  padding: 10px 12px;
  display: grid;
  gap: 4px;
}

.stat-chip span {
  font-size: 12px;
  color: #4b6672;
}

.stat-chip strong {
  font-size: 20px;
  color: #2f4858;
}

.panel-tight {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.nav-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  background: linear-gradient(90deg, var(--c4), var(--c5));
  color: #fff;
  cursor: pointer;
  font-size: 13px;
}

.nav-btn.ghost {
  background: #e8eceb;
  color: var(--c6);
}

.nav-btn.danger {
  background: linear-gradient(90deg, #be3b3b, #a72e2e);
}

.toolbar-hint {
  font-size: 12px;
  color: #486170;
  margin-left: auto;
  padding-left: 6px;
}

.timetable-card {
  margin-top: 14px;
  overflow-x: auto;
  border: 1px solid #d1e3df;
  background: #fcfffe;
}

.tt-grid {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(80px, 1fr));
  grid-template-rows: auto minmax(720px, auto);
  min-width: 760px;
}

.tt-corner {
  grid-column: 1;
  grid-row: 1;
  border-bottom: 1px solid #d7e7e6;
}

.tt-day-head {
  grid-row: 1;
  text-align: center;
  padding: 10px 4px;
  border-bottom: 1px solid #d7e7e6;
  border-left: 1px solid #eef5f4;
  background: linear-gradient(180deg, #f9fdfc, #edf6f4);
}

.d-lab {
  display: block;
  font-weight: 700;
  color: var(--c6);
  font-size: 13px;
}

.d-date {
  font-size: 11px;
  color: #486170;
}

.tt-rail {
  grid-column: 1;
  grid-row: 2;
  position: relative;
  border-right: 1px solid #d7e7e6;
  background: #fafcfb;
}

.tt-tick {
  position: absolute;
  left: 4px;
  transform: translateY(-50%);
  font-size: 10px;
  color: #6a7d86;
  white-space: nowrap;
}

.tt-day-col {
  grid-row: 2;
  border-left: 1px solid #eef5f4;
}

.tt-body {
  position: relative;
  box-sizing: border-box;
  /* 60px per hour = 1px per minute, aligned with the left time rail */
  background-image: repeating-linear-gradient(
    to bottom,
    #f8fcfb 0,
    #f8fcfb 59px,
    #d8e6e2 59px,
    #d8e6e2 60px
  );
}

.cluster {
  position: absolute;
  left: 4px;
  right: 4px;
  z-index: 1;
  box-sizing: border-box;
}

.cluster.is-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 3px 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.block {
  position: relative;
  box-sizing: border-box;
  padding: 6px 26px 6px 8px;
  border-radius: 8px;
  background: linear-gradient(135deg, #d8f0ec, #b8e0d8);
  border: 1px solid var(--c3);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
  box-shadow: 0 3px 10px rgba(47, 72, 88, 0.12);
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 44px;
}

.block.is-diet-item {
  padding: 8px 26px 8px 8px;
  min-height: 72px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
}

.block.is-single {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  min-height: 0;
  height: auto;
}

.block.is-in-stack {
  flex-shrink: 0;
}

.block.multi {
  background: linear-gradient(135deg, #e8f4ff, #cfe8ff);
  border-color: #6ba3c7;
}

.block.is-vip-course {
  background: linear-gradient(135deg, #f3e8ff, #e9d5ff);
  border-color: #9333ea;
}

.block.multi.is-vip-course {
  background: linear-gradient(135deg, #ede9fe, #ddd6fe);
  border-color: #7c3aed;
}

.vip-pill {
  display: inline-block;
  margin-right: 4px;
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #fff;
  background: linear-gradient(90deg, #6d28d9, #f59e0b);
  border-radius: 999px;
  vertical-align: middle;
}

.block.marked {
  border-style: dashed;
  border-width: 2px;
}

.btitle {
  font-size: 12px;
  font-weight: 700;
  color: #1a3338;
  line-height: 1.3;
  word-break: break-word;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.block.is-diet-item .btitle {
  width: 100%;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  display: block;
}

.bmeta {
  font-size: 10px;
  color: #3d5a62;
  flex-shrink: 0;
}

.bsub {
  font-size: 11px;
  color: #335861;
  line-height: 1.3;
}

.block.is-diet-item .bsub {
  width: 100%;
  font-size: 12px;
  color: #4a6570;
  line-height: 1.3;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.block.is-diet-item .bmeta {
  width: 100%;
  font-size: 11px;
  color: #6a7d86;
  line-height: 1.3;
}

.bx {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.35);
  color: #2f4858;
  cursor: pointer;
  line-height: 22px;
  font-size: 16px;
  font-weight: 700;
}

.bx:hover {
  background: rgba(255, 224, 224, 0.95);
  color: #b42318;
}

.add-panel {
  margin-top: 20px;
  border: 1px solid #d1e3df;
}

.list-details {
  margin-top: 20px;
  font-size: 14px;
  color: var(--c5);
  border: 1px solid #d1e3df;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fdfefe;
}

.list-details .card {
  margin-top: 10px;
}

.grid-3 {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

@media (max-width: 900px) {
  .toolbar-hint {
    margin-left: 0;
    width: 100%;
  }
}
</style>
