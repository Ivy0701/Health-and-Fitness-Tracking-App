const asyncHandler = require("../../utils/asyncHandler");
const Favorite = require("../../models/Favorite");

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await Favorite.find({ userId }).sort({ createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { userId, itemType, itemId, title } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!itemType || !itemId) return res.status(400).json({ message: "itemType and itemId are required" });

  const row = await Favorite.findOneAndUpdate(
    { userId: uid, itemType, itemId },
    { $setOnInsert: { userId: uid, itemType, itemId, title } },
    { new: true, upsert: true }
  );
  res.status(201).json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await Favorite.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Favorite not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

module.exports = { list, create, remove };

