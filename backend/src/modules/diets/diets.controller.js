const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const recommendations = asyncHandler(async (req, res) => {
  res.json([
    "High protein breakfast with eggs and oats",
    "Drink at least 2L water per day",
    "Add vegetables in lunch and dinner"
  ]);
});

const addRecord = asyncHandler(async (req, res) => {
  const { meal_type, food_name, calories, protein_g, carb_g, fat_g, record_date } = req.body;
  const result = await db.run(
    `INSERT INTO diet_plans (user_id, meal_type, food_name, calories, protein_g, carb_g, fat_g, record_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, meal_type, food_name, calories || null, protein_g || null, carb_g || null, fat_g || null, record_date]
  );
  res.status(201).json({ id: result.id });
});

module.exports = { recommendations, addRecord };
