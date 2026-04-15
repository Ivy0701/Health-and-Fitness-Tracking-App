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
  const fallbackEnd = vip_status ? calcVipEndDate(user?.vipSince, user?.vipPlan) : null;
  return {
    ...user,
    vip_status,
    vipEndDate: vip_status ? (user?.vipEndAt || fallbackEnd) : null,
  };
}

function normalizeVipPlan(plan) {
  const p = String(plan || "").toLowerCase();
  return p === "yearly" ? "yearly" : "monthly";
}

const status = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findById(userId).select("vip_status isVip vipSince vipEndAt vipPlan").lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(toVipResponse(user));
});

const upgrade = asyncHandler(async (req, res) => {
  const { userId, vipPlan } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const targetPlan = normalizeVipPlan(vipPlan);
  const existing = await User.findById(uid).select("vip_status isVip vipSince vipEndAt vipPlan").lean();
  if (!existing) return res.status(404).json({ message: "User not found" });

  const now = new Date();
  const currentlyVip = Boolean(existing?.vip_status ?? existing?.isVip);
  const currentPlan = currentlyVip ? String(existing?.vipPlan || "none") : "none";
  const computedEnd = currentlyVip ? calcVipEndDate(existing?.vipSince, currentPlan) : null;
  const currentEnd = currentlyVip ? (existing?.vipEndAt || computedEnd) : null;

  // Renewal rule:
  // - If currently VIP and not expired: extend from current end date
  // - Otherwise: start from now
  const base = currentEnd && new Date(currentEnd).getTime() > now.getTime() ? new Date(currentEnd) : now;
  const nextEnd = calcVipEndDate(base, targetPlan);
  if (!nextEnd) return res.status(400).json({ message: "Invalid VIP plan" });

  // vipSince should represent the first activation time and should not move on renewals.
  const nextVipSince = currentlyVip && existing?.vipSince ? existing.vipSince : now;

  const user = await User.findByIdAndUpdate(
    uid,
    { $set: { isVip: true, vip_status: true, vipSince: nextVipSince, vipEndAt: nextEnd, vipPlan: targetPlan } },
    { new: true }
  ).select("vip_status isVip vipSince vipEndAt vipPlan");

  res.json(toVipResponse(user.toObject()));
});

const cancel = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findByIdAndUpdate(
    uid,
    { $set: { isVip: false, vip_status: false, vipSince: null, vipEndAt: null, vipPlan: "none" } },
    { new: true }
  ).select("vip_status isVip vipSince vipEndAt vipPlan");
  res.json(toVipResponse(user.toObject()));
});

module.exports = { status, upgrade, cancel };

