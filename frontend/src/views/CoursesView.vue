<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useFavorites } from "../services/favorites";
import { useAuthStore } from "../stores/auth";
import {
  dropCourseEnrollment as dropCourseEnrollmentApi,
  enrollCourse as enrollCourseApi,
  fetchCourses,
  fetchEnrolledCourses,
} from "../services/courses";
import { expandCourseToPlannedItemsInRange } from "../utils/weekSchedule";

const router = useRouter();
const auth = useAuthStore();
const { isFavorited, toggleFavorite, ensureFavoritesLoaded } = useFavorites();

const courses = ref([]);
const enrolledCourseRows = ref([]);
const workoutPlans = ref([]);
const state = ref({ error: "" });
const removingPlanIds = ref(new Set());
const planActionNotice = ref("");
const customPlanSaving = ref(false);

const customPlanForm = reactive({
  title: "",
  category: "Cardio",
  durationPerDay: 30,
  days: 7,
  startDate: "",
  fixedTime: "",
  note: "",
});

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysSince(startDateRaw) {
  const start = new Date(startDateRaw);
  if (Number.isNaN(start.getTime())) return 1;
  const diff = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
  return Math.max(1, diff);
}

function difficultyLabel(value) {
  const key = String(value || "beginner");
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function displayPlanName(input) {
  const invalidNames = new Set(["untitled plan", "course plan", "workout plan"]);
  const candidates = [input?.title, input?.name, input?.planName, input?.courseName, input?.exerciseName, input?.exercise_name];
  for (const v of candidates) {
    const t = String(v || "").trim();
    if (t && !invalidNames.has(t.toLowerCase())) return t;
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

async function loadWorkoutPlans() {
  const rows = await api.get("/workout/plan").then((r) => r.data).catch(() => []);
  workoutPlans.value = Array.isArray(rows) ? rows : [];
}

const recommendedPlans = computed(() =>
  [...courses.value]
    .sort((a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)))
    .slice(0, 6)
);

const activePlans = computed(() => {
  const coursePlans = (enrolledCourseRows.value || [])
    .filter((row) => row && row.status === "active")
    .map((row) => {
      const totalDays = Number(row?.course_id?.duration_days || row?.duration_days || 7);
      const current = Math.max(1, Number(row.current_day || 1));
      const title = displayPlanName({
        title: row?.course_id?.title || row?.title,
        name: row?.name,
        courseName: row?.courseName,
      });
      if (!title) return null;
      const startDate = String(row?.start_date || dateKey(new Date())).slice(0, 10);
      return {
        id: `course-${row._id || row.id}`,
        type: "course",
        title,
        progress: `Day ${Math.min(current, totalDays)} / ${totalDays}`,
        status: "In Progress",
        startDate,
        endDate: endDateByDuration(startDate, totalDays),
        fixedTime: "",
        courseId: String(row?.course_id?._id || row?.course_id || ""),
        focusDate: row?.start_date || dateKey(new Date()),
        enrolledRow: row,
      };
    })
    .filter(Boolean);

  const customPlans = (workoutPlans.value || [])
    .map((plan) => {
      const totalDays = Number(plan.days || 0);
      const elapsed = daysSince(plan.start_date || plan.created_at);
      if (totalDays > 0 && elapsed > totalDays) return null;
      const title = displayPlanName({ title: plan.title, exerciseName: plan.exercise_name });
      if (!title) return null;
      const startDate = dateKey(new Date(plan.start_date || plan.created_at || new Date()));
      return {
        id: `custom-${plan._id || plan.id}`,
        type: "custom",
        title,
        progress: totalDays > 0 ? `Day ${Math.min(elapsed, totalDays)} / ${totalDays}` : "In Progress",
        status: "In Progress",
        startDate,
        endDate: endDateByDuration(startDate, totalDays || 1),
        fixedTime: String(plan.fixed_time || "").slice(0, 5),
        focusDate: startDate,
        planRow: plan,
      };
    })
    .filter(Boolean);

  return [...coursePlans, ...customPlans].slice(0, 6);
});

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
  const course = courses.value.find((c) => String(c._id) === String(row.courseId));
  if (!course) return;
  const me = await api.get("/users/me").then((r) => r.data);
  const schedules = await api.get(`/schedules/${me.id}`).then((r) => r.data || []);
  const today = dateKey(new Date());
  const exists = schedules.some((it) => String(it.courseId || "") === String(row.courseId) && String(it.date || "") >= today);
  if (exists) return;
  const end = new Date(`${today}T00:00:00`);
  end.setDate(end.getDate() + Math.max(1, Number(course.duration_days || 7)) - 1);
  const sessions = expandCourseToPlannedItemsInRange(course, today, dateKey(end));
  const items = sessions.map((s, idx) => ({
    title: s.title,
    itemType: "course",
    subtitle: `Plan Day ${idx + 1}`,
    date: s.date,
    time: s.time,
    note: s.note,
    category: course.category || "Course",
    courseId: course._id,
    durationMinutes: s.durationMinutes,
    overlapAccepted: true,
  }));
  if (items.length) await api.post("/schedules/batch", { userId: me.id, items });
}

async function ensureCustomScheduled(row) {
  const plan = row.planRow;
  if (!plan) return;
  const me = await api.get("/users/me").then((r) => r.data);
  const schedules = await api.get(`/schedules/${me.id}`).then((r) => r.data || []);
  const planId = String(plan?._id || plan?.id || "");
  const title = displayPlanName({ title: plan.title, exerciseName: plan.exercise_name });
  if (!title) return;
  const exists = schedules.some(
    (it) =>
      String(it.itemType || "") === "workout" &&
      (String(it?.planId || "") === planId || String(it.title || "").trim() === title)
  );
  if (exists) return;
  const start = dateKey(new Date(plan.start_date || new Date()));
  const days = Math.max(1, Number(plan.days || 1));
  const time = String(plan.fixed_time || "07:00").slice(0, 5);
  const items = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(`${start}T00:00:00`);
    d.setDate(d.getDate() + i);
    items.push({
      title,
      itemType: "workout",
      planId: planId || null,
      subtitle: `Plan Day ${i + 1}`,
      date: dateKey(d),
      time,
      note: plan.note || "",
      category: plan.category || "Custom",
      durationMinutes: Number(plan.duration_per_day || 30),
      overlapAccepted: true,
    });
  }
  await api.post("/schedules/batch", { userId: me.id, items });
}

