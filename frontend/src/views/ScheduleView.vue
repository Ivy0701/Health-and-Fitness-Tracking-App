<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { fetchEnrolledCourses } from "../services/courses";
import { getTodayLocalDate } from "../utils/dateLocal";
import { isDietFoodLogScheduleRow, isDietMealPlanApplyRow } from "../utils/dietPlanSchedulePayload";
import {
  WEEKDAY_LABELS,
  addDays,
  clusterEnvelopeStyle,
  clusterItemsForDay,
  clusterTimeRangeLabel,
  dateForWeekday,
  effectiveDurationMinutes,
  findNextAvailableTimeSlot,
  getDefaultDurationMinutes,
  itemEndMinutes,
  minutesToHHmm,
  mondayOfDate,
  parseTimeToMinutes,
  itemsTimeOverlap,
  pickClusterPrimaryItem,
  sortClusterItemsForModal,
  TIMETABLE_BOTTOM_BUFFER_PX,
  TIMETABLE_END_HOUR,
  TIMETABLE_START_HOUR,
  timetableBodyHeightPx,
  timetableTotalMinutes,
  SCHEDULE_CONFLICT_MESSAGE,
} from "../utils/weekSchedule";
import { calculateWorkoutCaloriesBurned, resolveWeightKg } from "../utils/workoutCaloriesBurn";

const me = ref(null);
const items = ref([]);
/** When set, course/course_session rows whose courseId is not in this set are hidden (orphans after drop). */
const enrolledCourseIdSet = ref(null);
const router = useRouter();
const route = useRoute();
const focusedScheduleId = ref("");
const timelineScrollEl = ref(null);
const form = reactive({
  title: "",
  itemType: "workout",
  category: "",
  mealType: "lunch",
  date: "",
  startTime: "",
  endTime: "",
  note: "",
});
const formError = ref("");
const formInfo = ref("");
const selectedDate = ref(new Date());
const weekStart = ref(mondayOfDate(selectedDate.value));
const listFilter = ref("week");
const deletingIds = ref(new Set());
/** Per (day ISO + cluster key) stack order: last-clicked timeline cluster renders on top while its modal is open. */
const clusterZStack = ref({});
let clusterZSeq = 8;
/** Stack key for the cluster whose detail modal is open from the week timeline (cleared on close → z-order resets). */
const timelineModalClusterStackKey = ref("");

/** Hour labels 00:00 … 23:00 plus 24:00 at the bottom boundary. */
const hours = computed(() => {
  const out = [];
  for (let h = TIMETABLE_START_HOUR; h <= TIMETABLE_END_HOUR; h += 1) out.push(h);
  return out;
});

const weekDays = computed(() => {
  const mon = weekStart.value;
  const todayKey = getTodayLocalDate();
  const selectedKey = formatDateKey(selectedDate.value);
  return [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const iso = dateForWeekday(mon, w);
    const [, m, d] = iso.split("-");
    return {
      weekday: w,
      iso,
      label: WEEKDAY_LABELS[w],
      md: `${m}/${d}`,
      isToday: iso === todayKey,
      isSelected: iso === selectedKey,
    };
  });
});

const weekRangeLabel = computed(() => {
  const first = weekDays.value[0];
  const last = weekDays.value[6];
  if (!first || !last) return "";
  return `Week of ${first.md} - ${last.md}`;
});

const visibleItems = computed(() =>
  items.value.filter((item) => {
    const type = String(item?.itemType || "").toLowerCase();
    const allowed = ["course", "course_session", "workout", "exercise", "reminder", "manual", "personal", "diet"];
    if (!allowed.includes(type) || !String(item?.title || "").trim() || !item?.date || !item?.time) return false;
    if (isDietMealPlanApplyRow(item)) return false;
    const cid = String(item?.courseId || "").trim();
    if (enrolledCourseIdSet.value && cid && (type === "course" || type === "course_session")) {
      if (!enrolledCourseIdSet.value.has(cid)) return false;
    }
    return true;
  })
);

const weekIsoSet = computed(() => new Set(weekDays.value.map((d) => d.iso)));
const weekItems = computed(() => visibleItems.value.filter((it) => weekIsoSet.value.has(it.date)));
const enrolledCourseCount = computed(() =>
  new Set(visibleItems.value.filter((it) => it.courseId).map((it) => String(it.courseId))).size
);
const weekVipCount = computed(() => weekItems.value.filter((it) => it.courseIsPremium).length);
const weekDietCount = computed(() => weekItems.value.filter((it) => String(it?.itemType || "").toLowerCase() === "diet").length);
const weekManualCount = computed(() =>
  weekItems.value.filter((it) => !it.courseId && String(it?.itemType || "").toLowerCase() !== "diet").length
);
const upcomingToday = computed(() => {
  const now = new Date();
  const todayKey = getTodayLocalDate();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return visibleItems.value
    .filter((it) => it.date === todayKey && !it.is_completed)
    .map((it) => ({
      ...it,
      minuteKey: parseTimeToMinutes(it.time),
    }))
    .filter((it) => Number.isFinite(it.minuteKey) && it.minuteKey >= nowMinutes)
    .sort((a, b) => a.minuteKey - b.minuteKey)
    .slice(0, 3);
});

function tickTop(h) {
  const fromStart = h * 60 - TIMETABLE_START_HOUR * 60;
  const pct = (fromStart / timetableTotalMinutes()) * 100;
  return `${pct}%`;
}

function tickLabelTransform(h) {
  if (h === TIMETABLE_START_HOUR) return "translateY(0)";
  if (h === TIMETABLE_END_HOUR) return "translateY(-100%)";
  return "translateY(-50%)";
}

function scrollTimelineToDefault() {
  const el = timelineScrollEl.value;
  if (!el) return;
  const todayKey = getTodayLocalDate();
  const totalMin = timetableTotalMinutes();
  const bodyH = ttBodyH;
  let anchorMin = NaN;
  if (weekIsoSet.value.has(todayKey)) {
    const todayItems = weekItems.value.filter((it) => it.date === todayKey);
    if (todayItems.length) {
      const mins = todayItems.map((it) => parseTimeToMinutes(it.time)).filter(Number.isFinite);
      if (mins.length) anchorMin = Math.min(...mins);
    } else {
      const now = new Date();
      anchorMin = now.getHours() * 60 + now.getMinutes();
    }
  }
  if (!Number.isFinite(anchorMin)) {
    el.scrollTop = 0;
    return;
  }
  const y = (anchorMin / totalMin) * bodyH;
  const ch = el.clientHeight || 1;
  const maxScroll = Math.max(0, el.scrollHeight - ch);
  el.scrollTop = Math.max(0, Math.min(maxScroll, y - ch * 0.35));
}

function clustersForDay(iso) {
  const dayItems = visibleItems.value.filter((s) => s.date === iso);
  return clusterItemsForDay(dayItems);
}

function clusterKey(cluster) {
  return cluster.map((x) => x._id).join("-");
}

const ttBodyH = timetableBodyHeightPx();
const ttTailPx = TIMETABLE_BOTTOM_BUFFER_PX;

const slotModalOpen = ref(false);
const slotModalItems = ref([]);
/** When modal opened for a diet_log_sync meal block: foods from Diet API for that meal/date. */
const slotModalDietDetail = ref(null);
const slotModalOverlayEl = ref(null);

watch(slotModalOpen, async (open) => {
  if (!open) return;
  await nextTick();
  slotModalOverlayEl.value?.focus?.();
});

