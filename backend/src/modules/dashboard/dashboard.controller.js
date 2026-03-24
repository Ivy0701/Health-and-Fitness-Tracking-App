const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const workout = await db.get(
    "SELECT COALESCE(SUM(duration_min), 0) AS total FROM workout_records WHERE user_id = ? AND record_date = date('now')",
    [userId]
  );
  const courses = await db.get(
    `SELECT COUNT(*) AS total
     FROM course_bookings cb
     JOIN courses c ON c.id = cb.course_id
     WHERE cb.user_id = ? AND date(c.scheduled_at) = date('now') AND cb.status = 'booked'`,
    [userId]
  );
  const diets = await db.get(
    "SELECT COALESCE(SUM(calories), 0) AS total FROM diet_plans WHERE user_id = ? AND record_date = date('now')",
    [userId]
  );
  const latestBmi = await db.get(
    "SELECT bmi, bmi_category, recorded_date FROM bmi_records WHERE user_id = ? ORDER BY recorded_date DESC, id DESC LIMIT 1",
    [userId]
  );
  const trend = await db.all(
    `SELECT strftime('%m-%d', recorded_date) AS day, bmi
     FROM bmi_records WHERE user_id = ?
     ORDER BY recorded_date DESC LIMIT 7`,
    [userId]
  );

  res.json({
    todayWorkoutMinutes: workout.total,
    todayCourses: courses.total,
    todayCalories: diets.total,
    latestBmi: latestBmi || null,
    bmiTrend: trend.reverse()
  });
});

module.exports = { getDashboard };