async function enrollPlan(course) {
  state.value.error = "";
  planActionNotice.value = "";
  try {
    if (course?.isPremium && !auth.vipStatus) {
      state.value.error = "This is a VIP plan. Upgrade to start it.";
      return;
    }
    await enrollCourseApi(course._id);
    const today = dateKey(new Date());
    const end = new Date(`${today}T00:00:00`);
    end.setDate(end.getDate() + Math.max(1, Number(course.duration_days || 7)) - 1);
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
      courseId: course._id,
      durationMinutes: s.durationMinutes,
      overlapAccepted: true,
    }));
    if (items.length) await api.post("/schedules/batch", { userId: me.id, items });
    await refreshEnrolled();
    planActionNotice.value = "Plan started.";
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to start plan.";
  }
}

async function createCustomPlan() {
  state.value.error = "";
  planActionNotice.value = "";
  customPlanSaving.value = true;
  try {
    const title = String(customPlanForm.title || "").trim();
    if (!title) throw new Error("Plan title is required.");
    const startDate = customPlanForm.startDate || dateKey(new Date());
    const fixedTime = customPlanForm.fixedTime || "07:00";
    const plan = await api.post("/workout/plan", {
      exerciseName: title,
      category: customPlanForm.category || "Custom",
      durationPerDay: Number(customPlanForm.durationPerDay || 30),
      days: Number(customPlanForm.days || 7),
      isCustom: true,
      startDate,
      fixedTime,
      note: customPlanForm.note || "",
    });
    const createdPlanId = String(plan?.data?._id || plan?.data?.id || "");
    const me = await api.get("/users/me").then((r) => r.data);
    const days = Math.max(1, Number(customPlanForm.days || 1));
    const items = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(`${startDate}T00:00:00`);
      d.setDate(d.getDate() + i);
      items.push({
        title,
        itemType: "workout",
        planId: createdPlanId || null,
        subtitle: `Plan Day ${i + 1}`,
        category: customPlanForm.category || "Custom",
        date: dateKey(d),
        time: fixedTime,
        note: customPlanForm.note || "",
        durationMinutes: Number(customPlanForm.durationPerDay || 30),
        overlapAccepted: true,
      });
    }
    await api.post("/schedules/batch", { userId: me.id, items });
    await Promise.all([loadWorkoutPlans(), refreshEnrolled()]);
    customPlanForm.title = "";
    customPlanForm.category = "Cardio";
    customPlanForm.durationPerDay = 30;
    customPlanForm.days = 7;
    customPlanForm.startDate = "";
    customPlanForm.fixedTime = "";
    customPlanForm.note = "";
    if (plan?.data?._id) planActionNotice.value = "Plan created.";
  } catch (e) {
    state.value.error = e?.response?.data?.message || e?.message || "Failed to create custom plan.";
  } finally {
    customPlanSaving.value = false;
  }
}

