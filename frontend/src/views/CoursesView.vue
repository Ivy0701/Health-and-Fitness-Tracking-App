<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";
import { useFavorites } from "../services/favorites";
import { dropCourseEnrollment as dropCourseEnrollmentApi, enrollCourse as enrollCourseApi, fetchCourses, fetchEnrolledCourses } from "../services/courses";
import { expandCourseToPlannedItemsInRange } from "../utils/weekSchedule";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { ensureFavoritesLoaded, isFavorited, toggleFavorite } = useFavorites();

const courses = ref([]);
const enrolledCourseRows = ref([]);
const state = ref({ error: "" });
const removingPlanIds = ref(new Set());
const planActionNotice = ref("");
const activeModalCourseId = ref("");

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateOnlyLocal(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const datePart = text.includes("T") ? text.slice(0, 10) : text;
  const bits = datePart.split("-").map(Number);
  if (bits.length === 3 && bits.every((n) => Number.isFinite(n))) {
    const [y, m, d] = bits;
    return new Date(y, m - 1, d);
  }
  const fallback = new Date(text);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function computeCourseDay(startDateRaw, totalDaysRaw) {
  const totalDays = Math.max(1, Number(totalDaysRaw || 1));
  const startDate = parseDateOnlyLocal(startDateRaw);
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!startDate) return 1;
  const diff = Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000);
  let day = diff + 1;
  if (day < 1) day = 1;
  if (day > totalDays) day = totalDays;
  return day;
}

function displayPlanName(input) {
  const candidates = [input?.title, input?.name, input?.planName, input?.courseName];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function endDateByDuration(startDateRaw, durationDays) {
  const start = new Date(startDateRaw);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(1, Number(durationDays || 1)) - 1);
  return dateKey(end);
}

async function loadCourses() {
  courses.value = await fetchCourses();
}

async function refreshEnrolled() {
  const rows = await fetchEnrolledCourses();
  enrolledCourseRows.value = Array.isArray(rows) ? rows : [];
}

function courseFavoriteId(course) {
  return String(course?.id || course?._id || "");
}

function isCourseFavorited(course) {
  return Boolean(courseFavoriteId(course) && isFavorited("course", courseFavoriteId(course)));
}

async function toggleCourseFavorite(course) {
  if (!course) return;
  await toggleFavorite({
    itemType: "course",
    itemId: courseFavoriteId(course),
    title: course.title,
    description: course.description,
    metadata: {
      durationDays: Number(course.durationDays || 0),
      difficulty: difficultyStars(course.difficulty),
      category: course.category || "",
    },
    sourceType: "course_center",
  });
}

const difficultyColumns = [1, 2, 3, 4, 5];
const visibleCourses = computed(() =>
  (courses.value || []).filter((course) => {
    const title = String(course?.title || course?.name || "").trim().toLowerCase();
    const minutesPerDay = Number(course?.minutesPerDay || course?.duration || 0);
    if (title === "run" && minutesPerDay <= 1) return false;
    return true;
  })
);

const activePlans = computed(() => {
  return (enrolledCourseRows.value || [])
    .filter((row) => row && row.status === "active")
    .map((row) => {
      const totalDays = Number(row?.course_id?.duration_days || row?.course_id?.durationDays || row?.duration_days || 7);
      const title = displayPlanName({
        title: row?.course_id?.title || row?.title,
        name: row?.name,
        courseName: row?.courseName,
      });
      if (!title) return null;
      const startDate = String(row?.start_date || dateKey(new Date())).slice(0, 10);
      const currentDay = computeCourseDay(startDate, totalDays);
      return {
        id: `course-${row._id || row.id}`,
        type: "course",
        title,
        course: courses.value.find((course) => String(course.id) === String(row?.course_id?._id || row?.course_id || "")) || null,
        progress: `Day ${currentDay} / ${totalDays}`,
        status: "In Progress",
        startDate,
        endDate: endDateByDuration(startDate, totalDays),
        courseId: String(row?.course_id?._id || row?.course_id || ""),
        focusDate: row?.start_date || dateKey(new Date()),
        enrolledRow: row,
      };
    })
    .filter(Boolean);
});

