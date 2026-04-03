const asyncHandler = require("../../utils/asyncHandler");
const WorkoutPlan = require("../../models/WorkoutPlan");
const WorkoutDailyStatus = require("../../models/WorkoutDailyStatus");
const User = require("../../models/User");
const EnrolledCourse = require("../../models/EnrolledCourse");
const CourseDailyProgress = require("../../models/CourseDailyProgress");

function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidDateKey(dateKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""));
}

function isPlanActiveOnDate(plan, targetDateKey) {
  const startDateKey = toDateKey(new Date(plan.created_at || new Date()));
  const dayCount = Number(plan.days) || 0;
  if (dayCount <= 0) return false;
  const day = diffInDaysInclusive(startDateKey, parseDateKey(targetDateKey));
  return day >= 1 && day <= dayCount;
}

function parseDateKey(dateKey) {
  return new Date(`${dateKey}T00:00:00`);
}

function diffInDaysInclusive(startDateKey, now = new Date()) {
  const start = parseDateKey(startDateKey);
  const today = parseDateKey(toDateKey(now));
  const diff = Math.floor((today - start) / 86400000);
  return diff + 1;
}

const listPlans = asyncHandler(async (req, res) => {
  const rows = await WorkoutPlan.find({ user_id: req.user.id }).sort({ created_at: -1 });
  res.json(rows);
});

const getTaskDetail = asyncHandler(async (req, res) => {
  const row = await WorkoutPlan.findOne({ _id: req.params.id, user_id: req.user.id });
  if (!row) return res.status(404).json({ message: "Workout task not found" });
  res.json(row);
});

const createPlan = asyncHandler(async (req, res) => {
  const { exerciseName, category, durationPerDay, days, isCustom } = req.body;
  if (!exerciseName || !category || !durationPerDay || !days) {
    return res.status(400).json({ message: "exerciseName, category, durationPerDay and days are required" });
  }
  if (Number(days) < 1 || Number(days) > 30) {
    return res.status(400).json({ message: "days must be between 1 and 30" });
  }

  const row = await WorkoutPlan.create({
    user_id: req.user.id,
    exercise_name: String(exerciseName).trim(),
    category: String(category).trim(),
    duration_per_day: Number(durationPerDay),
    days: Number(days),
    is_custom: Boolean(isCustom),
  });

  res.status(201).json(row);
});

