const asyncHandler = require("../../utils/asyncHandler");
const Workout = require("../../models/Workout");

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await Workout.find({ userId }).sort({ date: -1, createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { userId, type, duration, caloriesBurned, date, note } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!type || !duration) return res.status(400).json({ message: "type and duration are required" });
  const row = await Workout.create({ userId: uid, type, duration, caloriesBurned, date, note });
  res.status(201).json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await Workout.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Workout not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

module.exports = { list, create, remove };

