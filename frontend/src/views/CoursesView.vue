<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import CourseCard from "../components/CourseCard.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";
import {
  createCourse as createCourseApi,
  dropCourseEnrollment as dropCourseEnrollmentApi,
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

/** Term start date + month span: expand all sessions through the last day of that span */
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

/** Matches CourseCard / API difficulty → star column */
function difficultyToStars(difficulty) {
  const k = String(difficulty || "").toLowerCase();
  const map = { beginner: 1, easy: 2, intermediate: 3, hard: 4, expert: 5, advanced: 5 };
  return map[k] ?? 3;
}

const starColumns = [1, 2, 3, 4, 5];

const detailCourse = ref(null);

function openCourseDetail(course) {
  detailCourse.value = course;
}

function openCourseDetailFromBoard(course) {
  if (course?.isPremium && !auth.vipStatus) {
    vipLockedModal.value = {
      open: true,
      courseTitle: course.title,
    };
    return;
  }
  openCourseDetail(course);
}

function closeCourseDetail() {
  detailCourse.value = null;
}

function addSlotRow() {
  form.weeklySlots.push({ weekday: 2, startTime: "10:00" });
}

function removeSlotRow(i) {
  if (form.weeklySlots.length <= 1) return;
  form.weeklySlots.splice(i, 1);
}

async function refreshEnrolled() {
  const rows = await fetchEnrolledCourses();
  const ids = (rows || [])
    .filter((item) => item?.status === "active")
    .map((item) => item?.course_id?._id || item?.course_id)
    .filter((id) => id != null && String(id) !== "null" && String(id) !== "undefined")
    .map((id) => String(id));
  enrolledCourseIds.value = new Set(ids);
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
  const courseId = String(course?._id || "");
  if (!courseId || !enrolledCourseIds.value.has(courseId)) return;
  if (!confirm(`Remove all scheduled sessions for “${course.title}” from your calendar?`)) return;
  try {
    await dropCourseEnrollmentApi(courseId);
    await api.delete(`/schedules/course/${course._id}`);
    enrolledCourseIds.value.delete(courseId);
    enrolledCourseIds.value = new Set(enrolledCourseIds.value);
    await refreshEnrolled();
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Could not drop this course.";
  }
}

async function cancelAllEnrollments() {
  const ids = Array.from(enrolledCourseIds.value || []);
  if (!ids.length) {
    window.alert("You do not have any enrolled courses.");
    return;
  }
  const ok = window.confirm(
    `Cancel all enrolled courses (${ids.length}) and remove all related sessions from your schedule?`
  );
  if (!ok) return;

  state.value.error = "";
  try {
    await Promise.all(
      ids.map(async (courseId) => {
        await dropCourseEnrollmentApi(courseId);
        await api.delete(`/schedules/course/${courseId}`);
      })
    );
    enrolledCourseIds.value = new Set();
    if (detailCourse.value && ids.includes(String(detailCourse.value._id || ""))) {
      detailCourse.value = null;
    }
    await refreshEnrolled();
    window.alert("All enrolled courses have been cancelled and removed from your schedule.");
  } catch (e) {
    state.value.error = e?.response?.data?.message || "Failed to cancel all enrolled courses.";
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
  if (course?.isPremium && !auth.vipStatus) {
    vipLockedModal.value = {
      open: true,
      courseTitle: course.title,
    };
    return;
  }
  const courseId = String(course?._id || "");
  if (!courseId) {
    state.value.error = "Invalid course.";
    return;
  }
  if (enrolledCourseIds.value.has(courseId)) {
    state.value.error = "You already enrolled in this course.";
    return;
  }
  try {
    const slots = course.weeklySlots || [];
    if (!slots.length) {
      state.value.error = "This course has no weekly class times yet.";
      return;
    }
    const endISO = inclusiveEndDateAfterMonths(enrollStartDate.value, enrollMonths.value);
    if (!endISO) throw new Error("Invalid term start or duration.");
    const me = await api.get("/users/me").then((r) => r.data);
    const { data: existing } = await api.get(`/schedules/${me.id}`);
    const existingCourseSchedules = (existing || []).filter((item) => item?.courseId);
    const planned = expandCourseToPlannedItemsInRange(course, enrollStartDate.value, endISO);
    if (!planned.length) {
      state.value.error = "No class dates fall in this date range (check weekdays vs term).";
      return;
    }
    const pairs = findPlannedConflicts(planned, existingCourseSchedules);
    if (pairs.length) {
      const goOn = window.confirm(
        `This course has ${pairs.length} time conflict(s) with your current schedule. Continue anyway and stack overlaps?`
      );
      if (!goOn) return;
    }

    await enrollCourseApi(course._id);
    const mode = pairs.length ? "stack" : "all";
    const batchItems = buildBatchItems(planned, mode, pairs);
    if (batchItems.length) {
      await api.post("/schedules/batch", { userId: me.id, items: batchItems });
    }
    await refreshEnrolled();
  } catch (e) {
    const statusCode = e?.response?.status;
    const msg = e?.response?.data?.message || "Failed to enroll this course.";
    state.value.error = msg;
    if (statusCode === 409) {
      window.alert(msg);
    }
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
  const existingCourseSchedules = (existing || []).filter((item) => item?.courseId);
  const planned = expandCourseToPlannedItemsInRange(course, enrollStartDate.value, endISO);
  if (!planned.length) {
    state.value.error = "No class dates fall in this date range (check weekdays vs term).";
    return;
  }

  const pairs = findPlannedConflicts(planned, existingCourseSchedules);
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

/** VIP first; within each tier sort easiest → hardest */
function difficultySortKey(difficulty) {
  const d = String(difficulty || "").toLowerCase();
  const order = {
    beginner: 0,
    easy: 1,
    intermediate: 2,
    hard: 3,
    advanced: 4,
    expert: 5,
  };
  return order[d] ?? 2;
}

const sortedCourses = computed(() =>
  [...courses.value].sort((a, b) => {
    const pa = a.isPremium ? 0 : 1;
    const pb = b.isPremium ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return difficultySortKey(a.difficulty) - difficultySortKey(b.difficulty);
  })
);

const freeCoursesList = computed(() => sortedCourses.value.filter((c) => !c.isPremium));
const vipCoursesList = computed(() => sortedCourses.value.filter((c) => c.isPremium));

function bucketCoursesByStars(list) {
  const buckets = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const c of list) {
    const s = difficultyToStars(c.difficulty);
    if (buckets[s]) buckets[s].push(c);
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  }
  return buckets;
}

const vipByStars = computed(() => bucketCoursesByStars(vipCoursesList.value));
const freeByStars = computed(() => bucketCoursesByStars(freeCoursesList.value));

onMounted(async () => {
  await Promise.all([loadCourses(), loadFavorites(), refreshEnrolled()]);
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">📚 Courses</h2>

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
      <div class="enroll-actions">
        <button
          type="button"
          class="btn-danger"
          :disabled="!enrolledCourseIds.size"
          @click="cancelAllEnrollments"
        >
          Cancel all enrolled courses
        </button>
        <span class="enroll-count">Currently enrolled: {{ enrolledCourseIds.size }}</span>
      </div>
    </section>

    <section class="panel catalog-panel">
      <h3 class="catalog-title">👑 VIP courses</h3>
      <p class="hint catalog-hint">
        Columns by difficulty: 1🌟 easiest through 5🌟 hardest. Click a course name to open details and enroll.
      </p>
      <div class="star-board star-board-vip">
        <div v-for="stars in starColumns" :key="'vip-' + stars" class="star-col">
          <div class="star-col-head" :aria-label="stars + ' stars'">
            <span class="stars-label">{{ "🌟".repeat(stars) }}</span>
            <span class="stars-caption">({{ stars }}/5)</span>
          </div>
          <ul class="course-chip-list">
            <li v-for="c in vipByStars[stars]" :key="c._id">
              <button
                type="button"
                class="course-chip"
                :class="{ locked: c.isPremium && !auth.vipStatus }"
                :disabled="c.isPremium && !auth.vipStatus"
                @click="openCourseDetailFromBoard(c)"
              >
                {{ c.title }}
              </button>
            </li>
            <li v-if="!vipByStars[stars].length" class="col-empty">—</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="panel catalog-panel">
      <h3 class="catalog-title">📖 Standard courses</h3>
      <p class="hint catalog-hint">Open to all members, also grouped in 1–5🌟 columns. Click a course to view details.</p>
      <div class="star-board star-board-free">
        <div v-for="stars in starColumns" :key="'free-' + stars" class="star-col">
          <div class="star-col-head">
            <span class="stars-label">{{ "🌟".repeat(stars) }}</span>
            <span class="stars-caption">({{ stars }}/5)</span>
          </div>
          <ul class="course-chip-list">
            <li v-for="c in freeByStars[stars]" :key="c._id">
              <button type="button" class="course-chip" @click="openCourseDetailFromBoard(c)">{{ c.title }}</button>
            </li>
            <li v-if="!freeByStars[stars].length" class="col-empty">—</li>
          </ul>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="detailCourse" class="modal-backdrop" @click.self="closeCourseDetail">
        <div class="modal modal-course-detail panel">
          <button type="button" class="detail-close" aria-label="Close" @click="closeCourseDetail">×</button>
          <CourseCard
            :course="detailCourse"
            :slot-text="courseSlotsText(detailCourse)"
            :is-vip-user="auth.vipStatus"
            :is-favorited="favorites.has(detailCourse._id)"
            :is-enrolled="enrolledCourseIds.has(String(detailCourse._id))"
            @start="handleStartLearning"
            @enroll="enrollCourse"
            @drop="dropCourseEnrollment"
            @favorite="addFavorite"
          />
        </div>
      </div>
    </Teleport>

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

    <section class="panel">
      <h3>Create Course</h3>
      <p class="hint">
        Set weekly class times. Enrollment adds <strong>every session</strong> from the term start through the last day of the
        chosen month span (e.g. May → Oct for 6 months).
      </p>
      <form novalidate @submit.prevent="createCourse">
        <div class="field-group">
          <label class="lbl" for="course-title">Course title</label>
          <input id="course-title" v-model="form.title" placeholder="e.g. Full Body Beginner Program" />
          <p class="form-help">Use a short, clear name that users can recognize quickly.</p>
        </div>

        <div class="field-group">
          <label class="lbl" for="course-description">Description</label>
          <input id="course-description" v-model="form.description" placeholder="What users will learn and who this course is for" />
          <p class="form-help">Write one sentence on the goal, target level, and expected outcome.</p>
        </div>

        <div class="grid grid-2">
          <div class="field-group">
            <label class="lbl" for="course-difficulty">Difficulty</label>
            <select id="course-difficulty" v-model="form.difficulty">
              <option value="beginner">Beginner (1🌟)</option>
              <option value="easy">Easy (2🌟)</option>
              <option value="intermediate">Intermediate (3🌟)</option>
              <option value="hard">Hard (4🌟)</option>
              <option value="expert">Expert (5🌟)</option>
            </select>
            <p class="form-help">Choose how hard this course should feel for a normal user.</p>
          </div>
          <div class="field-group">
            <label class="lbl" for="course-duration">Session duration (minutes)</label>
            <input id="course-duration" v-model.number="form.duration" type="number" min="1" placeholder="e.g. 30" />
            <p class="form-help">Length of one class session.</p>
          </div>
        </div>

        <div class="field-group">
          <label class="lbl" for="course-duration-days">Program duration (days)</label>
          <input id="course-duration-days" v-model.number="form.durationDays" type="number" min="1" placeholder="e.g. 30" />
          <p class="form-help">Total number of days for this program.</p>
        </div>

        <div class="field-group">
          <label class="lbl" for="course-category">Category</label>
          <input id="course-category" v-model="form.category" placeholder="e.g. fitness, strength, cardio" />
          <p class="form-help">Use a simple tag to group similar courses.</p>
        </div>

        <div class="slots-panel">
          <div class="slots-head">
            <span>Weekly class times</span>
            <button type="button" class="btn-small" @click="addSlotRow">+ Add time</button>
          </div>
          <p class="form-help">Add every weekly session time users should attend (weekday + start time).</p>
          <div v-for="(row, i) in form.weeklySlots" :key="i" class="slot-row grid grid-2">
            <div class="field-group compact">
              <label class="lbl">Weekday</label>
              <select v-model.number="row.weekday">
                <option v-for="(lab, w) in WEEKDAY_LABELS" :key="w" :value="w">{{ lab }}</option>
              </select>
            </div>
            <div class="time-row">
              <div class="field-group compact grow">
                <label class="lbl">Start time</label>
                <input v-model="row.startTime" type="time" />
              </div>
              <button v-if="form.weeklySlots.length > 1" type="button" class="btn-remove" @click="removeSlotRow(i)">✕</button>
            </div>
          </div>
        </div>

        <button type="submit">Add Course</button>
      </form>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </section>
  </main>
</template>

<style scoped>
.catalog-panel {
  margin-top: 14px;
}
.catalog-title {
  margin: 0 0 4px;
  color: var(--c6);
}
.catalog-hint {
  margin-bottom: 14px;
}
.star-board {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.star-board-vip {
  background: linear-gradient(180deg, #faf5ff 0%, #f3e8ff55 100%);
  border: 1px solid #e9d5ff;
  border-radius: 14px;
  padding: 12px;
}
.star-board-free {
  background: linear-gradient(180deg, #f8fcfb 0%, #e8f4f2 100%);
  border: 1px solid #d7e7e6;
  border-radius: 14px;
  padding: 12px;
}
.star-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  min-height: 120px;
}
.star-board-vip .star-col {
  border-color: #ddd6fe;
}
.star-col-head {
  text-align: center;
  padding: 10px 6px;
  border-bottom: 1px solid #eef2f2;
  background: #fafcfb;
}
.star-board-vip .star-col-head {
  background: linear-gradient(180deg, #f5f3ff, #ede9fe);
}
.stars-label {
  display: block;
  font-size: 12px;
  letter-spacing: 0.06em;
  line-height: 1.2;
}
.stars-caption {
  font-size: 11px;
  color: #6b7280;
}
.course-chip-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}
.course-chip {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #d7e7e6;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  color: var(--c6);
  line-height: 1.35;
  transition: background 0.15s, border-color 0.15s;
}
.star-board-vip .course-chip {
  border-color: #e9d5ff;
}
.course-chip:hover {
  background: #f0fdfa;
  border-color: var(--c3);
}
.course-chip.locked,
.course-chip:disabled {
  cursor: not-allowed;
  opacity: 0.65;
  background: #f8f8fb;
  border-color: #e5e7eb;
}
.star-board-vip .course-chip:hover {
  background: #faf5ff;
  border-color: #a78bfa;
}
.col-empty {
  font-size: 12px;
  color: #9ca3af;
  padding: 8px;
  text-align: center;
}
.modal-course-detail {
  position: relative;
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding-top: 36px;
}
.detail-close {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: #f3f4f6;
  color: #374151;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
}
.detail-close:hover {
  background: #e5e7eb;
}
@media (max-width: 960px) {
  .star-board {
    grid-template-columns: repeat(5, minmax(140px, 1fr));
  }
}
.error {
  color: #b42318;
}
.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #486170;
}
.field-group {
  display: grid;
  gap: 4px;
}
.field-group.compact {
  gap: 2px;
}
.field-group.grow {
  flex: 1;
}
.form-help {
  margin: 0;
  font-size: 12px;
  color: #6b7c8a;
  line-height: 1.35;
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
  align-items: flex-end;
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
.enroll-actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
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
.enroll-count {
  font-size: 12px;
  color: #486170;
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