function clearTimelineClusterFrontFromModal() {
  const k = String(timelineModalClusterStackKey.value || "").trim();
  if (!k) return;
  const next = { ...clusterZStack.value };
  delete next[k];
  clusterZStack.value = next;
  timelineModalClusterStackKey.value = "";
}

function closeSlotModal() {
  clearTimelineClusterFrontFromModal();
  slotModalOpen.value = false;
  slotModalItems.value = [];
  slotModalDietDetail.value = null;
}

/** Integer kcal for diet UI (aligned with Diet page + dashboard). */
function formatDisplayKcal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n));
}

async function loadDietMealDetailForModal(scheduleItem) {
  const uid = String(me.value?.id || "").trim();
  const meal = String(scheduleItem?.meal || "").toLowerCase();
  const linkedDietId = String(scheduleItem?.linkedDietId || "").trim();
  const mealLabel =
    meal === "breakfast"
      ? "Breakfast"
      : meal === "lunch"
        ? "Lunch"
        : meal === "dinner"
          ? "Dinner"
          : meal === "snack"
            ? "Snack"
            : "Meal";
  slotModalDietDetail.value = { loading: true, loaded: false, records: [], mealLabel, total: 0, date: scheduleItem.date, error: "" };
  try {
    const { data } = await api.get(`/diets/${uid}`, {
      params: { date: scheduleItem.date, _ts: Date.now() },
      headers: { "Cache-Control": "no-cache" },
    });
    const rows = (Array.isArray(data) ? data : []).filter((r) => {
      if (linkedDietId) return String(r?._id || "") === linkedDietId;
      return String(r.mealType || "").toLowerCase() === meal;
    });
    rows.sort((a, b) => {
      const ta = parseTimeToMinutes(a.time || a.recordedTimeLocal);
      const tb = parseTimeToMinutes(b.time || b.recordedTimeLocal);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      const da = new Date(a.recordedAt || a.createdAt || 0).getTime();
      const db = new Date(b.recordedAt || b.createdAt || 0).getTime();
      return da - db;
    });
    const total = rows.reduce((sum, r) => sum + (Number.isFinite(Number(r.calories)) ? Number(r.calories) : 0), 0);
    slotModalDietDetail.value = { loading: false, loaded: true, records: rows, mealLabel, total, date: scheduleItem.date, error: "" };
  } catch (e) {
    slotModalDietDetail.value = {
      loading: false,
      loaded: true,
      records: [],
      mealLabel,
      total: 0,
      date: scheduleItem.date,
      error: e?.response?.data?.message || "Could not load foods for this meal.",
    };
  }
}

function bumpClusterToFront(dayIso, cluster) {
  const key = `${String(dayIso || "").trim()}::${clusterKey(cluster)}`;
  clusterZSeq += 1;
  clusterZStack.value = { ...clusterZStack.value, [key]: clusterZSeq };
}

async function openSlotModal(cluster) {
  slotModalDietDetail.value = null;
  formError.value = "";
  slotModalItems.value = sortClusterItemsForModal(cluster);
  slotModalOpen.value = true;
  const primary = pickClusterPrimaryItem(cluster);
  if (cluster.length === 1 && primary && isDietFoodLogScheduleRow(primary)) {
    if (me.value?.id) await loadDietMealDetailForModal(primary);
  }
}

async function onTimelineClusterActivate(dayIso, cluster) {
  const key = `${String(dayIso || "").trim()}::${clusterKey(cluster)}`;
  clearTimelineClusterFrontFromModal();
  bumpClusterToFront(dayIso, cluster);
  timelineModalClusterStackKey.value = key;
  await openSlotModal(cluster);
}

function dietPlanGroupKey(it) {
  const id = String(it?.dietPlanId || it?.planId || "").trim();
  if (id) return `id:${id}`;
  const n = String(it?.planName || "").trim().toLowerCase();
  return n ? `name:${n}` : "";
}

function clusterIsSamePlanDietGroup(cluster) {
  if (!cluster || cluster.length < 2) return false;
  if (!cluster.every((it) => String(it?.itemType || "").toLowerCase() === "diet")) return false;
  const keys = cluster.map((k) => dietPlanGroupKey(k)).filter(Boolean);
  if (keys.length !== cluster.length) return false;
  return new Set(keys).size === 1;
}

function timelineBlockTitle(cluster) {
  const primary = pickClusterPrimaryItem(cluster);
  if (!primary) return "Scheduled";
  if (cluster.length === 1) return displayTitle(primary);
  if (clusterIsSamePlanDietGroup(cluster)) {
    const pn = String(primary.planName || "").trim();
    if (pn) return `Diet · ${pn}`;
  }
  return displayTitle(primary);
}

function timelineBlockSubline(cluster) {
  if (cluster.length === 1 && isDietFoodLogScheduleRow(cluster[0])) {
    const sub = String(cluster[0]?.subtitle || "").trim();
    return sub;
  }
  if (cluster.length <= 1) return "";
  if (clusterIsSamePlanDietGroup(cluster)) return `${cluster.length} meals`;
  return `+${cluster.length - 1} more`;
}

function timelineMetaLine(cluster) {
  if (cluster.length === 1) {
    const it = cluster[0];
    if (isDietFoodLogScheduleRow(it)) {
      const dur = Number(it.durationMinutes) > 0 ? Number(it.durationMinutes) : 15;
      return `${it.time} · ${dur} min`;
    }
    return `${it.time} - ${endTimeLabel(it)}`;
  }
  return clusterTimeRangeLabel(cluster);
}

/** Estimated burn for plan/manual workout rows (same MET formula as Workout / Dashboard). */
function scheduleWorkoutBurnKcal(item) {
  const t = String(item?.itemType || "").toLowerCase();
  if (t !== "workout" && t !== "exercise") return null;
  const dur = Number(item?.durationMinutes);
  if (!Number.isFinite(dur) || dur <= 0) return null;
  const k = calculateWorkoutCaloriesBurned({
    durationMinutes: dur,
    category: String(item?.category || ""),
    title: String(item?.title || "").trim(),
    weightKg: resolveWeightKg(me.value?.weight),
  });
  if (!Number.isFinite(k) || k <= 0) return null;
  return Math.round(k);
}

/** Single-slot timeline kcal line (workout from MET; course from API plannedBurnKcal when > 0). */
function timelineKcalLabel(cluster) {
  if (!cluster || cluster.length !== 1) return "";
  const it = cluster[0];
  if (isDietFoodLogScheduleRow(it)) return "";
  const t = String(it?.itemType || "").toLowerCase();
  if (t === "workout" || t === "exercise") {
    const k = scheduleWorkoutBurnKcal(it);
    return k != null ? `${k} kcal` : "";
  }
  if (t === "course" || t === "course_session") {
    const k = Number(it?.plannedBurnKcal);
    if (Number.isFinite(k) && k > 0) return `${Math.round(k)} kcal`;
    return "";
  }
  return "";
}

function itemTypeLower(it) {
  return String(it?.itemType || "").toLowerCase();
}

function isWorkoutLikeItem(it) {
  const t = itemTypeLower(it);
  return t === "workout" || t === "exercise";
}

function isCourseLikeItem(it) {
  const t = itemTypeLower(it);
  return Boolean(it?.courseId) || t === "course" || t === "course_session";
}

