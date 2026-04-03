<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import CourseCard from "../components/CourseCard.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";
import {
  createCourse as createCourseApi,
  enrollCourse as enrollCourseApi,
  fetchCourses,
  fetchEnrolledCourses,
} from "../services/courses";
import {
  DEFAULT_TERM_START_ISO,
  WEEKDAY_LABELS,
  expandCourseToPlannedItemsInRange,
  findPlannedConflicts,
  inclusiveEndDateAfterMonths,
} from "../utils/weekSchedule";

const router = useRouter();
const auth = useAuthStore();
const courses = ref([]);
const favorites = ref(new Set());
const enrolledCourseIds = ref(new Set());

const form = reactive({
  title: "",
  description: "",
  difficulty: "beginner",
  duration: 30,
  durationDays: 7,
  category: "fitness",
  weeklySlots: [{ weekday: 1, startTime: "09:00" }],
});
const state = ref({ error: "" });

/** 学期开课日与持续月数：生成从 start 起连续 `months` 个整月内的所有课次 */
const enrollStartDate = ref(DEFAULT_TERM_START_ISO);
const enrollMonths = ref(6);

const conflictModal = ref({
  open: false,
  course: null,
  pairs: [],
  planned: [],
  periodLabel: "",
});

const vipLockedModal = ref({
  open: false,
  courseTitle: "",
});

function addSlotRow() {
  form.weeklySlots.push({ weekday: 2, startTime: "10:00" });
}

function removeSlotRow(i) {
  if (form.weeklySlots.length <= 1) return;
  form.weeklySlots.splice(i, 1);
}

async function refreshEnrolled() {
  const rows = await fetchEnrolledCourses();
  enrolledCourseIds.value = new Set(rows.map((item) => String(item.course_id?._id || item.course_id)));
}

async function loadCourses() {
  const rows = await fetchCourses();
  courses.value = rows;
}

async function loadFavorites() {
  const me = await api.get("/users/me").then((r) => r.data);
  const rows = await api.get(`/favorites/${me.id}`).then((r) => r.data);
  favorites.value = new Set(rows.filter((x) => x.itemType === "course").map((x) => x.itemId));
}

async function addFavorite(course) {
  const me = await api.get("/users/me").then((r) => r.data);
  await api.post("/favorites", { userId: me.id, itemType: "course", itemId: course._id, title: course.title });
  favorites.value.add(course._id);
}

async function dropCourseEnrollment(course) {
  if (!enrolledCourseIds.value.has(String(course._id))) return;
  if (!confirm(`Remove all scheduled sessions for “${course.title}” from your calendar?`)) return;
  try {
    await api.delete(`/schedules/course/${course._id}`);
    await refreshEnrolled();
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Could not drop this course.";
  }
}

async function createCourse() {
  state.value.error = "";
  try {
    await createCourseApi({
      title: form.title,
      description: form.description,
      difficulty: form.difficulty,
      duration: form.duration,
      duration_days: Number(form.durationDays),
      category: form.category,
      weeklySlots: form.weeklySlots.map((s) => ({
        weekday: Number(s.weekday),
        startTime: s.startTime,
      })),
    });
    form.title = "";
    form.description = "";
    form.difficulty = "beginner";
    form.duration = 30;
    form.durationDays = 7;
    form.category = "fitness";
    form.weeklySlots = [{ weekday: 1, startTime: "09:00" }];
    await loadCourses();
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to create course.";
  }
}

async function enrollCourse(course) {
  state.value.error = "";
  try {
    await enrollCourseApi(course._id);
    await refreshEnrolled();
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to enroll this course.";
  }
}

function handleStartLearning(course) {
  if (!course.isPremium) {
    router.push(`/courses/${course._id}/learn`);
    return;
  }
  if (auth.vipStatus) {
    router.push(`/courses/${course._id}/learn`);
    return;
  }
  vipLockedModal.value = {
    open: true,
    courseTitle: course.title,
  };
}

function closeVipLockedModal() {
  vipLockedModal.value = { open: false, courseTitle: "" };
}

function slotLabel(slot) {
  return `${WEEKDAY_LABELS[slot.weekday]} ${slot.startTime}`;
}

function courseSlotsText(course) {
  const slots = course.weeklySlots || [];
  if (!slots.length) return "No weekly times set";
  return slots.map(slotLabel).join(" · ");
}