async function viewPlanInSchedule(row) {
  try {
    if (row.type === "course") await ensureCourseScheduled(row);
    if (row.type === "custom") await ensureCustomScheduled(row);
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
    if (row.type === "course") {
      enrolledCourseRows.value = (enrolledCourseRows.value || []).filter(
        (it) => String(it?._id || it?.id || "") !== String(row?.enrolledRow?._id || row?.enrolledRow?.id || "")
      );
      await dropCourseEnrollmentApi(row.courseId);
      const me = await api.get("/users/me").then((r) => r.data);
      const schedules = await api.get(`/schedules/${me.id}`).then((r) => r.data || []);
      const today = dateKey(new Date());
      const targets = schedules.filter(
        (it) =>
          String(it.date || "") >= today &&
          !Boolean(it.is_completed) &&
          String(it.courseId || "") === String(row.courseId)
      );
      await Promise.allSettled(targets.map((it) => api.delete(`/schedules/${it._id}`)));
    } else {
      const planId = String(row?.planRow?._id || row?.planRow?.id || "");
      if (!planId) throw new Error("Invalid plan id.");
      workoutPlans.value = (workoutPlans.value || []).filter((it) => String(it?._id || it?.id || "") !== planId);
      await api.delete(`/workout/plan/${planId}`);
    }
    await Promise.allSettled([loadWorkoutPlans(), refreshEnrolled()]);
    planActionNotice.value = "Plan removed.";
  } catch (e) {
    state.value.error = e?.response?.data?.message || e?.message || "Failed to remove plan.";
  } finally {
    const next = new Set(removingPlanIds.value);
    next.delete(rowId);
    removingPlanIds.value = next;
  }
}

async function cleanupInvalidUntitledPlans() {
  const invalidCourseRows = (enrolledCourseRows.value || []).filter((row) => {
    if (String(row?.status || "") !== "active") return false;
    const title = displayPlanName({
      title: row?.course_id?.title || row?.title,
      name: row?.name,
      courseName: row?.courseName,
    });
    return !title;
  });
  const invalidCustomRows = (workoutPlans.value || []).filter((plan) => {
    const title = displayPlanName({ title: plan?.title, exerciseName: plan?.exercise_name });
    return !title;
  });
  if (!invalidCourseRows.length && !invalidCustomRows.length) return;
  const me = await api.get("/users/me").then((r) => r.data).catch(() => null);
  const today = dateKey(new Date());

  for (const row of invalidCourseRows) {
    const courseId = String(row?.course_id?._id || row?.course_id || "");
    if (courseId) {
      await dropCourseEnrollmentApi(courseId).catch(() => null);
      if (me?.id) {
        const schedules = await api.get(`/schedules/${me.id}`).then((r) => r.data || []).catch(() => []);
        const futurePending = schedules.filter(
          (it) => String(it?.courseId || "") === courseId && String(it?.date || "") >= today && !Boolean(it?.is_completed)
        );
        await Promise.allSettled(futurePending.map((it) => api.delete(`/schedules/${it._id}`)));
      }
    }
  }
  for (const plan of invalidCustomRows) {
    const planId = String(plan?._id || plan?.id || "");
    if (planId) await api.delete(`/workout/plan/${planId}`).catch(() => null);
  }
  await Promise.allSettled([loadWorkoutPlans(), refreshEnrolled()]);
}

function courseFavoriteState(courseId) {
  return isFavorited("course", String(courseId || ""));
}

async function toggleCourseFavorite(course) {
  await toggleFavorite({
    itemType: "course",
    itemId: String(course._id),
    title: course.title,
    description: course.description,
    metadata: {
      difficulty: course.difficulty,
      durationDays: Number(course.duration_days || 7),
      duration: Number(course.duration || 30),
      category: course.category || "General",
      isPremium: Boolean(course.isPremium),
    },
    sourceType: "course_catalog",
  });
}

onMounted(async () => {
  await Promise.all([loadCourses(), loadWorkoutPlans(), refreshEnrolled(), ensureFavoritesLoaded()]);
  await cleanupInvalidUntitledPlans();
});
</script>