/** Kcal string for modal / multi-row meta (aligned with timeline MET + API plannedBurn). */
function scheduleItemKcalDisplay(it) {
  if (isWorkoutLikeItem(it)) {
    const k = scheduleWorkoutBurnKcal(it);
    return k != null ? `${k} kcal` : "";
  }
  if (isCourseLikeItem(it)) {
    const k = Number(it?.plannedBurnKcal);
    if (Number.isFinite(k) && k > 0) return `${Math.round(k)} kcal`;
    return "";
  }
  if (itemTypeLower(it) === "diet" && Number.isFinite(Number(it?.totalCalories)) && Number(it.totalCalories) > 0) {
    return `${Math.round(Number(it.totalCalories))} kcal`;
  }
  return "";
}

function modalDurationLine(it) {
  const d = Number(it?.durationMinutes);
  if (Number.isFinite(d) && d >= 1) return `${d} min`;
  return "";
}

function modalStatusLine(it) {
  if (it?.is_completed) return "Completed";
  const dk = String(it?.date || "").trim();
  const today = getTodayLocalDate();
  if (dk > today) return "Scheduled";
  if (dk < today) return "Missed";
  return "Not started";
}

/** Course session exercise names from schedule list API (`courseExerciseNames` on row). */
function courseModalExerciseList(it) {
  if (!isCourseLikeItem(it)) return [];
  const raw = it?.courseExerciseNames;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || "").trim()).filter(Boolean);
}

function workoutSourceLine(it) {
  if (!isWorkoutLikeItem(it)) return "";
  if (it?.planId) return "Plan";
  const st = String(it?.subtitle || "").trim();
  if (/plan session/i.test(st)) return "Plan";
  return "Manual";
}

function modalNoteLine(it) {
  if (isDietFoodLogScheduleRow(it)) return "";
  const n = String(it?.note || "").trim();
  return n;
}

function singleModalHeadline(it) {
  if (isDietFoodLogScheduleRow(it)) {
    const ml = String(slotModalDietDetail.value?.mealLabel || "").trim();
    if (ml) return ml;
  }
  return displayTitle(it);
}

function modalRowAction(item) {
  const t = itemTypeLower(item);
  if (t === "workout" || t === "exercise") {
    return { label: "View in Workout", kind: "workout" };
  }
  const cid = String(item?.courseId || "").trim();
  if (cid || t === "course" || t === "course_session") {
    return { label: "Go to Workout (course task)", kind: "course" };
  }
  if (item?.courseIsPremium) {
    return { label: "VIP", kind: "vip" };
  }
  if (t === "diet") {
    return { label: "View in Diet", kind: "diet" };
  }
  return { label: "View in schedule", kind: "schedule" };
}

function runModalAction(item, kind) {
  const date = item?.date || getTodayLocalDate();
  if (kind === "workout") {
    router.push({ path: "/workout", query: { date } });
  } else if (kind === "course") {
    const cid = String(item?.courseId || "").trim();
    const courseName = String(item?.title || "").trim();
    const scheduleItemId = String(item?._id || "").trim();
    router.push({
      path: "/workout",
      query: {
        date,
        fromSchedule: "1",
        ...(cid ? { focusCourseId: cid } : {}),
        ...(courseName ? { focusCourseName: courseName } : {}),
        ...(scheduleItemId ? { focusScheduleItemId: scheduleItemId } : {}),
      },
    });
  } else if (kind === "diet") {
    router.push({ path: "/diet", query: { date } });
  } else if (kind === "vip") {
    router.push({ path: "/vip" });
  } else {
    router.push({ path: "/schedule", query: { focusDate: date } });
  }
  closeSlotModal();
}

async function removeSlotItem(item) {
  const ok = await removeItem(item);
  if (!ok) return;
  slotModalItems.value = slotModalItems.value.filter((x) => String(x._id) !== String(item._id));
  if (!slotModalItems.value.length) closeSlotModal();
}

/** Primary row for merged timeline slot (cached call site helper). */
function clusterPrimary(cluster) {
  return pickClusterPrimaryItem(cluster);
}

function clusterStyleWithZ(dayIso, cluster) {
  const base = clusterEnvelopeStyle(cluster);
  const key = `${String(dayIso || "").trim()}::${clusterKey(cluster)}`;
  const z = clusterZStack.value[key];
  if (z != null && Number.isFinite(Number(z))) {
    return { ...base, zIndex: Number(z) };
  }
  return base;
}

function prevWeek() {
  selectedDate.value = addDays(selectedDate.value, -7);
  weekStart.value = addDays(weekStart.value, -7);
}

function nextWeek() {
  selectedDate.value = addDays(selectedDate.value, 7);
  weekStart.value = addDays(weekStart.value, 7);
}

function jumpTodayWeek() {
  const today = new Date(`${getTodayLocalDate()}T00:00:00`);
  selectedDate.value = today;
  weekStart.value = mondayOfDate(today);
}

function selectDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return;
  selectedDate.value = d;
}

async function refreshEnrolledCourseIdSet() {
  try {
    const rows = await fetchEnrolledCourses();
    const ids = new Set();
    for (const r of Array.isArray(rows) ? rows : []) {
      const id = String(r?.course_id?._id || r?.course_id || "").trim();
      if (id) ids.add(id);
    }
    enrolledCourseIdSet.value = ids;
  } catch {
    enrolledCourseIdSet.value = null;
  }
}

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  const [scheduleData] = await Promise.all([
    api.get(`/schedules/${me.value.id}`).then((r) => r.data),
    refreshEnrolledCourseIdSet(),
  ]);
  items.value = scheduleData;
  if (!form.date) form.date = getTodayLocalDate();
  const focused = await applyFocusFromQuery();
  await nextTick();
  if (!focused) scrollTimelineToDefault();
}

function onFitnessInvalidateData(ev) {
  const d = ev?.detail || {};
  if (!d.schedules || !me.value?.id) return;
  Promise.all([
    api.get(`/schedules/${me.value.id}`).then((r) => r.data),
    refreshEnrolledCourseIdSet(),
  ])
    .then(([data]) => {
      items.value = data;
    })
    .catch(() => {});
}

async function addItem() {
  formError.value = "";
  formInfo.value = "";
  if (!form.title?.trim() || !form.date) {
    formError.value = "Please fill title and date.";
    return;
  }

  const itemType = form.itemType;
  const durationDefault = getDefaultDurationMinutes(itemType, { mealType: form.mealType });
  let startTime = String(form.startTime || "").trim();
  let endTime = String(form.endTime || "").trim();
  let durationMinutes = durationDefault;

  if (startTime && endTime) {
    const start = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      formError.value = "End time must be later than start time.";
      return;
    }
    durationMinutes = end - start;
  } else if (startTime && !endTime) {
    const start = parseTimeToMinutes(startTime);
    if (!Number.isFinite(start)) {
      formError.value = "Start time is invalid.";
      return;
    }
    durationMinutes = durationDefault;
    endTime = minutesToHHmm(start + durationMinutes);
  } else {
    const slot = findNextAvailableTimeSlot(form.date, durationDefault, items.value, {
      itemType,
      mealType: itemType === "diet" ? form.mealType : undefined,
    });
    if (!slot) {
      formError.value = "No available time slots were found for this day.";
      return;
    }
    startTime = slot;
    durationMinutes = durationDefault;
    endTime = minutesToHHmm(parseTimeToMinutes(slot) + durationMinutes);
    formInfo.value = `No time selected. Scheduled automatically at ${slot}.`;
  }

  const candidate = {
    date: form.date,
    time: startTime.slice(0, 5),
    durationMinutes,
    itemType,
    title: form.title.trim(),
  };
  const conflict = items.value.some((e) => itemsTimeOverlap(candidate, e));
  if (conflict) {
    formError.value = SCHEDULE_CONFLICT_MESSAGE;
    return;
  }

  const subtitleParts = [];
  if (form.category) subtitleParts.push(`${itemType} · ${form.category}`);
  if (itemType === "diet") subtitleParts.push(String(form.mealType || "lunch"));

  try {
    const res = await api.post("/schedules", {
      title: form.title.trim(),
      itemType,
      category: form.category,
      subtitle: subtitleParts.join(" · "),
      mealType: itemType === "diet" ? form.mealType : undefined,
      meal: itemType === "diet" ? form.mealType : undefined,
      date: form.date,
      time: startTime.slice(0, 5),
      note: form.note,
      userId: me.value.id,
      durationMinutes,
    });
    if (res.data?.scheduleNotice) formInfo.value = res.data.scheduleNotice;
  } catch (err) {
    const msg = err?.response?.data?.message;
    formError.value = msg || SCHEDULE_CONFLICT_MESSAGE;
    return;
  }

  form.title = "";
  form.itemType = "workout";
  form.category = "";
  form.mealType = "lunch";
  form.date = "";
  form.startTime = "";
  form.endTime = "";
  form.note = "";
  await load();
}

