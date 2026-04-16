const asyncHandler = require("../../utils/asyncHandler");
const WorkoutPlan = require("../../models/WorkoutPlan");
const WorkoutDailyStatus = require("../../models/WorkoutDailyStatus");
const User = require("../../models/User");
const EnrolledCourse = require("../../models/EnrolledCourse");
const CourseDailyProgress = require("../../models/CourseDailyProgress");
const ScheduleItem = require("../../models/ScheduleItem");
const ScheduleSkip = require("../../models/ScheduleSkip");
const Workout = require("../../models/Workout");
const { buildCourseExercises, summarizeCourseExercises } = require("../../utils/courseSession");

const MET_MAP = {
  running: 10,
  cycling: 8,
  swimming: 9,
  "jump rope": 11,
  walking: 4,
  walk: 4,
  hiit: 10,
  "weight lifting": 6,
  "push-up": 5,
  "pull-up": 6,
  squat: 6,
  deadlift: 7,
  yoga: 3,
  stretching: 2,
  pilates: 4,
  basketball: 8,
  football: 9,
  badminton: 7,
  tennis: 7,
};
const WORKOUT_TASK_STATUSES = new Set(["not_started", "in_progress", "paused", "completed", "missed", "scheduled"]);

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
  const startDateKey = toDateKey(new Date(plan.start_date || plan.created_at || new Date()));
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

function getMetForExerciseName(name) {
  const key = String(name || "").trim().toLowerCase();
  return MET_MAP[key] || 0;
}

function estimateWorkoutBurn({ exerciseName, durationMinutes, weight }) {
  const safeWeight = Number(weight);
  const safeDuration = Number(durationMinutes);
  if (!Number.isFinite(safeWeight) || safeWeight <= 0) return 0;
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) return 0;
  const met = getMetForExerciseName(exerciseName);
  if (!met) return 0;
  return Math.round(met * safeWeight * (safeDuration / 60));
}

function normalizeTaskStatus(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return WORKOUT_TASK_STATUSES.has(value) ? value : "";
}

