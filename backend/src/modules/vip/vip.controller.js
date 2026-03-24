const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const plans = asyncHandler(async (req, res) => {
  res.json([
    { plan: "monthly", price: 19, benefits: ["Advanced analytics", "Priority feedback"] },
    { plan: "quarterly", price: 49, benefits: ["Advanced analytics", "Custom goals"] },
    { plan: "yearly", price: 169, benefits: ["All features", "Coach consultation"] }
  ]);
});

const status = asyncHandler(async (req, res) => {
  const row = await db.get(
    "SELECT * FROM vip_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    [req.user.id]
  );
  res.json(row || null);
});

const upgrade = asyncHandler(async (req, res) => {
  const { plan_name } = req.body;
  const result = await db.run(
    `INSERT INTO vip_subscriptions (user_id, plan_name, start_date, end_date, status)
     VALUES (?, ?, date('now'), date('now', '+30 day'), 'active')`,
    [req.user.id, plan_name || "monthly"]
  );
  res.status(201).json({ id: result.id, message: "VIP upgraded (mock)" });
});

module.exports = { plans, status, upgrade };
