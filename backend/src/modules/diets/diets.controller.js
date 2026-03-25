const asyncHandler = require("../../utils/asyncHandler");
const Diet = require("../../models/Diet");

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await Diet.find({ userId }).sort({ date: -1, createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { userId, foodName, calories, mealType, date, note } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!foodName) return res.status(400).json({ message: "foodName is required" });
  const row = await Diet.create({ userId: uid, foodName, calories, mealType, date, note });
  res.status(201).json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await Diet.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Diet record not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

module.exports = { list, create, remove };

