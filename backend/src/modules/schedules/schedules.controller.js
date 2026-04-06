const mongoose = require("mongoose");
const asyncHandler = require("../../utils/asyncHandler");
const ScheduleItem = require("../../models/ScheduleItem");
const Course = require("../../models/Course");
const User = require("../../models/User");

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

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await ScheduleItem.find({ userId })
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
  const { userId, title, date, time, note, courseId, durationMinutes, overlapAccepted } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!title || !date || !time) return res.status(400).json({ message: "title, date and time are required" });

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
    title,
    date,
    time,
    note,
    courseId: courseId || null,
    durationMinutes: durationMinutes != null ? Math.max(1, Number(durationMinutes)) : 60,
    overlapAccepted: Boolean(overlapAccepted),
  });
  res.status(201).json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await ScheduleItem.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Schedule item not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
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
    if (!it.title || !it.date || !it.time) {
      return res.status(400).json({ message: "Each item needs title, date, and time" });
    }
    docs.push({
      userId: uid,
      title: String(it.title).trim(),
      date: String(it.date).trim(),
      time: String(it.time).trim().slice(0, 5),
      note: it.note != null ? String(it.note) : "",
      courseId: it.courseId || null,
      durationMinutes: it.durationMinutes != null ? Math.max(1, Number(it.durationMinutes)) : 60,
      overlapAccepted: Boolean(it.overlapAccepted),
    });
  }
  const created = await ScheduleItem.insertMany(docs);
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

