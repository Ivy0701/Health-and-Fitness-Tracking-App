const asyncHandler = require("../../utils/asyncHandler");
const mongoose = require("mongoose");
const HealthRecord = require("../../models/HealthRecord");
const Workout = require("../../models/Workout");
const Diet = require("../../models/Diet");
const Course = require("../../models/Course");

const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const latestBmi = await HealthRecord.findOne({ userId })
    .select("bmi recordedAt")
    .sort({ recordedAt: -1, createdAt: -1 })
    .lean();

  const trendRows = await HealthRecord.find({ userId })
    .select("bmi recordedAt")
    .sort({ recordedAt: -1, createdAt: -1 })
    .limit(7)
    .lean();

  const trend = trendRows
    .reverse()
    .map((row) => ({
      day: new Date(row.recordedAt).toISOString().slice(5, 10),
      bmi: row.bmi,
    }));

  const [todayWorkoutMinutes, todayCoursesCount, todayCaloriesObj] = await Promise.all([
    Workout.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: "$duration" } } },
    ]),
    Course.countDocuments({}),
    Diet.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), date: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: "$calories" } } },
    ]),
  ]);

  res.json({
    todayWorkoutMinutes: todayWorkoutMinutes[0]?.total || 0,
    todayCoursesCount,
    todayCalories: todayCaloriesObj[0]?.total || 0,
    latestBmi: latestBmi || null,
    bmiTrend: trend,
  });
});

module.exports = { getDashboard };
