const asyncHandler = require("../../utils/asyncHandler");
const User = require("../../models/User");

const status = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findById(userId).select("isVip vipSince vipPlan").lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

const upgrade = asyncHandler(async (req, res) => {
  const { userId, vipPlan } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findByIdAndUpdate(
    uid,
    { $set: { isVip: true, vipSince: new Date(), vipPlan: vipPlan || "monthly" } },
    { new: true }
  ).select("isVip vipSince vipPlan");
  res.json(user);
});

module.exports = { status, upgrade };

