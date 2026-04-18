const asyncHandler = require("../../utils/asyncHandler");
const Course = require("../../models/Course");
const EnrolledCourse = require("../../models/EnrolledCourse");
const CourseDailyProgress = require("../../models/CourseDailyProgress");
const ScheduleItem = require("../../models/ScheduleItem");
const ScheduleSkip = require("../../models/ScheduleSkip");
const Workout = require("../../models/Workout");
const User = require("../../models/User");
const { buildCourseExercises, summarizeCourseExercises } = require("../../utils/courseSession");
const { applyMetBurnsToExercises } = require("../../utils/workoutCaloriesBurn");

function defaultExercisesPreview({ title, category }) {
  const text = String(title || "").toLowerCase();
  const cat = String(category || "").toLowerCase();
  if (text.includes("core")) return ["Warm-up jog", "Stretching", "Core activation", "Recovery breathing"];
  if (text.includes("yoga") || cat.includes("yoga")) return ["Breathing prep", "Flow sequence", "Balance hold", "Cool-down stretch"];
  if (text.includes("hiit") || cat.includes("cardio")) return ["Warm-up", "Intervals", "Power set", "Recovery walk"];
  if (cat.includes("strength") || text.includes("boxing")) return ["Activation warm-up", "Strength set", "Hold finisher", "Recovery stretch"];
  return ["Warm-up", "Main exercise", "Skill set", "Cool-down"];
}

function normalizeDifficultyValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (/^[1-5]$/.test(raw)) return Number(raw);
  if (["beginner"].includes(raw)) return 1;
  if (["easy"].includes(raw)) return 2;
  if (["intermediate"].includes(raw)) return 3;
  if (["hard", "advanced"].includes(raw)) return 4;
  if (["expert"].includes(raw)) return 5;
  return 2;
}

function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function isVipUser(userId) {
  const user = await User.findById(userId).select("vip_status isVip").lean();
  return Boolean(user?.vip_status ?? user?.isVip);
}

function normalizeWeeklySlots(raw) {
  if (!Array.isArray(raw)) return [];
  const timeOk = (t) => {
    const s = String(t || "").trim().slice(0, 5);
    return /^\d{1,2}:\d{2}$/.test(s);
  };
  return raw
    .filter((s) => s && Number.isFinite(Number(s.weekday)) && timeOk(s.startTime))
    .map((s) => {
      const [h, m] = String(s.startTime).trim().slice(0, 5).split(":");
      const hh = String(Math.min(23, Math.max(0, Number(h)))).padStart(2, "0");
      const mm = String(Math.min(59, Math.max(0, Number(m || 0)))).padStart(2, "0");
      return {
        weekday: Math.max(0, Math.min(6, Number(s.weekday))),
        startTime: `${hh}:${mm}`,
      };
    });
}

const list = asyncHandler(async (req, res) => {
  const rows = await Course.find().sort({ createdAt: -1 });
  res.json(
    rows.map((row) => ({
      ...row.toObject(),
      difficulty_value: normalizeDifficultyValue(row.difficulty),
      target_users: row.target_users || row.difficulty || "beginner",
      exercises_preview: Array.isArray(row.exercises_preview) && row.exercises_preview.length
        ? row.exercises_preview
        : defaultExercisesPreview(row),
    }))
  );
});

const create = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    difficulty,
    duration,
    duration_days,
    category,
    target_users,
    exercises_preview,
    isFeatured,
    isPremium,
    weeklySlots,
  } = req.body;
  if (!title) return res.status(400).json({ message: "title is required" });
  const slots = normalizeWeeklySlots(weeklySlots);
  const row = await Course.create({
    title,
    description,
    difficulty,
    duration,
    duration_days: Number(duration_days) > 0 ? Number(duration_days) : 7,
    category,
    target_users: String(target_users || difficulty || "beginner").trim(),
    exercises_preview:
      Array.isArray(exercises_preview) && exercises_preview.length
        ? exercises_preview.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : defaultExercisesPreview({ title, category }),
    isFeatured,
    isPremium,
    weeklySlots: slots,
  });
  res.status(201).json({
    ...row.toObject(),
    difficulty_value: normalizeDifficultyValue(row.difficulty),
    target_users: row.target_users || row.difficulty || "beginner",
    exercises_preview: row.exercises_preview?.length ? row.exercises_preview : defaultExercisesPreview(row),
  });
});