async function openAddToSchedule(course) {
  const slots = course.weeklySlots || [];
  if (!slots.length) {
    state.value.error = "This course has no weekly class times yet.";
    return;
  }
  state.value.error = "";
  const endISO = inclusiveEndDateAfterMonths(enrollStartDate.value, enrollMonths.value);
  if (!endISO) {
    state.value.error = "Invalid term start or duration.";
    return;
  }

  const me = await api.get("/users/me").then((r) => r.data);
  const { data: existing } = await api.get(`/schedules/${me.id}`);
  const planned = expandCourseToPlannedItemsInRange(course, enrollStartDate.value, endISO);
  if (!planned.length) {
    state.value.error = "No class dates fall in this date range (check weekdays vs term).";
    return;
  }

  const pairs = findPlannedConflicts(planned, existing);
  const periodLabel = `${enrollStartDate.value} → ${endISO} · ${planned.length} session(s)`;

  conflictModal.value = {
    open: true,
    course,
    pairs,
    planned,
    periodLabel,
  };
}

function closeConflictModal() {
  conflictModal.value = { open: false, course: null, pairs: [], planned: [], periodLabel: "" };
}

function plannedKey(p) {
  return `${p.date}|${p.time}|${p.title}`;
}

function buildBatchItems(planned, mode, pairs) {
  const conflictKeys = new Set(pairs.map((x) => plannedKey(x.planned)));
  let list = planned;
  if (pairs.length && mode === "free") {
    const bad = new Set(pairs.map((x) => plannedKey(x.planned)));
    list = planned.filter((p) => !bad.has(plannedKey(p)));
  }
  return list.map((p) => ({
    title: p.title,
    date: p.date,
    time: p.time,
    note: p.note,
    courseId: p.courseId,
    durationMinutes: p.durationMinutes,
    overlapAccepted: mode === "stack" && conflictKeys.has(plannedKey(p)),
  }));
}

async function submitScheduleEnroll(mode) {
  const { pairs, planned } = conflictModal.value;
  if (!planned?.length) {
    closeConflictModal();
    return;
  }
  const me = await api.get("/users/me").then((r) => r.data);
  const items = buildBatchItems(planned, mode, pairs);
  if (!items.length) {
    state.value.error = "Nothing to add (all sessions conflicted).";
    closeConflictModal();
    return;
  }
  try {
    await api.post("/schedules/batch", { userId: me.id, items });
    closeConflictModal();
    await refreshEnrolled();
    router.push("/schedule");
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to add to schedule.";
  }
}

const conflictSummary = computed(() => {
  const pairs = conflictModal.value.pairs || [];
  if (!pairs.length) return "";
  const lines = pairs.slice(0, 8).map(
    (x) =>
      `“${x.planned.title}” ${x.planned.date} ${x.planned.time} ↔ already: “${x.existing.title}” ${x.existing.time}`
  );
  const more = pairs.length > 8 ? `\n… +${pairs.length - 8} more` : "";
  return lines.join("\n") + more;
});

const enrollPreview = computed(() => {
  const end = inclusiveEndDateAfterMonths(enrollStartDate.value, enrollMonths.value);
  if (!end) return "";
  return `${enrollStartDate.value} → ${end}`;
});