function isPlanBackedItem(item) {
  const type = String(item?.itemType || "").toLowerCase();
  return Boolean(item?.planId) || Boolean(item?.courseId) || type === "course" || type === "course_session";
}

/** @returns {Promise<boolean>} true if deleted */
async function removeItem(item) {
  const itemId = String(item?._id || "");
  if (!itemId) return false;
  if (deletingIds.value.has(itemId)) return false;

  const manualLike = !isPlanBackedItem(item);
  let scope = "single";

  if (manualLike) {
    const ok = window.confirm("Delete this item?");
    if (!ok) return false;
  } else {
    const choice = window.prompt(
      [
        "This session belongs to a plan.",
        "1) Delete this session only",
        "2) Remove all future sessions of this plan",
        "Enter 1 or 2",
      ].join("\n")
    );
    if (choice == null) return false;
    const normalized = String(choice).trim();
    if (normalized === "1") scope = "single";
    else if (normalized === "2") scope = "future";
    else {
      window.alert("Please enter 1 or 2.");
      return false;
    }
  }

  deletingIds.value = new Set([...deletingIds.value, itemId]);
  try {
    await api.delete(`/schedules/${itemId}`, { params: { scope } });
    await load();
    return true;
  } catch {
    return false;
  } finally {
    const next = new Set(deletingIds.value);
    next.delete(itemId);
    deletingIds.value = next;
  }
}