const detail = asyncHandler(async (req, res) => {
  const row = await Course.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Course not found" });
  res.json({
    ...row.toObject(),
    difficulty_value: normalizeDifficultyValue(row.difficulty),
    target_users: row.target_users || row.difficulty || "beginner",
    exercises_preview: row.exercises_preview?.length ? row.exercises_preview : defaultExercisesPreview(row),
  });
});

const listEnrolled = asyncHandler(async (req, res) => {
  const rows = await EnrolledCourse.find({
    user_id: req.user.id,
    status: { $in: ["active", "completed"] },
  })
    .populate("course_id")
    .sort({ enrolled_at: -1 });
  res.json(rows);
});

const enroll = asyncHandler(async (req, res) => {
  const { course_id } = req.body;
  if (!course_id) return res.status(400).json({ message: "course_id is required" });
  const course = await Course.findById(course_id);
  if (!course) return res.status(404).json({ message: "Course not found" });
  if (course.isPremium && !(await isVipUser(req.user.id))) {
    return res.status(403).json({ message: "This course is for VIP members only." });
  }

  const today = toDateKey(new Date());
  const existing = await EnrolledCourse.findOne({ user_id: req.user.id, course_id });
  if (existing) {
    if (existing.status === "active") {
      return res.status(409).json({
        message: "You are already enrolled in this course.",
        status: existing.status,
      });
    }

    // Allow re-enroll when previous enrollment is cancelled or completed.
    if (existing.status === "completed" || existing.status === "cancelled") {
      existing.status = "active";
      existing.is_completed = false;
      existing.start_date = today;
      existing.current_day = 1;
      await existing.save();
      await CourseDailyProgress.deleteMany({ user_id: req.user.id, enrolled_course_id: existing._id });
      await ScheduleSkip.deleteMany({ userId: req.user.id, courseId: course_id });
      return res.json(existing);
    }
  }

  const row = await EnrolledCourse.create({
    user_id: req.user.id,
    course_id,
    enrolled_at: new Date(),
    start_date: today,
    current_day: 1,
    is_completed: false,
    status: "active",
  });
  res.status(201).json(row);
});

const drop = asyncHandler(async (req, res) => {
  const { course_id } = req.body;
  if (!course_id) return res.status(400).json({ message: "course_id is required" });
  const row = await EnrolledCourse.findOne({ user_id: req.user.id, course_id });
  if (!row) return res.json({ ok: true, changed: false });
  const today = toDateKey(new Date());

  await Promise.all([
    ScheduleItem.deleteMany({
      userId: req.user.id,
      courseId: course_id,
      date: { $gte: today },
      is_completed: { $ne: true },
    }),
    CourseDailyProgress.deleteMany({
      user_id: req.user.id,
      enrolled_course_id: row._id,
      date: { $gte: today },
      is_completed: { $ne: true },
    }),
    ScheduleSkip.deleteMany({
      userId: req.user.id,
      courseId: course_id,
      date: { $gte: today },
    }),
  ]);

  if (row.status !== "cancelled") {
    row.status = "cancelled";
    row.is_completed = false;
    row.current_day = 1;
    await row.save();
  }
  res.json({ ok: true, changed: true, cleanedFuture: true });
});