const activeCourseIds = computed(() => new Set(activePlans.value.map((row) => String(row.courseId || ""))));
const activeModalCourse = computed(() => visibleCourses.value.find((course) => String(course.id) === String(activeModalCourseId.value)) || null);

function difficultyStars(value) {
  const n = Math.max(1, Math.min(5, Number(value || 1)));
  return "★".repeat(n);
}

function coursesByTier(list) {
  return difficultyColumns.map((difficulty) => ({
    difficulty,
    title: `${difficulty}★`,
    items: list.filter((course) => Number(course.difficulty || 1) === difficulty),
  }));
}

const vipColumns = computed(() => coursesByTier(visibleCourses.value.filter((course) => course.isVipOnly)));
const standardColumns = computed(() => coursesByTier(visibleCourses.value.filter((course) => !course.isVipOnly)));

function pushScheduleFocusQuery({ title = "", date = "", courseId = "" } = {}) {
  router.push({
    path: "/schedule",
    query: {
      focusTitle: title || undefined,
      focusDate: date || undefined,
      focusCourseId: courseId || undefined,
    },
  });
}

async function ensureCourseScheduled(row) {
  const course = visibleCourses.value.find((c) => String(c._id) === String(row.courseId));
  const resolvedCourse = course || visibleCourses.value.find((c) => String(c.id) === String(row.courseId));
  const pickedCourse = resolvedCourse || row.course || null;
  if (!pickedCourse) return;
  const me = await api.get("/users/me").then((r) => r.data);
  const schedules = await api.get(`/schedules/${me.id}`).then((r) => r.data || []);
  const today = dateKey(new Date());
  const exists = schedules.some((it) => String(it.courseId || "") === String(row.courseId) && String(it.date || "") >= today);
  if (exists) return;
  const end = new Date(`${today}T00:00:00`);
  end.setDate(end.getDate() + Math.max(1, Number(pickedCourse.durationDays || pickedCourse.duration_days || 7)) - 1);
  const sessions = expandCourseToPlannedItemsInRange(pickedCourse, today, dateKey(end));
  const items = sessions.map((s, idx) => ({
    title: s.title,
    itemType: "course",
    subtitle: `Plan Day ${idx + 1}`,
    date: s.date,
    time: s.time,
    note: s.note,
    category: pickedCourse.category || "Course",
    courseId: pickedCourse.id || pickedCourse._id,
    durationMinutes: s.durationMinutes,
    overlapAccepted: true,
  }));
  if (items.length) await api.post("/schedules/batch", { userId: me.id, items });
}

async function enrollPlan(course) {
  state.value.error = "";
  planActionNotice.value = "";
  try {
    if (course?.isVipOnly && !auth.vipStatus) {
      state.value.error = "This is a VIP course. Upgrade to add it to your plans.";
      return;
    }
    await enrollCourseApi(course.id || course._id);
    const today = dateKey(new Date());
    const end = new Date(`${today}T00:00:00`);
    end.setDate(end.getDate() + Math.max(1, Number(course.durationDays || course.duration_days || 7)) - 1);
    const sessions = expandCourseToPlannedItemsInRange(course, today, dateKey(end));
    const me = await api.get("/users/me").then((r) => r.data);
    const items = sessions.map((s, idx) => ({
      title: s.title,
      itemType: "course",
      subtitle: `Plan Day ${idx + 1}`,
      date: s.date,
      time: s.time,
      note: s.note,
      category: course.category || "Course",
      courseId: course.id || course._id,
      durationMinutes: s.durationMinutes,
      overlapAccepted: true,
    }));
    if (items.length) await api.post("/schedules/batch", { userId: me.id, items });
    await refreshEnrolled();
    planActionNotice.value = `"${course.title}" added to My Plans.`;
    activeModalCourseId.value = String(course.id || course._id || "");
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to add course to My Plans.";
  }
}

async function viewPlanInSchedule(row) {
  try {
    await ensureCourseScheduled(row);
    pushScheduleFocusQuery({ title: row.title, date: row.focusDate, courseId: row.courseId });
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to open schedule.";
  }
}

