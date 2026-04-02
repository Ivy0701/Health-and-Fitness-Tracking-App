const asyncHandler = require("../../utils/asyncHandler");
const WorkoutPlan = require("../../models/WorkoutPlan");

const listPlans = asyncHandler(async (req, res) => {
  const rows = await WorkoutPlan.find({ user_id: req.user.id }).sort({ created_at: -1 });
  res.json(rows);
});

const createPlan = asyncHandler(async (req, res) => {
  const { exerciseName, category, durationPerDay, days, isCustom } = req.body;
  if (!exerciseName || !category || !durationPerDay || !days) {
    return res.status(400).json({ message: "exerciseName, category, durationPerDay and days are required" });
  }
  if (Number(days) < 1 || Number(days) > 30) {
    return res.status(400).json({ message: "days must be between 1 and 30" });
  }

  const row = await WorkoutPlan.create({
    user_id: req.user.id,
    exercise_name: String(exerciseName).trim(),
    category: String(category).trim(),
    duration_per_day: Number(durationPerDay),
    days: Number(days),
    is_custom: Boolean(isCustom),
  });

  res.status(201).json(row);
});

module.exports = { listPlans, createPlan };