const updateProgress = asyncHandler(async (req, res) => {
  const { enrolled_course_id, date, is_completed, exercise_id, exercise_status } = req.body;
  if (!enrolled_course_id) {
    return res.status(400).json({ message: "enrolled_course_id is required" });
  }
  const enrolled = await EnrolledCourse.findOne({ _id: enrolled_course_id, user_id: req.user.id });
  if (!enrolled) return res.status(404).json({ message: "Enrolled course not found" });

  const targetDate = date || toDateKey(new Date());
  const enrolledWithCourse = await EnrolledCourse.findById(enrolled._id).populate("course_id", "duration_days duration title category");
  if (!enrolledWithCourse?.course_id) {
    return res.status(404).json({ message: "Course not found" });
  }
  const diffDays =
    Math.floor((new Date(`${targetDate}T00:00:00`) - new Date(`${enrolled.start_date}T00:00:00`)) / 86400000) + 1;
  const dayIndex = Math.max(1, diffDays);
  const userLean = await User.findById(req.user.id).select("weight").lean();
  const wkg = userLean?.weight;
  const courseCat = String(enrolledWithCourse?.course_id?.category || "");
  let row = await CourseDailyProgress.findOne({ user_id: req.user.id, enrolled_course_id, date: targetDate });
  if (!row) {
    row = await CourseDailyProgress.create({
      user_id: req.user.id,
      enrolled_course_id,
      date: targetDate,
      status: "not_started",
      exercises: buildCourseExercises(enrolledWithCourse.course_id, dayIndex, wkg),
      is_completed: false,
      completed_at: null,
    });
  } else if (!Array.isArray(row.exercises) || !row.exercises.length) {
    row.exercises = buildCourseExercises(enrolledWithCourse.course_id, dayIndex, wkg);
  }

  const wasCompletedBefore = Boolean(row.is_completed);
  if (exercise_id) {
    const nextStatus = ["not_started", "in_progress", "completed"].includes(String(exercise_status || ""))
      ? String(exercise_status)
      : null;
    if (!nextStatus) {
      return res.status(400).json({ message: "exercise_status must be not_started, in_progress, or completed" });
    }
    const targetExercise = row.exercises.find((item) => String(item.exercise_id) === String(exercise_id));
    if (!targetExercise) {
      return res.status(404).json({ message: "Course exercise not found" });
    }
    targetExercise.status = nextStatus;
    const summary = summarizeCourseExercises(row.exercises);
    row.status = summary.status;
    row.is_completed = summary.status === "completed";
    row.completed_at = row.is_completed ? new Date() : null;
  } else if (typeof is_completed === "boolean") {
    row.exercises = row.exercises.map((item) => {
      const base = typeof item.toObject === "function" ? item.toObject() : { ...item };
      return {
        ...base,
        status: is_completed ? "completed" : "not_started",
      };
    });
    row.status = is_completed ? "completed" : "not_started";
    row.is_completed = is_completed;
    row.completed_at = is_completed ? new Date() : null;
  } else {
    return res.status(400).json({ message: "Provide exercise update or is_completed" });
  }

  const plainExercises = row.exercises.map((item) => (typeof item.toObject === "function" ? item.toObject() : { ...item }));
  row.exercises = applyMetBurnsToExercises(plainExercises, courseCat, wkg);
  if (typeof row.markModified === "function") row.markModified("exercises");

  await row.save();

  const targetDays = Number(enrolledWithCourse?.course_id?.duration_days || 7);
  const doneCount = await CourseDailyProgress.countDocuments({ enrolled_course_id: enrolled._id, is_completed: true });
  const finished = doneCount >= targetDays;

  await EnrolledCourse.findByIdAndUpdate(enrolled._id, {
    $set: {
      current_day: Math.min(targetDays, doneCount + 1),
      is_completed: finished,
      status: finished ? "completed" : "active",
    },
  });

  await ScheduleItem.updateMany(
    {
      userId: req.user.id,
      courseId: enrolled.course_id,
      date: targetDate,
    },
    {
      $set: {
        is_completed: row.is_completed,
        completed_at: row.is_completed ? new Date() : null,
        itemType: "course",
      },
    }
  );

  if (row.is_completed && !wasCompletedBefore) {
    await Workout.create({
      userId: req.user.id,
      type: enrolledWithCourse?.course_id?.title || "Course",
      duration: Number(enrolledWithCourse?.course_id?.duration || 30),
      caloriesBurned: summarizeCourseExercises(row.exercises).burned_so_far || 0,
      date: new Date(`${targetDate}T00:00:00`),
      note: "Completed from course task",
    });
  }

  res.json(row);
});

module.exports = { list, create, detail, listEnrolled, enroll, drop, updateProgress };