<template>
  <AppNavbar />
  <main class="page courses-page">
    <h2 class="title">Courses</h2>

    <section class="panel section-block">
      <h3 class="section-title">Recommended Plans</h3>
      <p class="section-subtitle">Choose a long-term plan to start today.</p>
      <div class="recommended-grid">
        <article v-for="plan in recommendedPlans" :key="plan._id" class="recommended-card">
          <h4>{{ plan.title }}</h4>
          <p class="meta-line">Category: {{ plan.category || "General" }}</p>
          <p class="meta-line">Duration: {{ plan.duration_days || 7 }} days</p>
          <p class="meta-line">Minutes/day: {{ plan.duration || 30 }}</p>
          <p class="meta-line">Difficulty: {{ difficultyLabel(plan.difficulty) }}</p>
          <div class="row-actions">
            <button type="button" class="btn-primary" @click="enrollPlan(plan)">Start Plan</button>
            <button type="button" class="btn-muted" @click="toggleCourseFavorite(plan)">
              {{ courseFavoriteState(plan._id) ? "Saved" : "Add to Favorites" }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="panel section-block">
      <h3 class="section-title">Create Your Own Plan</h3>
      <p class="section-subtitle">Create a custom long-term plan that starts from today.</p>
      <form class="create-plan-form" novalidate @submit.prevent="createCustomPlan">
        <div class="form-row two-col">
          <label class="field-group">
            <span class="lbl">Plan name</span>
            <input v-model.trim="customPlanForm.title" placeholder="e.g. My Running Plan" />
          </label>
          <label class="field-group">
            <span class="lbl">Category</span>
            <select v-model="customPlanForm.category">
              <option>Cardio</option>
              <option>Strength</option>
              <option>Flexibility</option>
              <option>Recovery</option>
              <option>HIIT</option>
              <option>Custom</option>
            </select>
          </label>
        </div>
        <div class="form-row two-col">
          <label class="field-group">
            <span class="lbl">Minutes/day</span>
            <input v-model.number="customPlanForm.durationPerDay" type="number" min="1" />
          </label>
          <label class="field-group">
            <span class="lbl">Duration days</span>
            <input v-model.number="customPlanForm.days" type="number" min="1" max="30" />
          </label>
        </div>
        <div class="form-row two-col">
          <label class="field-group">
            <span class="lbl">Start date</span>
            <input v-model="customPlanForm.startDate" type="date" />
          </label>
          <label class="field-group">
            <span class="lbl">Fixed time (optional)</span>
            <input v-model="customPlanForm.fixedTime" type="time" />
          </label>
        </div>
        <label class="field-group">
          <span class="lbl">Note</span>
          <input v-model="customPlanForm.note" placeholder="Optional note" />
        </label>
        <button type="submit" class="btn-primary create-submit-btn" :disabled="customPlanSaving">
          {{ customPlanSaving ? "Creating..." : "Create Plan" }}
        </button>
      </form>
    </section>

    <section class="panel section-block">
      <h3 class="section-title">My Active Plans</h3>
      <p class="section-subtitle">Your ongoing long-term plans.</p>
      <p v-if="planActionNotice" class="ok-msg">{{ planActionNotice }}</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
      <div v-if="activePlans.length" class="active-plans-grid">
        <article v-for="row in activePlans" :key="row.id" class="active-plan-card">
          <div class="active-card-content">
            <h4>{{ row.title }}</h4>
            <p class="meta-line">{{ row.progress }}</p>
            <span class="badge status-badge">{{ row.status }}</span>
            <p class="meta-line">Start: {{ row.startDate }}</p>
            <p class="meta-line">End: {{ row.endDate }}</p>
            <p v-if="row.fixedTime" class="meta-line">Time: {{ row.fixedTime }} daily</p>
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
  </main>
</template>

<style scoped>
.courses-page {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  gap: 18px;
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
.recommended-grid,
.active-plans-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.recommended-card,
.active-plan-card {
  border: 1px solid #d9e8e5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(47, 72, 88, 0.08);
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 196px;
}
.recommended-card h4,
.active-card-content h4 {
  margin: 0;
  color: var(--c6);
}
.meta-line {
  margin: 0;
  font-size: 13px;
  color: #486170;
}
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
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 14px;
}
.create-plan-form {
  display: grid;
  gap: 12px;
}
.form-row {
  display: grid;
  gap: 12px;
}
.form-row.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.field-group {
  display: grid;
  gap: 4px;
}
.lbl {
  font-size: 12px;
  font-weight: 600;
  color: var(--c5);
}
.create-plan-form input,
.create-plan-form select {
  min-height: 42px;
}
.create-submit-btn {
  min-width: 190px;
  width: fit-content;
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
@media (max-width: 960px) {
  .recommended-grid,
  .active-plans-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .create-submit-btn {
    width: 100%;
  }
}
@media (max-width: 760px) {
  .recommended-grid,
  .active-plans-grid,
  .form-row.two-col {
    grid-template-columns: 1fr;
  }
}
</style>
