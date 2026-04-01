const asyncHandler = require("../../utils/asyncHandler");
const User = require("../../models/User");

function calcVipEndDate(vipSince, vipPlan) {
  if (!vipSince || !vipPlan || vipPlan === "none") return null;
  const base = new Date(vipSince);
  if (Number.isNaN(base.getTime())) return null;
  const end = new Date(base);
  if (vipPlan === "monthly") end.setMonth(end.getMonth() + 1);
  else if (vipPlan === "yearly") end.setFullYear(end.getFullYear() + 1);
  else return null;
  return end;
}

function toVipResponse(user) {
  const vip_status = Boolean(user?.vip_status ?? user?.isVip);
  return {
    ...user,
    vip_status,
    vipEndDate: vip_status ? calcVipEndDate(user?.vipSince, user?.vipPlan) : null,
  };
}

const status = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findById(userId).select("vip_status isVip vipSince vipPlan").lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(toVipResponse(user));
});

const upgrade = asyncHandler(async (req, res) => {
  const { userId, vipPlan } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findByIdAndUpdate(
    uid,
    { $set: { isVip: true, vip_status: true, vipSince: new Date(), vipPlan: vipPlan || "monthly" } },
    { new: true }
  ).select("vip_status isVip vipSince vipPlan");
  res.json(toVipResponse(user.toObject()));
});

const cancel = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findByIdAndUpdate(
    uid,
    { $set: { isVip: false, vip_status: false, vipSince: null, vipPlan: "none" } },
    { new: true }
  ).select("vip_status isVip vipSince vipPlan");
  res.json(toVipResponse(user.toObject()));
});

module.exports = { status, upgrade, cancel };