const getTodayPlan = asyncHandler(async (req, res) => {
  const date = isValidDateKey(req.query.date) ? req.query.date : toDateKey(new Date());
  const targetDate = parseDateKey(date);
  const allPlans = await WorkoutPlan.find({ user_id: req.user.id }).sort({ created_at: -1 });
  const todayPlans = allPlans.filter((plan) => isPlanActiveOnDate(plan, date));
  const user = await User.findById(req.user.id).select("weight");
  const enrolledCourses = await EnrolledCourse.find({ user_id: req.user.id, status: "active" }).populate("course_id");

  const statuses = await WorkoutDailyStatus.find({
    user_id: req.user.id,
    date,
    workout_plan_id: { $in: todayPlans.map((p) => p._id) },
  });
  const statusMap = new Map(statuses.map((s) => [`${s.workout_plan_id}`, s]));

  const workoutTasks = todayPlans.map((plan) => {
    const progress = statusMap.get(`${plan._id}`);
    return {
      workout_plan_id: plan._id,
      exercise_name: plan.exercise_name,
      category: plan.category,
      duration_per_day: plan.duration_per_day,
      days: plan.days,
      is_custom: plan.is_custom,
      is_completed: Boolean(progress?.is_completed),
      remaining_seconds: Number.isFinite(Number(progress?.remaining_seconds))
        ? Number(progress?.remaining_seconds)
        : null,
      completed_at: progress?.completed_at || null,
    };
  });

  const rawCourseTasks = enrolledCourses
    .map((enrolled) => {
      const durationDays = Number(enrolled?.course_id?.duration_days) || 0;
      if (!enrolled.start_date || durationDays <= 0) return null;
      const day = diffInDaysInclusive(enrolled.start_date, targetDate);
      if (day > durationDays) return { markCompleted: true, enrolled };
      if (day < 1) return null;
      return {
        markCompleted: false,
        enrolled_course_id: enrolled._id,
        course_id: enrolled.course_id?._id,
        title: enrolled.course_id?.title || "Course",
        duration_days: durationDays,
        day,
      };
    })
    .filter(Boolean);

  const courseCompletions = rawCourseTasks.filter((row) => !row.markCompleted);
  const markDoneRows = rawCourseTasks.filter((row) => row.markCompleted).map((row) => row.enrolled._id);
  await Promise.all(
    courseCompletions.map((row) =>
      EnrolledCourse.updateOne(
        { _id: row.enrolled_course_id, user_id: req.user.id, status: "active" },
        { $set: { current_day: row.day } }
      )
    )
  );
  if (markDoneRows.length) {
    await EnrolledCourse.updateMany(
      { _id: { $in: markDoneRows }, user_id: req.user.id },
      { $set: { status: "completed", is_completed: true } }
    );
  }

  const courseProgressRows = await CourseDailyProgress.find({
    user_id: req.user.id,
    date,
    enrolled_course_id: { $in: courseCompletions.map((c) => c.enrolled_course_id) },
  });
  const courseProgressMap = new Map(courseProgressRows.map((x) => [`${x.enrolled_course_id}`, x]));
  const courseTasks = courseCompletions.map((item) => {
    const progress = courseProgressMap.get(`${item.enrolled_course_id}`);
    return {
      enrolled_course_id: item.enrolled_course_id,
      course_id: item.course_id,
      title: item.title,
      day: item.day,
      duration_days: item.duration_days,
      is_completed: Boolean(progress?.is_completed),
      completed_at: progress?.completed_at || null,
    };
  });

  const allTasks = [...workoutTasks, ...courseTasks];
  const hasAnyPlan = allPlans.length > 0;
  const hasAnyCourseEnrollment = enrolledCourses.length > 0 || markDoneRows.length > 0;
  const allCompleted = allTasks.length > 0 && allTasks.every((task) => task.is_completed);
  const status =
    allTasks.length === 0
      ? hasAnyPlan || hasAnyCourseEnrollment
        ? "No tasks"
        : "No tasks"
      : allCompleted
      ? "Completed"
      : "Incomplete";

  res.json({
    date,
    hasAnyPlan,
    hasAnyCourseEnrollment,
    weight: user?.weight ?? null,
    status,
    tasks: workoutTasks,
    workout_tasks: workoutTasks,
    course_tasks: courseTasks,
  });
});

const updateTodayStatus = asyncHandler(async (req, res) => {
  const { workout_plan_id, date, is_completed, remaining_seconds } = req.body;
  const normalizedDate = date || toDateKey(new Date());
  if (!workout_plan_id || typeof is_completed !== "boolean") {
    return res.status(400).json({ message: "workout_plan_id and is_completed are required" });
  }

  const plan = await WorkoutPlan.findOne({ _id: workout_plan_id, user_id: req.user.id });
  if (!plan) {
    return res.status(404).json({ message: "Workout plan not found" });
  }

  const parsedRemaining =
    remaining_seconds === null || typeof remaining_seconds === "undefined"
      ? null
      : Math.max(0, Math.floor(Number(remaining_seconds)));

  const updated = await WorkoutDailyStatus.findOneAndUpdate(
    {
      user_id: req.user.id,
      workout_plan_id,
      date: normalizedDate,
    },
    {
      $set: {
        is_completed,
        remaining_seconds: is_completed ? 0 : parsedRemaining,
        completed_at: is_completed ? new Date() : null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    id: updated._id,
    workout_plan_id: updated.workout_plan_id,
    date: updated.date,
    is_completed: updated.is_completed,
    remaining_seconds: updated.remaining_seconds,
    completed_at: updated.completed_at,
  });
});

module.exports = { listPlans, getTaskDetail, createPlan, getTodayPlan, updateTodayStatus };