async function removeActivePlan(row) {
  const ok = window.confirm(`Stop "${row.title}" and remove its future pending tasks?`);
  if (!ok) return;
  const rowId = String(row.id || "");
  removingPlanIds.value = new Set([...removingPlanIds.value, rowId]);
  planActionNotice.value = "";
  state.value.error = "";
  try {
    enrolledCourseRows.value = (enrolledCourseRows.value || []).filter(
      (it) => String(it?._id || it?.id || "") !== String(row?.enrolledRow?._id || row?.enrolledRow?.id || "")
    );
    await dropCourseEnrollmentApi(row.courseId);
    await refreshEnrolled();
    planActionNotice.value = `"${row.title}" removed from My Plans.`;
  } catch (e) {
    state.value.error = e?.response?.data?.message || e?.message || "Failed to remove plan.";
  } finally {
    const next = new Set(removingPlanIds.value);
    next.delete(rowId);
    removingPlanIds.value = next;
  }
}

function isCourseActive(course) {
  return activeCourseIds.value.has(String(course?.id || course?._id || ""));
}

function openCourseModal(course) {
  activeModalCourseId.value = String(course?.id || course?._id || "");
  state.value.error = "";
}

function closeCourseModal() {
  activeModalCourseId.value = "";
}

async function handleModalPrimaryAction(course) {
  if (!course) return;
  if (course.isVipOnly && !auth.vipStatus) {
    router.push("/vip");
    return;
  }
  if (isCourseActive(course)) {
    const row = activePlans.value.find((plan) => String(plan.courseId) === String(course.id));
    if (row) await removeActivePlan(row);
    return;
  }
  await enrollPlan(course);
}

