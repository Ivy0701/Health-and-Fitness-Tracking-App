const asyncHandler = require("../../utils/asyncHandler");
const ScheduleItem = require("../../models/ScheduleItem");

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await ScheduleItem.find({ userId }).sort({ date: 1, time: 1, createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { userId, title, date, time, note } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!title || !date || !time) return res.status(400).json({ message: "title, date and time are required" });
  const row = await ScheduleItem.create({ userId: uid, title, date, time, note });
  res.status(201).json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await ScheduleItem.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Schedule item not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

module.exports = { list, create, remove };

