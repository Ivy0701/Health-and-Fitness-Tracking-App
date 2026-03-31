const mongoose = require("mongoose");
const asyncHandler = require("../../utils/asyncHandler");
const ScheduleItem = require("../../models/ScheduleItem");

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await ScheduleItem.find({ userId }).sort({ date: 1, time: 1, createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { userId, title, date, time, note, courseId, durationMinutes, overlapAccepted } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!title || !date || !time) return res.status(400).json({ message: "title, date and time are required" });
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

