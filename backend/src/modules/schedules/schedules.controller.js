const mongoose = require("mongoose");
const asyncHandler = require("../../utils/asyncHandler");
const ScheduleItem = require("../../models/ScheduleItem");
const ScheduleSkip = require("../../models/ScheduleSkip");
const Course = require("../../models/Course");
const User = require("../../models/User");
const WorkoutDailyStatus = require("../../models/WorkoutDailyStatus");
const WorkoutPlan = require("../../models/WorkoutPlan");
const EnrolledCourse = require("../../models/EnrolledCourse");
const CourseDailyProgress = require("../../models/CourseDailyProgress");

async function isVipUser(userId) {
  const u = await User.findById(userId).select("vip_status isVip").lean();
  return Boolean(u?.vip_status ?? u?.isVip);
}

async function assertNotJoiningPremiumCourse({ userId, courseIds }) {
  if (!courseIds?.length) return;
  const vip = await isVipUser(userId);
  if (vip) return;

  const rows = await Course.find({ _id: { $in: courseIds } }).select("title isPremium").lean();
  const premiumTitles = rows.filter((c) => c.isPremium).map((c) => c.title);
  if (premiumTitles.length) {
    return { ok: false, premiumTitles };
  }
  return { ok: true };
}

function normalizeItemType(value) {
  const key = String(value || "manual").trim().toLowerCase();
  if (["workout", "exercise"].includes(key)) return "workout";
  if (["course", "course_session"].includes(key)) return "course";
  if (["diet"].includes(key)) return "diet";
  if (["reminder", "personal"].includes(key)) return "reminder";
  return "manual";
}

function isPlanBackedItem(row) {
  const itemType = String(row?.itemType || "").toLowerCase();
  return Boolean(row?.planId) || Boolean(row?.courseId) || itemType === "course" || itemType === "course_session";
}

async function removeSingleItemAndLinkedState({ row, userId }) {
  await row.deleteOne();

  if (row.planId) {
    await WorkoutDailyStatus.deleteMany({
      user_id: userId,
      workout_plan_id: row.planId,
      date: row.date,
      is_completed: { $ne: true },
    });
    await ScheduleSkip.updateOne(
      { userId, date: row.date, planId: row.planId },
      { $setOnInsert: { userId, date: row.date, planId: row.planId } },
      { upsert: true }
    );
  }

  if (row.courseId) {
    const activeEnrollment = await EnrolledCourse.findOne({
      user_id: userId,
      course_id: row.courseId,
      status: "active",
    }).select("_id");
    if (activeEnrollment?._id) {
      await CourseDailyProgress.deleteMany({
        user_id: userId,
        enrolled_course_id: activeEnrollment._id,
        date: row.date,
        is_completed: { $ne: true },
      });
    }
    await ScheduleSkip.updateOne(
      { userId, date: row.date, courseId: row.courseId },
      { $setOnInsert: { userId, date: row.date, courseId: row.courseId } },
      { upsert: true }
    );
  }
}

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await ScheduleItem.find({ userId, itemType: { $ne: "diet" } })
    .populate("courseId", "isPremium")
    .sort({ date: 1, time: 1, createdAt: -1 })
    .lean();
  const out = rows.map((row) => {
    const pop = row.courseId;
    const courseIsPremium = Boolean(pop && typeof pop === "object" && pop.isPremium);
    const courseId =
      pop && typeof pop === "object" && pop._id != null
        ? String(pop._id)
        : row.courseId != null
          ? String(row.courseId)
          : null;
    return { ...row, courseId, courseIsPremium };
  });
  res.json(out);
});

