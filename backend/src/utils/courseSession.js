const {
  calculateWorkoutCaloriesBurned,
  exerciseEffectiveDurationMinutes,
  resolveWeightKg,
} = require("./workoutCaloriesBurn");

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

function buildExercise(title, type, details = {}, courseCategory, weightKg) {
  const duration_minutes = Number(details.duration_minutes || 0);
  const reps = Number(details.reps || 0);
  const hold_seconds = Number(details.hold_seconds || 0);
  const draft = { title, type, duration_minutes, reps, hold_seconds };
  const effMin = exerciseEffectiveDurationMinutes(draft);
  const w = resolveWeightKg(weightKg);
  const estimated = calculateWorkoutCaloriesBurned({
    durationMinutes: effMin,
    category: String(courseCategory || ""),
    title,
    weightKg: w,
  });
  return {
    exercise_id: details.exercise_id || slugify(title),
    title,
    type,
    duration_minutes,
    reps,
    hold_seconds,
    estimated_burn: roundBurn(estimated),
    status: details.status || "not_started",
  };
}

function buildCourseExercises(course, dayIndex = 1, weightKg) {
  const title = String(course?.title || "").toLowerCase();
  const category = String(course?.category || "").toLowerCase();
  const duration = Math.max(10, Number(course?.duration || 30));
  const effortBoost = ((Number(dayIndex || 1) - 1) % 3) * 2;
  const courseCategory = String(course?.category || "");

  if (title.includes("core")) {
    return [
      buildExercise("Warm-up Jog", "time", { duration_minutes: 5 }, courseCategory, weightKg),
      buildExercise("Plank", "hold", { hold_seconds: 60 + effortBoost * 5 }, courseCategory, weightKg),
      buildExercise("Crunches", "reps", { reps: 15 + effortBoost }, courseCategory, weightKg),
      buildExercise("Stretch", "time", { duration_minutes: Math.max(5, duration - 10) }, courseCategory, weightKg),
    ];
  }

  if (title.includes("yoga") || category.includes("yoga") || category.includes("mobility") || title.includes("stretch")) {
    return [
      buildExercise("Breathing Prep", "time", { duration_minutes: 5 }, courseCategory, weightKg),
      buildExercise("Flow Sequence", "time", { duration_minutes: Math.max(10, Math.floor(duration * 0.45)) }, courseCategory, weightKg),
      buildExercise("Balance Hold", "hold", { hold_seconds: 45 + effortBoost * 5 }, courseCategory, weightKg),
      buildExercise("Cool-down Stretch", "time", { duration_minutes: Math.max(5, duration - 18) }, courseCategory, weightKg),
    ];
  }

  if (title.includes("hiit") || category.includes("cardio") || title.includes("cycle") || title.includes("spin")) {
    return [
      buildExercise("Warm-up", "time", { duration_minutes: 5 }, courseCategory, weightKg),
      buildExercise("Main Interval", "time", { duration_minutes: Math.max(8, Math.floor(duration * 0.35)) }, courseCategory, weightKg),
      buildExercise("Power Set", "reps", { reps: 12 + effortBoost }, courseCategory, weightKg),
      buildExercise("Recovery Walk", "time", { duration_minutes: Math.max(5, duration - 18) }, courseCategory, weightKg),
    ];
  }

  if (category.includes("strength") || title.includes("box") || title.includes("functional")) {
    return [
      buildExercise("Activation Warm-up", "time", { duration_minutes: 6 }, courseCategory, weightKg),
      buildExercise("Strength Set", "reps", { reps: 12 + effortBoost }, courseCategory, weightKg),
      buildExercise("Hold Finisher", "hold", { hold_seconds: 45 + effortBoost * 5 }, courseCategory, weightKg),
      buildExercise("Recovery Stretch", "time", { duration_minutes: Math.max(5, duration - 16) }, courseCategory, weightKg),
    ];
  }

  return [
    buildExercise("Warm-up", "time", { duration_minutes: 5 }, courseCategory, weightKg),
    buildExercise("Main Exercise", "time", { duration_minutes: Math.max(10, Math.floor(duration * 0.5)) }, courseCategory, weightKg),
    buildExercise("Skill Set", "reps", { reps: 10 + effortBoost }, courseCategory, weightKg),
    buildExercise("Cool-down", "time", { duration_minutes: Math.max(5, duration - 15) }, courseCategory, weightKg),
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