onMounted(async () => {
  await Promise.all([loadCourses(), loadFavorites(), refreshEnrolled()]);
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">📚 Courses</h2>

    <section class="panel">
      <h3>Create Course</h3>
      <p class="hint">
        Set weekly class times. Enrollment adds <strong>every session</strong> from the term start through the last day of the
        chosen month span (e.g. May → Oct for 6 months).
      </p>
      <form novalidate @submit.prevent="createCourse">
        <input v-model="form.title" placeholder="Course title" />
        <input v-model="form.description" placeholder="Description" />
        <div class="grid grid-2">
          <select v-model="form.difficulty">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <input v-model.number="form.duration" type="number" min="1" placeholder="Duration (minutes)" />
        </div>
        <input v-model.number="form.durationDays" type="number" min="1" placeholder="Program duration (days)" />
        <input v-model="form.category" placeholder="Category" />

        <div class="slots-panel">
          <div class="slots-head">
            <span>Weekly class times</span>
            <button type="button" class="btn-small" @click="addSlotRow">+ Add time</button>
          </div>
          <div v-for="(row, i) in form.weeklySlots" :key="i" class="slot-row grid grid-2">
            <select v-model.number="row.weekday">
              <option v-for="(lab, w) in WEEKDAY_LABELS" :key="w" :value="w">{{ lab }}</option>
            </select>
            <div class="time-row">
              <input v-model="row.startTime" type="time" />
              <button v-if="form.weeklySlots.length > 1" type="button" class="btn-remove" @click="removeSlotRow(i)">✕</button>
            </div>
          </div>
        </div>

        <button type="submit">Add Course</button>
      </form>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </section>

    <section class="panel enroll-panel">
      <h3>Enrollment period (all courses)</h3>
      <p class="hint">Default term begins <strong>2026-05-01</strong>. Adjust if needed.</p>
      <div class="grid grid-2 enroll-row">
        <div>
          <label class="lbl">Term starts</label>
          <input v-model="enrollStartDate" type="date" />
        </div>
        <div>
          <label class="lbl">Run for</label>
          <select v-model.number="enrollMonths">
            <option :value="3">3 months</option>
            <option :value="6">6 months (e.g. May–Oct)</option>
            <option :value="9">9 months</option>
            <option :value="12">12 months</option>
          </select>
        </div>
      </div>
      <p class="preview-line">Calendar span: <strong>{{ enrollPreview }}</strong></p>
    </section>

    <section class="grid grid-2 list">
      <CourseCard
        v-for="c in courses"
        :key="c._id"
        :course="c"
        :slot-text="courseSlotsText(c)"
        :is-vip-user="auth.vipStatus"
        :is-favorited="favorites.has(c._id)"
        :is-enrolled="enrolledCourseIds.has(String(c._id))"
        @start="handleStartLearning"
        @enroll="enrollCourse"
        @drop="dropCourseEnrollment"
        @favorite="addFavorite"
      />
    </section>

    <Teleport to="body">
      <div v-if="conflictModal.open" class="modal-backdrop" @click.self="closeConflictModal">
        <div class="modal panel">
          <h3>Enroll in this course?</h3>
          <p class="period">{{ conflictModal.periodLabel }}</p>
          <template v-if="conflictModal.pairs.length">
            <p class="conflict-warn">Some sessions overlap <strong>existing items that already have a time</strong> on your schedule:</p>
            <pre class="conflict-pre">{{ conflictSummary }}</pre>
            <p class="muted small">If the calendar was empty, you should not see this — invalid old rows are ignored.</p>
          </template>
          <p v-else class="ok-msg">No time conflicts with your current schedule in this period.</p>
          <p class="muted small">You can add only free slots, or add everything and stack overlaps on the timetable.</p>
          <div class="modal-actions">
            <button type="button" class="btn-muted" @click="closeConflictModal">Cancel</button>
            <template v-if="conflictModal.pairs.length">
              <button type="button" class="btn-muted" @click="submitScheduleEnroll('free')">Add free slots only</button>
              <button type="button" class="btn-warn" @click="submitScheduleEnroll('stack')">Add all (stacked)</button>
            </template>
            <button v-else type="button" class="btn-primary" @click="submitScheduleEnroll('all')">Add to schedule</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="vipLockedModal.open" class="modal-backdrop" @click.self="closeVipLockedModal">
        <div class="modal panel">
          <h3>VIP Members Only</h3>
          <p class="muted">
            “{{ vipLockedModal.courseTitle }}” is for VIP members only.
          </p>
          <p>Please upgrade to unlock this premium content.</p>
          <div class="modal-actions">
            <button type="button" class="btn-muted" @click="closeVipLockedModal">Not now</button>
            <button type="button" class="btn-primary" @click="router.push('/vip')">Go to VIP Page</button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.list {
  margin-top: 16px;
}
.error {
  color: #b42318;
}
.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #486170;
}
.slots-panel {
  border: 1px solid #d7e7e6;
  border-radius: 12px;
  padding: 12px;
  background: #fafcfb;
}
.slots-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 600;
  font-size: 14px;
  color: var(--c6);
}
.btn-small {
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 8px;
  background: var(--c4);
  color: #fff;
  border: none;
  cursor: pointer;
}
.slot-row {
  margin-bottom: 8px;
}
.time-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-remove {
  border: none;
  background: #f0e0e0;
  border-radius: 8px;
  width: 36px;
  cursor: pointer;
}
.enroll-panel {
  margin-top: 14px;
}
.enroll-row {
  margin-top: 10px;
}
.lbl {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--c5);
  margin-bottom: 4px;
}
.preview-line {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--c6);
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(30, 45, 55, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal {
  max-width: 520px;
  width: 100%;
}
.period {
  font-size: 14px;
  color: var(--c5);
  margin: 0 0 12px;
}
.conflict-warn {
  color: #9b2c2c;
  font-weight: 600;
}
.conflict-pre {
  background: #fff8f8;
  border: 1px solid #f0c4c4;
  border-radius: 10px;
  padding: 10px;
  font-size: 12px;
  white-space: pre-wrap;
  max-height: 200px;
  overflow: auto;
}
.ok-msg {
  color: #117a52;
  font-weight: 600;
}
.small {
  font-size: 13px;
}
.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}
.btn-muted {
  background: #e8eceb;
  color: #333;
  border: none;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
}
.btn-warn {
  background: #c45c4a;
  color: #fff;
  border: none;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
}
.btn-primary {
  background: linear-gradient(90deg, var(--c4), var(--c5));
  color: #fff;
  border: none;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
}
</style>