async function focusCourseFromQuery() {
  const focusId = String(route.query.focusItem || "").trim();
  if (!focusId) return;
  const target = visibleCourses.value.find((course) => String(course.id || course._id || "") === focusId);
  if (!target) return;
  activeModalCourseId.value = String(target.id || target._id || "");
  await nextTick();
  const el = document.querySelector(`[data-course-id="${String(target.id || target._id || "")}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

onMounted(async () => {
  await Promise.all([loadCourses(), refreshEnrolled(), ensureFavoritesLoaded()]);
  await focusCourseFromQuery();
});

watch(
  () => route.query.focusItem,
  async () => {
    await focusCourseFromQuery();
  }
);
</script>

<template>
  <AppNavbar />
  <main class="page courses-page">
    <h2 class="title">Courses</h2>
    <p class="page-subtitle">Browse all available training programs and choose a plan that suits your goal.</p>

    <section class="panel section-block">
      <h3 class="section-title">My Active Plans</h3>
      <p class="section-subtitle">Your ongoing long-term plans.</p>
      <p v-if="planActionNotice" class="ok-msg">{{ planActionNotice }}</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
      <div v-if="activePlans.length" class="active-plans-grid compact-active-grid">
        <article v-for="row in activePlans" :key="row.id" class="active-plan-card">
          <div class="active-card-content">
            <h4>{{ row.title }}</h4>
            <p class="meta-line">{{ row.progress }}</p>
            <span class="badge status-badge">{{ row.status }}</span>
            <p class="meta-line">Start: {{ row.startDate }}</p>
            <p class="meta-line">End: {{ row.endDate }}</p>
          </div>
          <div class="row-actions">
            <button type="button" class="btn-primary" @click="router.push('/workout')">Go to Workout</button>
            <button type="button" class="btn-muted" @click="viewPlanInSchedule(row)">View in Schedule</button>
            <button
              type="button"
              class="btn-muted btn-danger"
              :disabled="removingPlanIds.has(String(row.id))"
              @click="removeActivePlan(row)"
            >
              {{ removingPlanIds.has(String(row.id)) ? "Removing..." : "Remove Plan" }}
            </button>
          </div>
        </article>
      </div>
      <p v-else class="hint">No active plans yet.</p>
    </section>

    <section class="panel section-block">
      <h3 class="section-title">Standard Courses</h3>
      <p class="section-subtitle">Open to all users, grouped by difficulty.</p>
      <div class="difficulty-board">
        <section v-for="col in standardColumns" :key="`std-${col.difficulty}`" class="difficulty-column">
          <div class="difficulty-head">
            <strong>{{ col.title }}</strong>
            <span>{{ col.items.length }} courses</span>
          </div>
          <div class="difficulty-list">
            <button
              v-for="course in col.items"
              :key="course.id"
              type="button"
              class="course-card"
              :data-course-id="course.id"
              @click="openCourseModal(course)"
            >
              <div class="course-card-top">
                <h4>{{ course.title }}</h4>
                <span class="pill">{{ course.category }}</span>
              </div>
              <p class="course-card-meta">{{ difficultyStars(course.difficulty) }} · {{ course.minutesPerDay }} min/day</p>
              <p class="course-card-desc">{{ course.description }}</p>
            </button>
            <p v-if="!col.items.length" class="hint">No courses in this level.</p>
          </div>
        </section>
      </div>
    </section>

    <section class="panel section-block">
      <h3 class="section-title">VIP Courses</h3>
      <p class="section-subtitle">Columns by difficulty: 1★ easiest through 5★ hardest. Click a course to open details.</p>
      <div class="difficulty-board vip-board">
        <section v-for="col in vipColumns" :key="`vip-${col.difficulty}`" class="difficulty-column vip-column">
          <div class="difficulty-head">
            <strong>{{ col.title }}</strong>
            <span>{{ col.items.length }} courses</span>
          </div>
          <div class="difficulty-list">
            <button
              v-for="course in col.items"
              :key="course.id"
              type="button"
              class="course-card vip-course-card"
              :data-course-id="course.id"
              @click="openCourseModal(course)"
            >
              <div class="course-card-top">
                <h4>{{ course.title }}</h4>
                <span class="pill vip-pill">VIP</span>
              </div>
              <p class="course-card-meta">{{ course.category }} · {{ difficultyStars(course.difficulty) }}</p>
              <p class="course-card-desc">{{ course.description }}</p>
            </button>
            <p v-if="!col.items.length" class="hint">No courses in this level.</p>
          </div>
        </section>
      </div>
    </section>

    <div v-if="activeModalCourse" class="modal-overlay" @click.self="closeCourseModal">
      <article class="course-modal">
        <div class="modal-head">
          <div class="modal-main">
            <div class="modal-title-row">
              <h3>{{ activeModalCourse.title }}</h3>
              <span v-if="activeModalCourse.isVipOnly" class="pill vip-pill">VIP Course</span>
            </div>
            <p class="section-subtitle modal-subtitle">{{ activeModalCourse.description }}</p>
          </div>
          <button type="button" class="modal-close" aria-label="Close" @click="closeCourseModal">×</button>
        </div>
        <div class="modal-stats">
          <p class="meta-line">Category: {{ activeModalCourse.category }}</p>
          <p class="meta-line">Difficulty: {{ difficultyStars(activeModalCourse.difficulty) }}</p>
          <p class="meta-line">Duration: {{ activeModalCourse.durationDays }} days</p>
          <p class="meta-line">Minutes/day: {{ activeModalCourse.minutesPerDay }} min</p>
          <p class="meta-line">Target: {{ activeModalCourse.targetUsers }}</p>
        </div>
        <section class="modal-preview">
          <h4>Exercises Preview</h4>
          <ul class="preview-list">
            <li v-for="item in activeModalCourse.exercisesPreview" :key="item">{{ item }}</li>
          </ul>
        </section>
        <div class="modal-actions">
          <button type="button" class="btn-muted" @click="toggleCourseFavorite(activeModalCourse)">
            {{ isCourseFavorited(activeModalCourse) ? "Remove Favorite" : "Add to Favorites" }}
          </button>
          <button
            v-if="activeModalCourse.isVipOnly && !auth.vipStatus"
            type="button"
            class="btn-primary"
            @click="router.push('/vip')"
          >
            Upgrade to VIP
          </button>
          <button
            v-else
            type="button"
            class="btn-primary"
            :disabled="removingPlanIds.has(`course-${activeModalCourse.id}`)"
            @click="handleModalPrimaryAction(activeModalCourse)"
          >
            {{ isCourseActive(activeModalCourse) ? "Remove from My Plans" : "Add to My Plans" }}
          </button>
          <p v-if="activeModalCourse.isVipOnly && !auth.vipStatus" class="hint">VIP Only. You can preview details, but only VIP users can add this course.</p>
        </div>
      </article>
    </div>
  </main>
</template>

<style scoped>
.courses-page {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  gap: 18px;
}
.page-subtitle {
  margin: -8px 0 0;
  color: #4f6a76;
  font-size: 14px;
}
.section-block {
  margin: 0;
  padding: 18px;
}
.section-title {
  margin: 0;
  font-size: 20px;
  color: var(--c6);
}
.section-subtitle {
  margin: 8px 0 16px;
  font-size: 13px;
  color: #4f6a76;
}
.difficulty-board,
.active-plans-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  align-items: start;
}
.compact-active-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.difficulty-column,
.active-plan-card {
  border: 1px solid #d9e8e5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.08);
  padding: 14px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-width: 0;
}
.difficulty-column {
  min-height: 120px;
  gap: 12px;
  align-self: start;
  overflow: visible;
}
.vip-column {
  border-color: #e7d7f7;
  background: linear-gradient(180deg, #fffdfd, #faf5ff);
}
.difficulty-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  color: var(--c6);
  font-size: 12px;
}
.difficulty-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.course-card,
.active-plan-card {
  border: 1px solid #d9e8e5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.08);
  padding: 14px;
  display: flex;
  flex-direction: column;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  position: static;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: visible;
}
.course-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(47, 72, 88, 0.12);
}
.vip-course-card {
  border-color: #dbc2f2;
  background: linear-gradient(180deg, #fff, #fcf7ff);
}
.course-card-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
  min-width: 0;
}
.course-card h4,
.active-card-content h4 {
  margin: 0;
  color: var(--c6);
  min-width: 0;
  overflow-wrap: anywhere;
}
.course-card-meta,
.course-card-desc {
  margin: 0;
  font-size: 13px;
  color: #486170;
  min-width: 0;
  overflow-wrap: anywhere;
}
.course-card-desc {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta-line {
  margin: 0;
  font-size: 13px;
  color: #486170;
  min-width: 0;
  overflow-wrap: anywhere;
}
.pill,
.badge {
  display: inline-flex;
  width: fit-content;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #316879;
  background: #e6f3ef;
  border: 1px solid #c8e0da;
  flex: 0 0 auto;
  white-space: nowrap;
}
.vip-pill {
  color: #7b2cbf;
  background: #f3e8ff;
  border-color: #d6bcfa;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 14px;
}
.btn-primary {
  background: linear-gradient(90deg, var(--c4), var(--c5));
  color: #fff;
  border: none;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
}
.btn-muted {
  background: #eef3f2;
  color: #2f4858;
  border: 1px solid #d3e1df;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
}
.btn-danger {
  background: #fff5f5;
  color: #9b2c2c;
  border: 1px solid #e8a09e;
}
.btn-danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-primary:hover,
.btn-muted:hover {
  filter: brightness(1.03);
}
.ok-msg {
  color: #117a52;
  font-weight: 600;
}
.error {
  color: #b42318;
}
.hint {
  margin: 0;
  font-size: 13px;
  color: #486170;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(21, 28, 31, 0.48);
  display: grid;
  place-items: center;
  z-index: 1200;
  padding: 20px;
}
.course-modal {
  position: relative;
  width: min(820px, 100%);
  border-radius: 18px;
  background: #fff;
  padding: 22px;
  box-shadow: 0 22px 54px rgba(22, 34, 41, 0.22);
  display: grid;
  gap: 16px;
}
.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: #eef3f2;
  color: #2f4858;
  cursor: pointer;
  font-size: 18px;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.modal-main {
  min-width: 0;
}
.modal-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.modal-head h3 {
  margin: 0;
  color: var(--c6);
}
.modal-subtitle {
  margin-bottom: 0;
}
.modal-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 16px;
}
.modal-preview {
  border-top: 1px solid #e3ece8;
  padding-top: 14px;
}
.modal-preview h4 {
  margin: 0 0 10px;
}
.preview-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: #486170;
}
.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
@media (max-width: 960px) {
  .difficulty-board,
  .active-plans-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .compact-active-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .modal-stats {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .difficulty-board,
  .active-plans-grid {
    grid-template-columns: 1fr;
  }
  .modal-head {
    flex-direction: column;
  }
}
</style>
