function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function roundBurn(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
}

function buildExercise(title, type, details = {}) {
  return {
    exercise_id: details.exercise_id || slugify(title),
    title,
    type,
    duration_minutes: Number(details.duration_minutes || 0),
    reps: Number(details.reps || 0),
    hold_seconds: Number(details.hold_seconds || 0),
    estimated_burn: roundBurn(details.estimated_burn),
    status: details.status || "not_started",
  };
}

function buildCourseExercises(course, dayIndex = 1) {
  const title = String(course?.title || "").toLowerCase();
  const category = String(course?.category || "").toLowerCase();
  const duration = Math.max(10, Number(course?.duration || 30));
  const effortBoost = ((Number(dayIndex || 1) - 1) % 3) * 2;

  if (title.includes("core")) {
    return [
      buildExercise("Warm-up Jog", "time", { duration_minutes: 5, estimated_burn: 24 + effortBoost }),
      buildExercise("Plank", "hold", { hold_seconds: 60 + effortBoost * 5, estimated_burn: 10 + effortBoost }),
      buildExercise("Crunches", "reps", { reps: 15 + effortBoost, estimated_burn: 14 + effortBoost }),
      buildExercise("Stretch", "time", { duration_minutes: Math.max(5, duration - 10), estimated_burn: 12 }),
    ];
  }

  if (title.includes("yoga") || category.includes("yoga") || category.includes("mobility") || title.includes("stretch")) {
    return [
      buildExercise("Breathing Prep", "time", { duration_minutes: 5, estimated_burn: 8 }),
      buildExercise("Flow Sequence", "time", { duration_minutes: Math.max(10, Math.floor(duration * 0.45)), estimated_burn: 26 }),
      buildExercise("Balance Hold", "hold", { hold_seconds: 45 + effortBoost * 5, estimated_burn: 10 }),
      buildExercise("Cool-down Stretch", "time", { duration_minutes: Math.max(5, duration - 18), estimated_burn: 12 }),
    ];
  }

  if (title.includes("hiit") || category.includes("cardio") || title.includes("cycle") || title.includes("spin")) {
    return [
      buildExercise("Warm-up", "time", { duration_minutes: 5, estimated_burn: 22 }),
      buildExercise("Main Interval", "time", { duration_minutes: Math.max(8, Math.floor(duration * 0.35)), estimated_burn: 68 + effortBoost * 3 }),
      buildExercise("Power Set", "reps", { reps: 12 + effortBoost, estimated_burn: 24 }),
      buildExercise("Recovery Walk", "time", { duration_minutes: Math.max(5, duration - 18), estimated_burn: 18 }),
    ];
  }

  if (category.includes("strength") || title.includes("box") || title.includes("functional")) {
    return [
      buildExercise("Activation Warm-up", "time", { duration_minutes: 6, estimated_burn: 18 }),
      buildExercise("Strength Set", "reps", { reps: 12 + effortBoost, estimated_burn: 32 + effortBoost }),
      buildExercise("Hold Finisher", "hold", { hold_seconds: 45 + effortBoost * 5, estimated_burn: 12 + effortBoost }),
      buildExercise("Recovery Stretch", "time", { duration_minutes: Math.max(5, duration - 16), estimated_burn: 10 }),
    ];
  }

  return [
    buildExercise("Warm-up", "time", { duration_minutes: 5, estimated_burn: 16 }),
    buildExercise("Main Exercise", "time", { duration_minutes: Math.max(10, Math.floor(duration * 0.5)), estimated_burn: 36 + effortBoost }),
    buildExercise("Skill Set", "reps", { reps: 10 + effortBoost, estimated_burn: 18 }),
    buildExercise("Cool-down", "time", { duration_minutes: Math.max(5, duration - 15), estimated_burn: 10 }),
  ];
}

function summarizeCourseExercises(exercises) {
  const rows = Array.isArray(exercises) ? exercises : [];
  const total = rows.length;
  const completed = rows.filter((item) => String(item?.status || "") === "completed").length;
  const inProgress = rows.some((item) => String(item?.status || "") === "in_progress");
  const estimatedBurn = rows.reduce((sum, item) => sum + Number(item?.estimated_burn || 0), 0);
  const burnedSoFar = rows
    .filter((item) => String(item?.status || "") === "completed")
    .reduce((sum, item) => sum + Number(item?.estimated_burn || 0), 0);
  let status = "not_started";
  if (total > 0 && completed === total) status = "completed";
  else if (completed > 0 || inProgress) status = "in_progress";
  return {
    status,
    total_exercises: total,
    completed_exercises: completed,
    estimated_burn: roundBurn(estimatedBurn),
    burned_so_far: roundBurn(burnedSoFar),
  };
}

module.exports = { buildCourseExercises, summarizeCourseExercises };