const create = asyncHandler(async (req, res) => {
  const { userId, title, planName, taskName, date, time, note, courseId, planId, durationMinutes, overlapAccepted, itemType, subtitle, category } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const resolvedTitle = String(title || planName || taskName || "").trim();
  if (!resolvedTitle || !date || !time) return res.status(400).json({ message: "title, date and time are required" });

  if (courseId && mongoose.isValidObjectId(courseId)) {
    const r = await assertNotJoiningPremiumCourse({ userId: uid, courseIds: [courseId] });
    if (r && r.ok === false) {
      return res.status(403).json({
        message: "This content is for VIP members only",
        premiumCourses: r.premiumTitles,
      });
    }
  }

  const row = await ScheduleItem.create({
    userId: uid,
    itemType: normalizeItemType(itemType),
    category: category != null ? String(category).trim() : "",
    title: resolvedTitle,
    subtitle: subtitle != null ? String(subtitle).trim() : "",
    planId: planId || null,
    date,
    time,
    note,
    courseId: courseId || null,
    durationMinutes: durationMinutes != null ? Math.max(1, Number(durationMinutes)) : 60,
    overlapAccepted: Boolean(overlapAccepted),
  });
  if (row.planId || row.courseId) {
    const or = [];
    if (row.planId) or.push({ planId: row.planId });
    if (row.courseId) or.push({ courseId: row.courseId });
    await ScheduleSkip.deleteMany({
      userId: uid,
      date: row.date,
      ...(or.length ? { $or: or } : {}),
    });
  }
  res.status(201).json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await ScheduleItem.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Schedule item not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const scope = String(req.query.scope || "single").trim().toLowerCase();
  if (!["single", "future"].includes(scope)) {
    return res.status(400).json({ message: "Invalid scope. Use single or future." });
  }

  const isPlanItem = isPlanBackedItem(row);
  if (!isPlanItem || scope === "single") {
    await removeSingleItemAndLinkedState({ row, userId: req.user.id });
    return res.json({ success: true, scope: "single" });
  }

  const fromDate = String(row.date || "").trim();
  const baseFilter = {
    userId: req.user.id,
    date: { $gte: fromDate },
    is_completed: { $ne: true },
  };

  if (row.planId) {
    const deletedSchedules = await ScheduleItem.deleteMany({
      ...baseFilter,
      planId: row.planId,
    });
    const deletedStatuses = await WorkoutDailyStatus.deleteMany({
      user_id: req.user.id,
      workout_plan_id: row.planId,
      date: { $gte: fromDate },
      is_completed: { $ne: true },
    });
    await ScheduleSkip.deleteMany({
      userId: req.user.id,
      planId: row.planId,
      date: { $gte: fromDate },
    });

    const remainingFuturePending = await ScheduleItem.exists({
      userId: req.user.id,
      planId: row.planId,
      date: { $gte: fromDate },
      is_completed: { $ne: true },
    });
    if (!remainingFuturePending) {
      await WorkoutPlan.deleteOne({ _id: row.planId, user_id: req.user.id });
    }
    return res.json({
      success: true,
      scope: "future",
      deletedSchedules: deletedSchedules.deletedCount || 0,
      deletedWorkoutTasks: deletedStatuses.deletedCount || 0,
    });
  }

  const courseId = row.courseId || null;
  if (courseId) {
    const deletedSchedules = await ScheduleItem.deleteMany({
      ...baseFilter,
      courseId,
    });
    await ScheduleSkip.deleteMany({
      userId: req.user.id,
      courseId,
      date: { $gte: fromDate },
    });

    const activeEnrollment = await EnrolledCourse.findOne({
      user_id: req.user.id,
      course_id: courseId,
      status: "active",
    });
    let deletedCourseProgress = 0;
    if (activeEnrollment?._id) {
      const progressDeleted = await CourseDailyProgress.deleteMany({
        user_id: req.user.id,
        enrolled_course_id: activeEnrollment._id,
        date: { $gte: fromDate },
        is_completed: { $ne: true },
      });
      deletedCourseProgress = progressDeleted.deletedCount || 0;
      activeEnrollment.status = "cancelled";
      activeEnrollment.is_completed = false;
      await activeEnrollment.save();
    }

    return res.json({
      success: true,
      scope: "future",
      deletedSchedules: deletedSchedules.deletedCount || 0,
      deletedWorkoutTasks: deletedCourseProgress,
    });
  }

  await removeSingleItemAndLinkedState({ row, userId: req.user.id });
  res.json({ success: true, scope: "single" });
});

const batchCreate = asyncHandler(async (req, res) => {
  const { userId, items } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }
  const LIMIT = 400;
  const slice = items.slice(0, LIMIT);

  const courseIds = Array.from(
    new Set(
      slice
        .map((x) => x?.courseId)
        .filter((id) => id && mongoose.isValidObjectId(id))
        .map(String)
    )
  );
  const r = await assertNotJoiningPremiumCourse({ userId: uid, courseIds });
  if (r && r.ok === false) {
    return res.status(403).json({
      message: "This content is for VIP members only",
      premiumCourses: r.premiumTitles,
    });
  }

  const docs = [];
  for (const it of slice) {
    const resolvedTitle = String(it.title || it.planName || it.taskName || "").trim();
    if (!resolvedTitle || !it.date || !it.time) {
      return res.status(400).json({ message: "Each item needs title, date, and time" });
    }
    docs.push({
      userId: uid,
      itemType: normalizeItemType(it.itemType),
      category: it.category != null ? String(it.category).trim() : "",
      title: resolvedTitle,
      subtitle: it.subtitle != null ? String(it.subtitle).trim() : "",
      planId: it.planId || null,
      date: String(it.date).trim(),
      time: String(it.time).trim().slice(0, 5),
      note: it.note != null ? String(it.note) : "",
      courseId: it.courseId || null,
      durationMinutes: it.durationMinutes != null ? Math.max(1, Number(it.durationMinutes)) : 60,
      overlapAccepted: Boolean(it.overlapAccepted),
    });
  }
  const created = await ScheduleItem.insertMany(docs);
  await Promise.all(
    created.map((row) => {
      if (!row.planId && !row.courseId) return null;
      const or = [];
      if (row.planId) or.push({ planId: row.planId });
      if (row.courseId) or.push({ courseId: row.courseId });
      return ScheduleSkip.deleteMany({
        userId: uid,
        date: row.date,
        ...(or.length ? { $or: or } : {}),
      });
    })
  );
  res.status(201).json(created);
});

const removeByCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  if (!mongoose.isValidObjectId(courseId)) {
    return res.status(400).json({ message: "Invalid course id" });
  }
  const r = await ScheduleItem.deleteMany({ userId: req.user.id, courseId });
  res.json({ deleted: r.deletedCount });
});

module.exports = { list, create, remove, batchCreate, removeByCourse };