onMounted(() => {
  window.addEventListener("fitness:invalidate-data", onFitnessInvalidateData);
  load();
});
onActivated(() => {
  if (me.value?.id) {
    Promise.all([
      api.get(`/schedules/${me.value.id}`).then((r) => r.data),
      refreshEnrolledCourseIdSet(),
    ])
      .then(([data]) => {
        items.value = data;
      })
      .catch(() => {});
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("fitness:invalidate-data", onFitnessInvalidateData);
});

watch(
  () => route.fullPath,
  async () => {
    const focused = await applyFocusFromQuery();
    await nextTick();
    if (!focused) scrollTimelineToDefault();
  }
);

function sourceTag(item) {
  if (item.courseIsPremium) return "VIP";
  if (item.itemType === "course" || item.courseId) return "Course";
  if (item.itemType === "workout" || String(item?.itemType || "").toLowerCase() === "exercise") return "Workout";
  if (String(item?.itemType || "").toLowerCase() === "diet") return "Diet";
  if (String(item?.itemType || "").toLowerCase() === "personal") return "Personal";
  return "Reminder";
}

function pickItemName(item) {
  const candidates = [
    item?.title,
    item?.name,
    item?.planName,
    item?.plan_name,
    item?.courseName,
    item?.course_name,
    item?.taskName,
    item?.task_name,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function displayTitle(item) {
  const lowType = String(item?.itemType || "").toLowerCase();
  if (lowType === "diet") {
    if (isDietFoodLogScheduleRow(item)) {
      const t = String(item?.title || "").trim();
      return t || "Diet";
    }
    const raw = String(pickItemName(item) || "").trim();
    if (raw && !/^diet$/i.test(raw)) return raw;
    const plan = String(item?.planName || "").trim();
    const meal = String(item?.meal || "").toLowerCase();
    const mealLabel =
      meal === "breakfast"
        ? "Breakfast"
        : meal === "lunch"
          ? "Lunch"
          : meal === "dinner"
            ? "Dinner"
            : meal === "snack"
              ? "Snack"
              : "Meal";
    if (plan) return `${mealLabel} · ${plan}`;
    const sub = String(item?.subtitle || "").trim();
    if (sub) return `${mealLabel} · ${sub.split(" - ")[0]}`;
    return `${mealLabel} · Diet`;
  }

  const typeFallback = sourceTag(item);
  const rawName = pickItemName(item);
  if (!rawName) return typeFallback;

  const normalized = rawName.toLowerCase();
  const genericSet = new Set(["vip", "course", "workout", "reminder", "personal", "manual", "item", "diet"]);
  if (genericSet.has(normalized)) return typeFallback;

  const cleaned = sourceTag(item) === "VIP" ? rawName.replace(/^vip\s+/i, "").trim() : rawName;
  return cleaned || typeFallback;
}

function formatDateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const filteredListItems = computed(() => {
  const rows = [...visibleItems.value].sort((a, b) => {
    const ta = new Date(`${a.date}T${a.time || "00:00"}:00`).getTime();
    const tb = new Date(`${b.date}T${b.time || "00:00"}:00`).getTime();
    return tb - ta;
  });
  const today = new Date(`${getTodayLocalDate()}T00:00:00`);
  const todayKey = getTodayLocalDate();
  if (listFilter.value === "today") return rows.filter((row) => row.date === todayKey);
  if (listFilter.value === "week") {
    const start = mondayOfDate(today);
    const end = addDays(start, 6);
    const startKey = formatDateKey(start);
    const endKey = formatDateKey(end);
    return rows.filter((row) => row.date >= startKey && row.date <= endKey);
  }
  if (listFilter.value === "all") return rows;
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const startKey = formatDateKey(start);
  return rows.filter((row) => row.date >= startKey && row.date <= todayKey);
});

function blockToneClass(item) {
  if (item.courseIsPremium) return "tone-vip";
  if (String(item?.itemType || "").toLowerCase() === "diet") return "tone-diet";
  if (item.itemType === "workout" && String(item?.category || "").toLowerCase().includes("custom")) return "tone-custom";
  if (item.itemType === "workout" || item.itemType === "course" || item.courseId) return "tone-plan";
  return "tone-reminder";
}

function endTimeLabel(item) {
  const end = itemEndMinutes(item);
  if (!Number.isFinite(end)) return item?.time || "00:00";
  const hh = String(Math.floor(end / 60) % 24).padStart(2, "0");
  const mm = String(end % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}


/** @returns {Promise<boolean>} true if a focus target was found and highlighted */
async function applyFocusFromQuery() {
  const focusTitle = String(route.query.focusTitle || "").trim().toLowerCase();
  const focusDate = String(route.query.focusDate || "").trim();
  const focusCourseId = String(route.query.focusCourseId || "").trim();
  if (!focusTitle && !focusDate && !focusCourseId) return false;

  const base = [...visibleItems.value];
  let candidates = base;
  if (focusCourseId) candidates = candidates.filter((it) => String(it.courseId || "") === focusCourseId);
  if (focusTitle) candidates = candidates.filter((it) => displayTitle(it).toLowerCase().includes(focusTitle));
  const todayKey = getTodayLocalDate();
  if (focusDate) {
    const dateMatched = candidates.filter((it) => String(it.date || "") === focusDate);
    if (dateMatched.length) {
      candidates = dateMatched;
    } else {
      const todayMatched = candidates.filter((it) => String(it.date || "") === todayKey);
      if (todayMatched.length) {
        candidates = todayMatched;
      } else {
        const futureSorted = [...candidates]
          .filter((it) => String(it.date || "") >= todayKey)
          .sort((a, b) => {
            const ta = new Date(`${a.date}T${a.time || "00:00"}:00`).getTime();
            const tb = new Date(`${b.date}T${b.time || "00:00"}:00`).getTime();
            return ta - tb;
          });
        candidates = futureSorted.length ? [futureSorted[0]] : candidates;
      }
    }
  }
  if (!candidates.length && focusDate) {
    candidates = base;
    if (focusCourseId) candidates = candidates.filter((it) => String(it.courseId || "") === focusCourseId);
    if (focusTitle) candidates = candidates.filter((it) => displayTitle(it).toLowerCase().includes(focusTitle));
  }
  if (!candidates.length) return false;

  candidates.sort((a, b) => {
    const ta = new Date(`${a.date}T${a.time || "00:00"}:00`).getTime();
    const tb = new Date(`${b.date}T${b.time || "00:00"}:00`).getTime();
    return ta - tb;
  });
  const pick = candidates[0];
  const d = new Date(`${pick.date}T00:00:00`);
  if (!Number.isNaN(d.getTime())) {
    selectedDate.value = d;
    weekStart.value = mondayOfDate(d);
  }
  focusedScheduleId.value = String(pick._id || "");
  await nextTick();
  const el = document.querySelector(`[data-schedule-id="${focusedScheduleId.value}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    focusedScheduleId.value = "";
  }, 1600);
  return true;
}
</script>

<template>
  <AppNavbar />
  <main class="page schedule-page">
    <section class="schedule-hero panel">
      <h2 class="title">🗓 Schedule Planner</h2>
      <p class="muted hero-sub">Weekly timeline for courses, workouts, diet blocks, and personal items.</p>
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
          <span>Diet blocks this week</span>
          <strong>{{ weekDietCount }}</strong>
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
        <button type="button" class="nav-btn ghost" @click="jumpTodayWeek">This week (today)</button>
        <button type="button" class="nav-btn" @click="nextWeek">Next week →</button>
      </div>
      <span class="toolbar-hint"
        >{{ weekRangeLabel }} · {{ String(TIMETABLE_START_HOUR).padStart(2, "0") }}:00 -
        {{ String(TIMETABLE_END_HOUR).padStart(2, "0") }}:00</span
      >
    </section>

    <section class="panel panel-tight upcoming-panel">
      <h3>Upcoming Today</h3>
      <ul v-if="upcomingToday.length" class="upcoming-list">
        <li v-for="item in upcomingToday" :key="item._id">
          <strong>{{ item.time }}</strong>
          <span>{{ displayTitle(item) }}</span>
          <em class="tag">{{ sourceTag(item) }}</em>
        </li>
      </ul>
      <p v-else class="muted">No upcoming items for today.</p>
    </section>

    <section class="timetable-card panel">
      <div class="tt-wide">
        <div class="tt-heads-grid">
          <div class="tt-corner" />
          <div
            v-for="d in weekDays"
            :key="d.iso"
            class="tt-day-head"
            :class="{ today: d.isToday, selected: d.isSelected }"
            @click="selectDay(d.iso)"
          >
            <span class="d-lab">{{ d.label }}</span>
            <span class="d-date">{{ d.md }}</span>
          </div>
        </div>
        <div ref="timelineScrollEl" class="tt-scroll-y">
          <div class="tt-timeline-grid">
            <div class="tt-rail">
              <div class="tt-rail-core" :style="{ height: ttBodyH + 'px' }">
                <div
                  v-for="h in hours"
                  :key="'tick-' + h"
                  class="tt-tick"
                  :style="{ top: tickTop(h), transform: tickLabelTransform(h) }"
                >
                  {{ String(h).padStart(2, "0") }}:00
                </div>
              </div>
              <div class="tt-tail-spacer" :style="{ height: ttTailPx + 'px' }" aria-hidden="true" />
            </div>

            <div v-for="d in weekDays" :key="'col-' + d.iso" class="tt-day-col">
              <div class="tt-body" :style="{ height: ttBodyH + 'px' }">
                <div
                  v-for="cluster in clustersForDay(d.iso)"
                  :key="clusterKey(cluster)"
                  class="cluster"
                  :class="{ 'has-merged': cluster.length > 1 }"
                  :style="clusterStyleWithZ(d.iso, cluster)"
                >
                  <div
                    class="block merged-slot"
                    role="button"
                    tabindex="0"
                    :class="{
                      'bundle-mixed': cluster.length > 1 && !clusterIsSamePlanDietGroup(cluster),
                      marked: cluster.some((x) => x.overlapAccepted),
                      'is-vip-course': clusterPrimary(cluster)?.courseIsPremium,
                      completed: clusterPrimary(cluster)?.is_completed,
                      focused: focusedScheduleId && String(clusterPrimary(cluster)?._id || '') === focusedScheduleId,
                      [blockToneClass(clusterPrimary(cluster))]: true,
                      'diet-log-sync-block':
                        cluster.length === 1 && isDietFoodLogScheduleRow(clusterPrimary(cluster)),
                      'block-movement': Boolean(timelineKcalLabel(cluster)),
                    }"
                    :title="timelineBlockTitle(cluster)"
                    :data-schedule-id="String(clusterPrimary(cluster)?._id || '')"
                    @click.stop="onTimelineClusterActivate(d.iso, cluster)"
                    @keydown.enter.prevent="onTimelineClusterActivate(d.iso, cluster)"
                    @keydown.space.prevent="onTimelineClusterActivate(d.iso, cluster)"
                  >
                    <span class="bhead">
                      <span class="bhead-left">
                        <span class="item-tag">{{ sourceTag(clusterPrimary(cluster)) }}</span>
                        <span v-if="clusterPrimary(cluster)?.is_completed" class="done-dot">Completed</span>
                      </span>
                    </span>
                    <span class="btitle">{{ timelineBlockTitle(cluster) }}</span>
                    <span v-if="timelineBlockSubline(cluster)" class="bsub">{{ timelineBlockSubline(cluster) }}</span>
                    <div v-if="timelineKcalLabel(cluster)" class="bfoot">
                      <span class="bkcal">{{ timelineKcalLabel(cluster) }}</span>
                      <span class="bfoot-sep" aria-hidden="true">·</span>
                      <span class="bmeta bmeta--inline">{{ timelineMetaLine(cluster) }}</span>
                    </div>
                    <span v-else class="bmeta">{{ timelineMetaLine(cluster) }}</span>
                    <span v-if="cluster.length > 1" class="bmeta-hint">Open for all items</span>
                  </div>
                </div>
              </div>
              <div class="tt-tail-spacer" :style="{ height: ttTailPx + 'px' }" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="slotModalOpen"
        ref="slotModalOverlayEl"
        class="slot-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-modal-time-heading"
        tabindex="-1"
        @click.self="closeSlotModal"
        @keydown.escape.prevent.stop="closeSlotModal"
      >
        <section class="slot-modal-card" @click.stop>
          <div class="slot-modal-head">
            <div>
              <h3 id="slot-modal-time-heading">{{ clusterTimeRangeLabel(slotModalItems) }}</h3>
              <p v-if="slotModalItems[0]?.date" class="slot-modal-sub muted">Date: {{ slotModalItems[0].date }}</p>
            </div>
            <button type="button" class="slot-modal-close" aria-label="Close" @click="closeSlotModal">×</button>
          </div>
          <template v-if="slotModalItems.length === 1 && slotModalItems[0]">
            <div class="slot-modal-core" :class="{ 'slot-modal-core--diet-log': isDietFoodLogScheduleRow(slotModalItems[0]) }">
              <div class="slot-modal-core-tags">
                <span class="item-tag item-tag--lg">{{ sourceTag(slotModalItems[0]) }}</span>
                <span v-if="slotModalItems[0].is_completed && !isDietFoodLogScheduleRow(slotModalItems[0])" class="done-dot">Completed</span>
              </div>
              <h4 class="slot-modal-hero-title">{{ singleModalHeadline(slotModalItems[0]) }}</h4>

              <template v-if="isCourseLikeItem(slotModalItems[0]) && !isDietFoodLogScheduleRow(slotModalItems[0])">
                <dl class="slot-meta-dl slot-meta-dl--course">
                  <template v-if="modalDurationLine(slotModalItems[0])">
                    <dt>Duration</dt>
                    <dd>{{ modalDurationLine(slotModalItems[0]) }}</dd>
                  </template>
                  <template v-if="scheduleItemKcalDisplay(slotModalItems[0])">
                    <dt>Estimated burn</dt>
                    <dd>{{ scheduleItemKcalDisplay(slotModalItems[0]) }}</dd>
                  </template>
                  <dt>Status</dt>
                  <dd>{{ modalStatusLine(slotModalItems[0]) }}</dd>
                  <template v-if="String(slotModalItems[0].category || '').trim()">
                    <dt>Category</dt>
                    <dd>{{ slotModalItems[0].category }}</dd>
                  </template>
                </dl>
                <div v-if="courseModalExerciseList(slotModalItems[0]).length" class="slot-modal-exercises">
                  <p class="muted slot-modal-exercises-h">Exercises</p>
                  <ul class="slot-modal-exercise-list">
                    <li v-for="(name, idx) in courseModalExerciseList(slotModalItems[0])" :key="idx" class="slot-modal-exercise-li">
                      {{ name }}
                    </li>
                  </ul>
                </div>
              </template>

              <dl v-else-if="!isDietFoodLogScheduleRow(slotModalItems[0])" class="slot-meta-dl">
                <template v-if="scheduleItemKcalDisplay(slotModalItems[0])">
                  <dt>{{ itemTypeLower(slotModalItems[0]) === "diet" ? "Calories" : "Estimated burn" }}</dt>
                  <dd>{{ scheduleItemKcalDisplay(slotModalItems[0]) }}</dd>
                </template>
                <template v-if="modalDurationLine(slotModalItems[0])">
                  <dt>Duration</dt>
                  <dd>{{ modalDurationLine(slotModalItems[0]) }}</dd>
                </template>
                <dt>Status</dt>
                <dd>{{ modalStatusLine(slotModalItems[0]) }}</dd>
                <template v-if="workoutSourceLine(slotModalItems[0])">
                  <dt>Source</dt>
                  <dd>{{ workoutSourceLine(slotModalItems[0]) }}</dd>
                </template>
                <template v-if="String(slotModalItems[0].subtitle || '').trim()">
                  <dt>Detail</dt>
                  <dd class="slot-meta-dd-wrap">{{ slotModalItems[0].subtitle }}</dd>
                </template>
                <template v-if="String(slotModalItems[0].category || '').trim()">
                  <dt>Category</dt>
                  <dd>{{ slotModalItems[0].category }}</dd>
                </template>
                <template v-if="modalNoteLine(slotModalItems[0])">
                  <dt>Note</dt>
                  <dd class="slot-meta-dd-wrap">{{ modalNoteLine(slotModalItems[0]) }}</dd>
                </template>
              </dl>

              <dl v-else class="slot-meta-dl slot-meta-dl--diet-log">
                <template v-if="modalDurationLine(slotModalItems[0])">
                  <dt>Duration</dt>
                  <dd>{{ modalDurationLine(slotModalItems[0]) }}</dd>
                </template>
              </dl>

              <div
                v-if="isDietFoodLogScheduleRow(slotModalItems[0]) && slotModalDietDetail && (slotModalDietDetail.loading || slotModalDietDetail.loaded)"
                class="diet-meal-detail diet-meal-detail--in-core"
              >
                <template v-if="slotModalDietDetail.loading">
                  <p class="muted diet-meal-detail-status">Loading foods…</p>
                </template>
                <template v-else-if="slotModalDietDetail.error">
                  <p class="error diet-meal-detail-status">{{ slotModalDietDetail.error }}</p>
                </template>
                <template v-else>
                  <p v-if="slotModalDietDetail.records?.length" class="muted slot-diet-foods-h">Foods</p>
                  <ul v-if="slotModalDietDetail.records?.length" class="diet-meal-detail-list">
                    <li v-for="r in slotModalDietDetail.records" :key="String(r._id)" class="diet-meal-detail-row diet-meal-detail-row--modal">
                      <span class="dm-name">{{ r.foodName }}</span>
                      <span class="dm-kcal">{{ formatDisplayKcal(r.calories) }} kcal</span>
                    </li>
                  </ul>
                  <p v-else class="muted diet-meal-detail-status">No diet records matched this meal block.</p>
                  <p v-if="slotModalDietDetail.records?.length" class="diet-meal-detail-total">
                    <strong>Total:</strong> {{ formatDisplayKcal(slotModalDietDetail.total) }} kcal
                  </p>
                </template>
              </div>

              <div class="slot-modal-core-actions">
                <button
                  type="button"
                  class="nav-btn ghost slot-act"
                  @click="runModalAction(slotModalItems[0], modalRowAction(slotModalItems[0]).kind)"
                >
                  {{ modalRowAction(slotModalItems[0]).label }}
                </button>
                <button
                  type="button"
                  class="slot-del"
                  :disabled="deletingIds.has(String(slotModalItems[0]._id))"
                  @click="removeSlotItem(slotModalItems[0])"
                >
                  Delete
                </button>
              </div>
            </div>
          </template>

          <ul v-else class="slot-modal-list">
            <li v-for="it in slotModalItems" :key="String(it._id)" class="slot-modal-row">
              <div class="slot-modal-row-text">
                <div class="slot-modal-row-head">
                  <span class="item-tag">{{ sourceTag(it) }}</span>
                  <span v-if="it.is_completed" class="done-dot done-dot--sm">Completed</span>
                </div>
                <strong class="slot-row-title slot-row-title--multi">{{ displayTitle(it) }}</strong>
                <p class="muted slot-row-meta">
                  {{ it.time }} – {{ endTimeLabel(it) }}
                  <template v-if="modalDurationLine(it)"> · {{ modalDurationLine(it) }}</template>
                  <template v-if="scheduleItemKcalDisplay(it)"> · {{ scheduleItemKcalDisplay(it) }}</template>
                </p>
                <p v-if="!isDietFoodLogScheduleRow(it)" class="muted slot-row-status">Status: {{ modalStatusLine(it) }}</p>
                <p v-if="it.subtitle" class="muted slot-row-sub">{{ it.subtitle }}</p>
              </div>
              <div class="slot-modal-row-actions">
                <button type="button" class="nav-btn ghost slot-act" @click="runModalAction(it, modalRowAction(it).kind)">
                  {{ modalRowAction(it).label }}
                </button>
                <button type="button" class="slot-del" :disabled="deletingIds.has(String(it._id))" @click="removeSlotItem(it)">
                  Delete
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </Teleport>

    <section class="panel add-panel">
      <h3>Add schedule item</h3>
      <p class="muted">
        Add Workout, Course Session, Reminder, or Personal. Diet meal blocks on the timeline come from Diet records (Add to
        Records / manual add). Leave times empty to auto-pick the next free slot. Workout items also appear on the Workout page
        for that date.
      </p>
      <form novalidate @submit.prevent="addItem">
        <input v-model="form.title" placeholder="Title" />
        <div class="grid grid-3">
          <select v-model="form.itemType">
            <option value="workout">Workout / Exercise</option>
            <option value="course_session">Course Session</option>
            <option value="reminder">Reminder</option>
            <option value="personal">Personal Item</option>
          </select>
          <input v-model="form.category" placeholder="Category (optional)" />
          <input v-model="form.date" type="date" />
        </div>
        <div class="grid grid-3">
          <input v-model="form.startTime" type="time" placeholder="Start time (optional)" />
          <input v-model="form.endTime" type="time" placeholder="End time (optional)" />
          <input v-model="form.note" placeholder="Note (optional)" />
        </div>
        <p v-if="formError" class="error">{{ formError }}</p>
        <p v-if="formInfo" class="info">{{ formInfo }}</p>
        <button type="submit">Save Schedule</button>
      </form>
    </section>

    <details class="list-details">
      <summary>Full list view</summary>
      <div class="list-filter-row">
        <div class="toolbar-group">
          <button type="button" class="nav-btn ghost" @click="listFilter = 'today'">Today</button>
          <button type="button" class="nav-btn ghost" @click="listFilter = 'week'">This Week</button>
          <button type="button" class="nav-btn ghost" @click="listFilter = 'all'">All</button>
        </div>
      </div>
      <article v-for="s in filteredListItems" :key="s._id" class="card">
        <h3>{{ displayTitle(s) }}</h3>
        <p v-if="s.subtitle">{{ s.subtitle }}</p>
        <p class="muted">Type: {{ sourceTag(s) }}</p>
        <p>Date: {{ s.date }} · {{ s.time }} ({{ effectiveDurationMinutes(s) }} min)</p>
        <p class="muted">{{ s.note || "No note" }}</p>
        <button :disabled="deletingIds.has(String(s._id))" @click="removeItem(s)">Delete</button>
      </article>
      <p v-if="!filteredListItems.length" class="muted">No records in this filter.</p>
    </details>
  </main>
</template>

<style scoped>
.schedule-page {
  max-width: 1200px;
  background: #f5f7f8;
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

.toolbar-hint {
  font-size: 12px;
  color: #486170;
  margin-left: auto;
  padding-left: 6px;
}

.upcoming-panel {
  display: grid;
  gap: 8px;
}

.upcoming-panel h3 {
  margin: 0;
}

.upcoming-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.upcoming-list li {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f5fbf9;
  color: var(--c6);
  font-size: 13px;
}

.tag {
  font-style: normal;
  font-size: 11px;
  color: #2f4858;
  background: #e7f2ef;
  border: 1px solid #cde4df;
  border-radius: 999px;
  padding: 2px 8px;
}

.timetable-card {
  margin-top: 14px;
  overflow-x: auto;
  border: 1px solid #d1e3df;
  background: #fcfffe;
}

.tt-wide {
  min-width: 760px;
}

.tt-heads-grid {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(80px, 1fr));
}

.tt-scroll-y {
  max-height: 70vh;
  overflow-y: auto;
  overflow-x: visible;
}

.tt-timeline-grid {
  display: grid;
  grid-template-columns: 52px repeat(7, minmax(80px, 1fr));
}

.tt-corner {
  grid-column: 1;
  border-bottom: 1px solid #d7e7e6;
}

.tt-day-head {
  text-align: center;
  padding: 10px 4px;
  border-bottom: 1px solid #d7e7e6;
  border-left: 1px solid #eef5f4;
  background: linear-gradient(180deg, #f9fdfc, #edf6f4);
  cursor: pointer;
}

.tt-day-head.today {
  background: linear-gradient(180deg, #dff6ec, #c9eddc);
}

.tt-day-head.selected {
  box-shadow: inset 0 -2px 0 #348b93;
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
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-right: 1px solid #d7e7e6;
  background: #fafcfb;
}

.tt-rail-core {
  position: relative;
  flex: 0 0 auto;
  box-sizing: border-box;
}

.tt-tick {
  position: absolute;
  left: 4px;
  font-size: 10px;
  color: #6a7d86;
  white-space: nowrap;
}

.tt-day-col {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border-left: 1px solid #eef5f4;
}

.tt-tail-spacer {
  flex: 0 0 auto;
  width: 100%;
  min-height: 0;
  pointer-events: none;
  box-sizing: border-box;
}

.tt-body {
  position: relative;
  flex: 0 0 auto;
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

.block {
  position: relative;
  box-sizing: border-box;
  padding: 9px 10px 8px;
  border-radius: 8px;
  background: linear-gradient(135deg, #d8f0ec, #b8e0d8);
  border: 1px solid var(--c3);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
  box-shadow: 0 3px 10px rgba(47, 72, 88, 0.12);
  overflow: hidden;
  min-height: 68px;
}

.block.merged-slot {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  min-height: 0;
  height: auto;
  cursor: pointer;
}

.block.merged-slot.diet-log-sync-block {
  min-height: 86px;
  padding-top: 10px;
  padding-bottom: 10px;
  gap: 5px;
  line-height: 1.35;
}

.block.merged-slot.diet-log-sync-block .btitle,
.block.merged-slot.diet-log-sync-block .bsub,
.block.merged-slot.diet-log-sync-block .bmeta {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  word-break: break-word;
}

.block.merged-slot.block-movement {
  gap: 2px;
  padding: 6px 8px 5px;
}

.block.merged-slot.block-movement .bhead {
  flex-wrap: wrap;
  row-gap: 2px;
}

.block.merged-slot.block-movement .item-tag,
.block.merged-slot.block-movement .done-dot {
  font-size: 8.5px;
}

.block.merged-slot.block-movement .btitle {
  line-height: 1.22;
}

.block.merged-slot:hover {
  filter: brightness(1.02);
  box-shadow: 0 4px 12px rgba(47, 72, 88, 0.16);
}

.block.focused {
  box-shadow: 0 0 0 2px rgba(72, 174, 164, 0.55);
}

.block.completed {
  opacity: 0.72;
}

.block.tone-plan {
  background: linear-gradient(135deg, #d9f3e8, #bfe7d8);
  border-color: #7ed1ac;
}

.block.tone-custom {
  background: linear-gradient(135deg, #e1efff, #cddfff);
  border-color: #7fa9d9;
}

.block.tone-reminder {
  background: linear-gradient(135deg, #f2f4f7, #e5e8ee);
  border-color: #c9cfd8;
}

.block.tone-diet {
  background: linear-gradient(135deg, #fdf6ee, #f5e8d6);
  border-color: #d4a574;
}

.block.bundle-mixed {
  background: linear-gradient(135deg, #e8f4ff, #cfe8ff);
  border-color: #6ba3c7;
}

.block.is-vip-course {
  background: linear-gradient(135deg, #f3e8ff, #e9d5ff);
  border-color: #9333ea;
}

.block.marked {
  border-style: dashed;
  border-width: 2px;
}

.btitle {
  font-size: 12.5px;
  font-weight: 700;
  color: #1a3338;
  line-height: 1.35;
  word-break: keep-all;
  overflow-wrap: break-word;
  hyphens: none;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-right: 0;
  flex: 0 0 auto;
  min-width: 0;
}

.bfoot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
  row-gap: 0;
  margin-top: auto;
  flex: 0 0 auto;
  min-width: 0;
}

.bfoot-sep {
  color: #5a7580;
  font-size: 10px;
  font-weight: 600;
  flex: 0 0 auto;
  line-height: 1.2;
}

.bkcal {
  font-size: 10.5px;
  font-weight: 600;
  color: #2f6f5c;
  letter-spacing: 0.01em;
  line-height: 1.25;
  white-space: nowrap;
  flex: 0 0 auto;
}

.bfoot .bkcal {
  overflow: visible;
}

.bmeta--inline {
  margin-top: 0;
  font-size: 10.5px;
  color: #4b6672;
  line-height: 1.25;
  white-space: nowrap;
  overflow: visible;
  flex: 1 1 auto;
  min-width: 0;
}

.bhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.bhead-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.done-dot {
  font-size: 9px;
  font-weight: 700;
  color: #1b7e5a;
  background: #e4f4ee;
  border: 1px solid #bfe2d3;
  border-radius: 999px;
  padding: 1px 6px;
}

.item-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #2f4858;
  background: #e5f3ef;
  border: 1px solid #c6e2db;
}

.bsub {
  font-size: 11px;
  font-weight: 600;
  color: #3d5a63;
  line-height: 1.25;
}

.bmeta-hint {
  font-size: 9px;
  font-weight: 600;
  color: #5a7580;
  letter-spacing: 0.02em;
}

.bmeta {
  font-size: 10.5px;
  color: #4b6672;
  flex-shrink: 0;
  margin-top: auto;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bx {
  position: static;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.45);
  color: #2f4858;
  cursor: pointer;
  line-height: 20px;
  font-size: 14px;
  font-weight: 700;
  flex: 0 0 auto;
}

.bx:hover {
  background: rgba(255, 224, 224, 0.95);
  color: #b42318;
}

.add-panel {
  margin-top: 20px;
  border: 1px solid #d1e3df;
}

.add-panel .error {
  color: #b42318;
  font-size: 13px;
  margin: 8px 0 0;
}

.add-panel .info {
  color: #2f7a6b;
  font-size: 13px;
  margin: 8px 0 0;
}

.small-hint {
  font-size: 12px;
  align-self: center;
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

.list-filter-row {
  margin-top: 10px;
  display: flex;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
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

.slot-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  background: rgba(15, 35, 40, 0.45);
  display: grid;
  place-items: center;
  padding: 16px;
  box-sizing: border-box;
}

.slot-modal-card {
  width: min(440px, 100%);
  max-height: min(86vh, 640px);
  overflow: auto;
  border-radius: 14px;
  background: #fdfefe;
  border: 1px solid #cfe4df;
  box-shadow: 0 16px 40px rgba(30, 60, 55, 0.2);
  padding: 16px 18px 18px;
}

.slot-modal-core {
  margin-top: 2px;
}

.slot-modal-core-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.slot-modal-hero-title {
  margin: 8px 0 0;
  font-size: 17px;
  font-weight: 700;
  color: #1f3b42;
  line-height: 1.35;
  word-break: break-word;
}

.slot-meta-dl {
  display: grid;
  grid-template-columns: minmax(92px, 34%) 1fr;
  gap: 6px 12px;
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f5fbf9;
  border: 1px solid #dceae6;
  font-size: 13px;
}

.slot-meta-dl dt {
  margin: 0;
  font-weight: 700;
  color: #5a7580;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.slot-meta-dl dd {
  margin: 0;
  color: #1a3338;
  font-weight: 600;
}

.slot-meta-dd-wrap {
  font-weight: 500;
  white-space: pre-wrap;
  word-break: break-word;
}

.slot-modal-core-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e6f0ed;
}

.item-tag--lg {
  font-size: 10px;
  padding: 2px 8px;
}

.slot-modal-core--diet-log .diet-meal-detail--in-core {
  margin: 10px 0 16px;
}

.slot-diet-foods-h {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
}

.done-dot--sm {
  font-size: 8px;
  padding: 1px 5px;
}

.slot-modal-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.slot-row-title--multi {
  display: block;
  margin-top: 6px;
}

.slot-row-meta {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
}

.slot-row-status {
  margin: 2px 0 0;
  font-size: 11px;
}

.diet-meal-detail {
  margin: 0 0 14px;
  padding: 12px 12px 10px;
  border-radius: 10px;
  background: #f3faf8;
  border: 1px solid #cfe4df;
}

.diet-meal-detail-status {
  margin: 0;
  font-size: 13px;
}

.diet-meal-detail-title {
  margin: 0 0 10px;
  font-size: 15px;
  color: #1f3b42;
}

.diet-meal-detail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.diet-meal-detail-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "name kcal" "src src";
  gap: 2px 12px;
  font-size: 13px;
  color: #2f4858;
}

.dm-name {
  grid-area: name;
  font-weight: 600;
  word-break: break-word;
}

.dm-kcal {
  grid-area: kcal;
  justify-self: end;
  white-space: nowrap;
}

.dm-src {
  grid-area: src;
  font-size: 12px;
}

.diet-meal-detail-row--modal {
  grid-template-areas: "name kcal";
}

.slot-modal-exercises {
  margin: 12px 0 0;
  padding: 12px 12px 10px;
  border-radius: 10px;
  background: #f3f7fb;
  border: 1px solid #d5e2f0;
}

.slot-modal-exercises-h {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
}

.slot-modal-exercise-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.slot-modal-exercise-li {
  font-size: 13px;
  color: #2f4858;
  padding-left: 0.65rem;
  position: relative;
}

.slot-modal-exercise-li::before {
  content: "–";
  position: absolute;
  left: 0;
  color: #6b8a9e;
}

.slot-meta-dl--diet-log {
  margin-bottom: 8px;
}

.diet-meal-detail-total {
  margin: 10px 0 0;
  font-size: 14px;
  color: #1f3b42;
}

.slot-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e6f0ed;
}

.slot-modal-head h3 {
  margin: 0;
  font-size: 18px;
  color: #1f3b42;
}

.slot-modal-sub {
  margin: 4px 0 0;
  font-size: 12px;
}

.slot-modal-close {
  border: none;
  background: #e8eceb;
  color: #2f4858;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.slot-modal-close:hover {
  background: #dde8e5;
}

.slot-modal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.slot-modal-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f5fbf9;
  border: 1px solid #d8ebe6;
}

.slot-modal-row-text {
  flex: 1 1 200px;
  min-width: 0;
}

.slot-row-time {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #2f4858;
}

.slot-row-title {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: #1a3338;
  line-height: 1.35;
}

.slot-row-sub {
  margin: 4px 0 0;
  font-size: 11px;
}

.slot-modal-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.slot-act {
  font-size: 12px;
  padding: 6px 12px;
}

.slot-del {
  border: 1px solid #e8c9c9;
  background: #fff5f5;
  color: #9b1c1c;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.slot-del:hover:not(:disabled) {
  background: #ffe4e4;
}

.slot-del:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
