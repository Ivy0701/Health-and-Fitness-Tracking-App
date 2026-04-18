function toText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildWorkoutSessionTaskId({
  planId = "",
  scheduleItemId = "",
  sessionMode = "",
  courseEnrolledId = "",
  courseExerciseId = "",
}) {
  const schedule = toText(scheduleItemId);
  if (schedule) return `schedule:${schedule}`;
  if (toText(sessionMode) === "course_exercise") {
    const enrolled = toText(courseEnrolledId);
    const exercise = toText(courseExerciseId);
    if (enrolled && exercise) return `course:${enrolled}:${exercise}`;
  }
  const plan = toText(planId);
  if (plan) return `plan:${plan}`;
  return "";
}

function storageKey(userId, taskId) {
  return `workout_session_${toText(userId)}_${toText(taskId)}`;
}

export function loadWorkoutSessionState({ userId, taskId, date }) {
  const uid = toText(userId);
  const tid = toText(taskId);
  if (!uid || !tid) return null;
  try {
    const raw = localStorage.getItem(storageKey(uid, tid));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (toText(data.date) && toText(date) && toText(data.date) !== toText(date)) return null;
    return {
      status: toText(data.status) || "in_progress",
      remainingTime: Math.max(0, Math.round(toNumber(data.remainingTime, 0))),
      totalDuration: Math.max(0, Math.round(toNumber(data.totalDuration, toNumber(data.duration, 0)))),
      isPaused: Boolean(data.isPaused),
      exerciseId: toText(data.exerciseId),
      date: toText(data.date),
      updatedAt: toNumber(data.updatedAt, toNumber(data.lastUpdated, Date.now())),
    };
  } catch {
    return null;
  }
}

export function saveWorkoutSessionState({ userId, taskId, state }) {
  const uid = toText(userId);
  const tid = toText(taskId);
  if (!uid || !tid || !state || typeof state !== "object") return;
  try {
    localStorage.setItem(
      storageKey(uid, tid),
      JSON.stringify({
        status: toText(state.status) || "in_progress",
        remainingTime: Math.max(0, Math.round(toNumber(state.remainingTime, 0))),
        totalDuration: Math.max(0, Math.round(toNumber(state.totalDuration, toNumber(state.duration, 0)))),
        isPaused: Boolean(state.isPaused),
        exerciseId: toText(state.exerciseId),
        date: toText(state.date),
        updatedAt: Date.now(),
      })
    );
  } catch {
    // ignore localStorage write failure
  }
}

export function clearWorkoutSessionState({ userId, taskId }) {
  const uid = toText(userId);
  const tid = toText(taskId);
  if (!uid || !tid) return;
  try {
    localStorage.removeItem(storageKey(uid, tid));
  } catch {
    // ignore
  }
}
