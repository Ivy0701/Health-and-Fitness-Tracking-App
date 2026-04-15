const asyncHandler = require("../../utils/asyncHandler");
const Favorite = require("../../models/Favorite");

function normalizeFavoriteType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "article") return "forum";
  return value;
}

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const rows = await Favorite.find({ userId }).sort({ createdAt: -1 }).lean();
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { userId, itemType, itemId, title, image, planType, targetCalories, description, metadata, sourceType } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!itemType || !itemId) return res.status(400).json({ message: "itemType and itemId are required" });
  const normalizedType = normalizeFavoriteType(itemType);

  const payload = {
    userId: uid,
    itemType: normalizedType,
    itemId: String(itemId),
    title: String(title || "").trim(),
    image: String(image || "").trim(),
    planType: String(planType || "").trim(),
    targetCalories: Number.isFinite(Number(targetCalories)) ? Number(targetCalories) : null,
    description: String(description || "").trim(),
    metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
    sourceType: String(sourceType || "").trim(),
  };

  const row = await Favorite.findOneAndUpdate(
    { userId: uid, itemType: payload.itemType, itemId: payload.itemId },
    { $setOnInsert: payload },
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