function inferTaskStatusByDate({ dateKey, isCompleted, fallbackStatus }) {
  if (isCompleted) return "completed";
  const normalizedFallback = normalizeTaskStatus(fallbackStatus);
  if (normalizedFallback) return normalizedFallback;
  const today = toDateKey(new Date());
  if (dateKey > today) return "scheduled";
  if (dateKey < today) return "missed";
  return "not_started";
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
  const { exerciseName, category, durationPerDay, days, isCustom, startDate, fixedTime, note } = req.body;
  if (!exerciseName || !category || !durationPerDay || !days) {
    return res.status(400).json({ message: "exerciseName, category, durationPerDay and days are required" });
  }
  if (Number(days) < 1 || Number(days) > 30) {
    return res.status(400).json({ message: "days must be between 1 and 30" });
  }
  const normalizedStartDate = isValidDateKey(startDate) ? startDate : toDateKey(new Date());
  const normalizedFixedTime = String(fixedTime || "07:00").slice(0, 5);

  const row = await WorkoutPlan.create({
    user_id: req.user.id,
    exercise_name: String(exerciseName).trim(),
    category: String(category).trim(),
    duration_per_day: Number(durationPerDay),
    days: Number(days),
    is_custom: Boolean(isCustom),
    start_date: parseDateKey(normalizedStartDate),
    fixed_time: normalizedFixedTime,
    note: String(note || ""),
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
  const activeCourseIds = enrolledCourses
    .map((enrolled) => String(enrolled?.course_id?._id || enrolled?.course_id || ""))
    .filter(Boolean);
  const skips = await ScheduleSkip.find({
    userId: req.user.id,
    date,
    $or: [
      { planId: { $in: todayPlans.map((plan) => plan._id) } },
      { courseId: { $in: activeCourseIds } },
    ],
  })
    .select("planId courseId")
    .lean();
  const skippedPlanIds = new Set(skips.map((it) => String(it?.planId || "")).filter(Boolean));
  const skippedCourseIds = new Set(skips.map((it) => String(it?.courseId || "")).filter(Boolean));
  const todayPlanIdSet = new Set(todayPlans.map((plan) => String(plan._id)));

  let scheduleWorkoutItems = await ScheduleItem.find({
    userId: req.user.id,
    date,
    itemType: "workout",
  })
    .select("title subtitle category durationMinutes itemType is_completed completed_at planId time")
    .sort({ time: 1, createdAt: -1 })
    .lean();

  const missingPlanScheduleDocs = [];
  for (const plan of todayPlans) {
    const pid = String(plan._id);
    if (skippedPlanIds.has(pid)) continue;
    const linked = scheduleWorkoutItems.find((it) => String(it?.planId || "") === pid);
    if (linked) continue;
    missingPlanScheduleDocs.push({
      userId: req.user.id,
      itemType: "workout",
      title: String(plan.exercise_name || "Workout"),
      subtitle: "Plan Session",
      category: String(plan.category || "Plan"),
      planId: plan._id,
      date,
      time: String(plan.fixed_time || "07:00").slice(0, 5),
      note: String(plan.note || ""),
      durationMinutes: Number(plan.duration_per_day || 30),
      overlapAccepted: true,
      is_completed: false,
      completed_at: null,
    });
  }
  if (missingPlanScheduleDocs.length) {
    await ScheduleItem.insertMany(missingPlanScheduleDocs);
    scheduleWorkoutItems = await ScheduleItem.find({
      userId: req.user.id,
      date,
      itemType: "workout",
    })
      .select("title subtitle category durationMinutes itemType is_completed completed_at planId time")
      .sort({ time: 1, createdAt: -1 })
      .lean();
  }

  const statuses = await WorkoutDailyStatus.find({
    user_id: req.user.id,
    date,
    workout_plan_id: { $in: todayPlans.map((p) => p._id) },
  });
  const statusMap = new Map(statuses.map((s) => [`${s.workout_plan_id}`, s]));

  const workoutTasks = todayPlans
    .filter((plan) => !skippedPlanIds.has(String(plan._id)))
    .map((plan) => {
    const linkedItem =
      scheduleWorkoutItems.find((it) => String(it?.planId || "") === String(plan._id)) ||
      scheduleWorkoutItems.find((it) => String(it?.title || "").trim() === String(plan.exercise_name || "").trim());
    const progress = statusMap.get(`${plan._id}`);
    const completed = Boolean(progress?.is_completed ?? linkedItem?.is_completed);
    const taskStatus = inferTaskStatusByDate({
      dateKey: date,
      isCompleted: completed,
      fallbackStatus: progress?.status,
    });
    return {
      schedule_item_id: linkedItem?._id || null,
      workout_plan_id: plan._id,
      exercise_name: linkedItem?.title || plan.exercise_name,
      category: linkedItem?.category || plan.category,
      duration_per_day: Number(linkedItem?.durationMinutes || plan.duration_per_day),
      days: plan.days,
      is_custom: plan.is_custom,
      date,
      is_completed: completed,
      task_status: taskStatus,
      remaining_seconds: Number.isFinite(Number(progress?.remaining_seconds))
        ? Number(progress?.remaining_seconds)
        : null,
      completed_at: progress?.completed_at || linkedItem?.completed_at || null,
    };
    });

  const manualWorkoutTasks = scheduleWorkoutItems
    .filter((item) => !item?.planId || !todayPlanIdSet.has(String(item?.planId || "")))
    .map((item) => ({
    schedule_item_id: item._id,
    workout_plan_id: null,
    exercise_name: item.title || "Manual Workout",
    category: item.category || "Manual",
    duration_per_day: Number(item.durationMinutes) || 30,
    days: 1,
    is_custom: true,
    source_type: "manual_schedule",
    source_label: item.itemType === "course" ? "Course Session" : "Manual",
    date,
    subtitle: item.subtitle || "",
    is_completed: Boolean(item.is_completed),
    task_status: inferTaskStatusByDate({
      dateKey: date,
      isCompleted: Boolean(item.is_completed),
    }),
    remaining_seconds: null,
    completed_at: item.completed_at || null,
  }));

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
        duration_minutes: Number(enrolled.course_id?.duration || 30),
        time:
          enrolled.course_id?.weeklySlots?.find((slot) => Number(slot?.weekday) === targetDate.getDay())?.startTime ||
          "08:00",
        day,
      };
    })
    .filter(Boolean)
    .filter((item) => {
      if (!item?.course_id) return true;
      return !skippedCourseIds.has(String(item.course_id));
    });

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

  const progressRows = await Promise.all(
    courseCompletions.map(async (item) => {
      const existing = await CourseDailyProgress.findOneAndUpdate(
        { user_id: req.user.id, date, enrolled_course_id: item.enrolled_course_id },
        {
          $setOnInsert: {
            status: "not_started",
            exercises: buildCourseExercises(
              {
                title: item.title,
                duration: item.duration_minutes,
                category: enrolledCourses.find((row) => String(row._id) === String(item.enrolled_course_id))?.course_id?.category || "",
              },
              item.day
            ),
            is_completed: false,
            completed_at: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (Array.isArray(existing?.exercises) && existing.exercises.length) return existing;
      existing.exercises = buildCourseExercises(
        {
          title: item.title,
          duration: item.duration_minutes,
          category: enrolledCourses.find((row) => String(row._id) === String(item.enrolled_course_id))?.course_id?.category || "",
        },
        item.day
      );
      const summary = summarizeCourseExercises(existing.exercises);
      existing.status = summary.status;
      existing.is_completed = summary.status === "completed";
      existing.completed_at = existing.is_completed ? existing.completed_at || new Date() : null;
      await existing.save();
      return existing;
    })
  );
  const courseProgressMap = new Map(progressRows.map((x) => [`${x.enrolled_course_id}`, x]));
  let scheduleCourseItems = await ScheduleItem.find({
    userId: req.user.id,
    date,
    itemType: "course",
    courseId: { $in: courseCompletions.map((c) => c.course_id).filter(Boolean) },
  })
    .select("courseId title durationMinutes is_completed completed_at time")
    .sort({ time: 1, createdAt: -1 })
    .lean();

  const missingCourseDocs = courseCompletions
    .filter((item) => !scheduleCourseItems.some((s) => String(s?.courseId || "") === String(item.course_id || "")))
    .map((item) => ({
      userId: req.user.id,
      itemType: "course",
      title: item.title,
      subtitle: `Plan Day ${item.day}`,
      category: "Course",
      date,
      time: String(item.time || "08:00").slice(0, 5),
      note: "",
      courseId: item.course_id || null,
      durationMinutes: Number(item.duration_minutes || 30),
      overlapAccepted: true,
      is_completed: false,
      completed_at: null,
    }));
  if (missingCourseDocs.length) {
    await ScheduleItem.insertMany(missingCourseDocs);
    scheduleCourseItems = await ScheduleItem.find({
      userId: req.user.id,
      date,
      itemType: "course",
      courseId: { $in: courseCompletions.map((c) => c.course_id).filter(Boolean) },
    })
      .select("courseId title durationMinutes is_completed completed_at time")
      .sort({ time: 1, createdAt: -1 })
      .lean();
  }

  const courseTasks = courseCompletions.map((item) => {
    const linkedItem =
      scheduleCourseItems.find((s) => String(s?.courseId || "") === String(item.course_id || "")) || null;
    const progress = courseProgressMap.get(`${item.enrolled_course_id}`);
    return {
      schedule_item_id: linkedItem?._id || null,
      enrolled_course_id: item.enrolled_course_id,
      course_id: item.course_id,
      title: linkedItem?.title || item.title,
      date,
      day: item.day,
      duration_days: item.duration_days,
      duration_per_day: item.duration_minutes,
      exercises: Array.isArray(progress?.exercises) ? progress.exercises : [],
      status: progress?.status || (progress?.is_completed ? "completed" : "not_started"),
      total_exercises: summarizeCourseExercises(progress?.exercises || []).total_exercises,
      completed_exercises: summarizeCourseExercises(progress?.exercises || []).completed_exercises,
      estimated_burn: summarizeCourseExercises(progress?.exercises || []).estimated_burn,
      burned_so_far: summarizeCourseExercises(progress?.exercises || []).burned_so_far,
      is_completed: Boolean(progress?.is_completed ?? linkedItem?.is_completed),
      completed_at: progress?.completed_at || linkedItem?.completed_at || null,
    };
  });

  const allWorkoutTasks = [...workoutTasks, ...manualWorkoutTasks];
  const allTasks = [...allWorkoutTasks, ...courseTasks];
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
    tasks: allWorkoutTasks,
    workout_tasks: allWorkoutTasks,
    course_tasks: courseTasks,
  });
});

