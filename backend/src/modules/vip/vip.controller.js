const asyncHandler = require("../../utils/asyncHandler");
const User = require("../../models/User");
const REFUND_WINDOW_DAYS = 7;

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
    refundStatus: user?.refundStatus || "none",
    refundReason: user?.refundReason || "",
    refundNote: user?.refundNote || "",
    refundRequestedAt: user?.refundRequestedAt || null,
    refundReviewedAt: user?.refundReviewedAt || null,
    refundReviewedBy: user?.refundReviewedBy || "",
  };
}

function normalizeVipPlan(plan) {
  const p = String(plan || "").toLowerCase();
  return p === "yearly" ? "yearly" : "monthly";
}

const status = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const user = await User.findById(userId)
    .select("vip_status isVip vipSince vipEndAt vipPlan refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy")
    .lean();
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
    {
      $set: {
        isVip: true,
        vip_status: true,
        vipSince: nextVipSince,
        vipEndAt: nextEnd,
        vipPlan: targetPlan,
        refundStatus: "none",
        refundReason: "",
        refundNote: "",
        refundRequestedAt: null,
        refundReviewedAt: null,
        refundReviewedBy: "",
      },
    },
    { new: true }
  ).select("vip_status isVip vipSince vipEndAt vipPlan refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy");

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
  ).select("vip_status isVip vipSince vipEndAt vipPlan refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy");
  res.json(toVipResponse(user.toObject()));
});

const submitRefundRequest = asyncHandler(async (req, res) => {
  const { userId, reason, note } = req.body || {};
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });

  const refundReason = String(reason || "").trim();
  if (!refundReason) return res.status(400).json({ message: "Reason for refund is required." });

  const user = await User.findById(uid)
    .select("vip_status isVip vipSince vipEndAt vipPlan refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy")
    .lean();
  if (!user) return res.status(404).json({ message: "User not found" });
  const isVip = Boolean(user?.vip_status ?? user?.isVip);
  if (!isVip) return res.status(400).json({ message: "Only VIP users can submit a refund request." });
  if (!user?.vipSince) return res.status(400).json({ message: "VIP start date is missing." });

  const now = Date.now();
  const sinceMs = new Date(user.vipSince).getTime();
  if (!Number.isFinite(sinceMs)) return res.status(400).json({ message: "VIP start date is invalid." });
  const elapsedDays = Math.floor((now - sinceMs) / (24 * 60 * 60 * 1000));
  if (elapsedDays > REFUND_WINDOW_DAYS) {
    return res.status(400).json({ message: `Refund is only available within ${REFUND_WINDOW_DAYS} days from VIP since date.` });
  }
  if (user.refundStatus === "pending") {
    return res.status(400).json({ message: "You already have a pending refund request." });
  }

  const updated = await User.findByIdAndUpdate(
    uid,
    {
      $set: {
        refundStatus: "pending",
        refundReason,
        refundNote: String(note || "").trim(),
        refundRequestedAt: new Date(),
        refundReviewedAt: null,
        refundReviewedBy: "",
      },
    },
    { new: true }
  ).select("vip_status isVip vipSince vipEndAt vipPlan refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy");

  res.json(toVipResponse(updated.toObject()));
});

module.exports = { status, upgrade, cancel, submitRefundRequest };

