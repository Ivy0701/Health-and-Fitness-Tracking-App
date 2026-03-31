const asyncHandler = require("../../utils/asyncHandler");
const mongoose = require("mongoose");
const HealthRecord = require("../../models/HealthRecord");
const Workout = require("../../models/Workout");
const Diet = require("../../models/Diet");
const ScheduleItem = require("../../models/ScheduleItem");
const User = require("../../models/User");

const safeIsoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [latestBmi, profile] = await Promise.all([
    HealthRecord.findOne({ userId })
      .select("bmi recordedAt")
      .sort({ recordedAt: -1, createdAt: -1 })
      .lean(),
    User.findById(userId).select("bmi").lean(),
  ]);

  const [totalWorkouts, caloriesBurnedRows, caloriesConsumedRows, recentWorkout, recentDiet, recentSchedule, weeklyWorkoutRows, weeklyCaloriesOutRows, weeklyCaloriesInRows, monthlyWorkoutRows, monthlyDietRows, schedulesCount] =
    await Promise.all([
      Workout.countDocuments({ userId }),
      Workout.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: null, total: { $sum: "$caloriesBurned" } } },
      ]),
      Diet.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: null, total: { $sum: "$calories" } } },
      ]),
      Workout.findOne({ userId }).select("type duration caloriesBurned date").sort({ date: -1, createdAt: -1 }).lean(),
      Diet.findOne({ userId }).select("foodName calories mealType date").sort({ date: -1, createdAt: -1 }).lean(),
      ScheduleItem.findOne({ userId }).select("title date time createdAt").sort({ createdAt: -1 }).lean(),
      Workout.aggregate([
        { $match: { userId: userObjectId, date: { $gte: weekStart, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            workouts: { $sum: 1 },
          },
        },
      ]),
      Workout.aggregate([
        { $match: { userId: userObjectId, date: { $gte: weekStart, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            caloriesOut: { $sum: "$caloriesBurned" },
          },
        },
      ]),
      Diet.aggregate([
        { $match: { userId: userObjectId, date: { $gte: weekStart, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            caloriesIn: { $sum: "$calories" },
          },
        },
      ]),
      Workout.aggregate([
        { $match: { userId: userObjectId, date: { $gte: monthStart, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
            caloriesOut: { $sum: "$caloriesBurned" },
          },
        },
      ]),
      Diet.aggregate([
        { $match: { userId: userObjectId, date: { $gte: monthStart, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
            caloriesIn: { $sum: "$calories" },
          },
        },
      ]),
      ScheduleItem.countDocuments({ userId }),
    ]);

  const workoutMap = new Map(weeklyWorkoutRows.map((row) => [row._id, row.workouts]));
  const caloriesOutMap = new Map(weeklyCaloriesOutRows.map((row) => [row._id, row.caloriesOut]));
  const caloriesInMap = new Map(weeklyCaloriesInRows.map((row) => [row._id, row.caloriesIn]));
  const weeklyWorkout = [];
  const caloriesInVsOut = [];

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = safeIsoDate(date);
    weeklyWorkout.push({
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      value: workoutMap.get(key) || 0,
    });
    caloriesInVsOut.push({
      day: date.toLocaleDateString("en-US", { weekday: "short" }),
      in: caloriesInMap.get(key) || 0,
      out: caloriesOutMap.get(key) || 0,
    });
  }

  const monthOutMap = new Map(monthlyWorkoutRows.map((row) => [row._id, row.caloriesOut]));
  const monthInMap = new Map(monthlyDietRows.map((row) => [row._id, row.caloriesIn]));
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTrend.push({
      month: d.toLocaleDateString("en-US", { month: "short" }),
      in: monthInMap.get(key) || 0,
      out: monthOutMap.get(key) || 0,
    });
  }

  const bmiValue = latestBmi?.bmi ?? profile?.bmi ?? 0;
  const scheduledToday = await ScheduleItem.countDocuments({ userId, date: safeIsoDate(now) });
  const completedToday = await Workout.countDocuments({ userId, date: { $gte: todayStart, $lte: todayEnd } });
  const scheduleCompletionRate = scheduledToday > 0 ? Math.min(100, Math.round((completedToday / scheduledToday) * 100)) : 0;

  const totalCaloriesBurned = caloriesBurnedRows[0]?.total || 0;
  const totalCaloriesConsumed = caloriesConsumedRows[0]?.total || 0;

  res.json({
    summary: {
      totalWorkouts: totalWorkouts || 0,
      caloriesBurned: totalCaloriesBurned,
      caloriesConsumed: totalCaloriesConsumed,
      bmi: bmiValue || 0,
      scheduleCompletionRate,
    },
    charts: {
      weeklyWorkout,
      caloriesInVsOut,
      monthlyTrend,
    },
    recentActivity: {
      workout: recentWorkout
        ? {
            title: recentWorkout.type,
            value: `${recentWorkout.duration || 0} min`,
            extra: `${recentWorkout.caloriesBurned || 0} kcal`,
            at: recentWorkout.date,
          }
        : null,
      diet: recentDiet
        ? {
            title: recentDiet.foodName,
            value: `${recentDiet.calories || 0} kcal`,
            extra: recentDiet.mealType || "",
            at: recentDiet.date,
          }
        : null,
      schedule: recentSchedule
        ? {
            title: recentSchedule.title,
            value: `${recentSchedule.date || ""} ${recentSchedule.time || ""}`.trim(),
            extra: "",
            at: recentSchedule.createdAt,
          }
        : null,
    },
    meta: {
      totalSchedules: schedulesCount || 0,
      generatedAt: new Date().toISOString(),
    },
  });
});

module.exports = { getDashboard };