const updateTodayStatus = asyncHandler(async (req, res) => {
  const { workout_plan_id, schedule_item_id, date, is_completed, remaining_seconds, task_status } = req.body;
  const normalizedDate = date || toDateKey(new Date());
  if ((!workout_plan_id && !schedule_item_id) || typeof is_completed !== "boolean") {
    return res.status(400).json({ message: "workout_plan_id or schedule_item_id and is_completed are required" });
  }
  const normalizedTaskStatus = normalizeTaskStatus(task_status);
  if (task_status != null && !normalizedTaskStatus) {
    return res.status(400).json({
      message: "task_status must be one of not_started, in_progress, paused, completed, missed, scheduled",
    });
  }
  const resolvedStatus = inferTaskStatusByDate({
    dateKey: normalizedDate,
    isCompleted: Boolean(is_completed),
    fallbackStatus: normalizedTaskStatus,
  });
  const parsedRemaining =
    remaining_seconds === null || typeof remaining_seconds === "undefined"
      ? null
      : Math.max(0, Math.floor(Number(remaining_seconds)));

  if (schedule_item_id) {
    const scheduleItem = await ScheduleItem.findOne({
      _id: schedule_item_id,
      userId: req.user.id,
      date: normalizedDate,
      itemType: { $in: ["workout", "course"] },
    });
    if (!scheduleItem) return res.status(404).json({ message: "Schedule workout task not found" });
    const becameCompleted = is_completed && !scheduleItem.is_completed;
    scheduleItem.is_completed = is_completed;
    scheduleItem.completed_at = is_completed ? new Date() : null;
    await scheduleItem.save();
    if (scheduleItem.planId) {
      await WorkoutDailyStatus.findOneAndUpdate(
        {
          user_id: req.user.id,
          workout_plan_id: scheduleItem.planId,
          date: normalizedDate,
        },
        {
          $set: {
            is_completed: Boolean(is_completed),
            status: resolvedStatus,
            remaining_seconds: is_completed ? 0 : parsedRemaining,
            completed_at: is_completed ? new Date() : null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    if (becameCompleted) {
      const user = await User.findById(req.user.id).select("weight").lean();
      await Workout.create({
        userId: req.user.id,
        type: scheduleItem.title || "Workout",
        duration: Number(scheduleItem.durationMinutes || 30),
        caloriesBurned: estimateWorkoutBurn({
          exerciseName: scheduleItem.title || "Workout",
          durationMinutes: Number(scheduleItem.durationMinutes || 30),
          weight: user?.weight,
        }),
        date: new Date(`${normalizedDate}T00:00:00`),
        note: "Completed from workout task",
      });
    }
    return res.json({
      id: scheduleItem._id,
      schedule_item_id: scheduleItem._id,
      date: scheduleItem.date,
      is_completed: scheduleItem.is_completed,
      task_status: resolvedStatus,
      remaining_seconds: is_completed ? 0 : parsedRemaining,
      completed_at: scheduleItem.completed_at,
    });
  }

  const plan = await WorkoutPlan.findOne({ _id: workout_plan_id, user_id: req.user.id });
  if (!plan) {
    return res.status(404).json({ message: "Workout plan not found" });
  }

  const previous = await WorkoutDailyStatus.findOne({
    user_id: req.user.id,
    workout_plan_id,
    date: normalizedDate,
  })
    .select("is_completed status")
    .lean();
  const becameCompleted = is_completed && !previous?.is_completed;
  const updated = await WorkoutDailyStatus.findOneAndUpdate(
    {
      user_id: req.user.id,
      workout_plan_id,
      date: normalizedDate,
    },
    {
      $set: {
        is_completed,
        status: resolvedStatus,
        remaining_seconds: is_completed ? 0 : parsedRemaining,
        completed_at: is_completed ? new Date() : null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await ScheduleItem.updateMany(
    {
      userId: req.user.id,
      itemType: "workout",
      planId: workout_plan_id,
      date: normalizedDate,
    },
    {
      $set: {
        is_completed,
        completed_at: is_completed ? new Date() : null,
      },
    }
  );
  if (becameCompleted) {
    const user = await User.findById(req.user.id).select("weight").lean();
    await Workout.create({
      userId: req.user.id,
      type: plan.exercise_name || "Workout",
      duration: Number(plan.duration_per_day || 30),
      caloriesBurned: estimateWorkoutBurn({
        exerciseName: plan.exercise_name || "Workout",
        durationMinutes: Number(plan.duration_per_day || 30),
        weight: user?.weight,
      }),
      date: new Date(`${normalizedDate}T00:00:00`),
      note: "Completed from plan task",
    });
  }

  res.json({
    id: updated._id,
    workout_plan_id: updated.workout_plan_id,
    date: updated.date,
    is_completed: updated.is_completed,
    task_status: updated.status || resolvedStatus,
    remaining_seconds: updated.remaining_seconds,
    completed_at: updated.completed_at,
  });
});

const stopPlan = asyncHandler(async (req, res) => {
  const plan = await WorkoutPlan.findOne({ _id: req.params.id, user_id: req.user.id });
  if (!plan) return res.status(404).json({ message: "Workout plan not found" });

  const today = toDateKey(new Date());
  await Promise.all([
    ScheduleItem.deleteMany({
      userId: req.user.id,
      itemType: "workout",
      date: { $gte: today },
      is_completed: { $ne: true },
      $or: [
        { planId: plan._id },
        { title: String(plan.exercise_name || "").trim() },
      ],
    }),
    WorkoutDailyStatus.deleteMany({
      user_id: req.user.id,
      workout_plan_id: plan._id,
      date: { $gte: today },
      is_completed: { $ne: true },
    }),
  ]);

  await plan.deleteOne();
  res.json({ ok: true, removed_plan_id: plan._id });
});

module.exports = { listPlans, getTaskDetail, createPlan, getTodayPlan, updateTodayStatus, stopPlan };

