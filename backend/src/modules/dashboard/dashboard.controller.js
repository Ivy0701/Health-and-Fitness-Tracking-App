const asyncHandler = require("../../utils/asyncHandler");
const mongoose = require("mongoose");
const HealthRecord = require("../../models/HealthRecord");
const Workout = require("../../models/Workout");
const Diet = require("../../models/Diet");
const ScheduleItem = require("../../models/ScheduleItem");
const User = require("../../models/User");
const ForumPost = require("../../models/ForumPost");
const Notification = require("../../models/Notification");
const CourseDailyProgress = require("../../models/CourseDailyProgress");
const WorkoutPlan = require("../../models/WorkoutPlan");
const WorkoutDailyStatus = require("../../models/WorkoutDailyStatus");
const EnrolledCourse = require("../../models/EnrolledCourse");
const Favorite = require("../../models/Favorite");
const Course = require("../../models/Course");
const { calculateWorkoutCaloriesBurned, resolveWeightKg } = require("../../utils/workoutCaloriesBurn");
const { forumPostsUserVisibleFilter, forumPostsModerationListFilter } = require("../../utils/forumUserVisibleFilter");
const REFUND_STATUSES = ["pending", "approved", "rejected"];
const ACTIVE_VIP_PLANS = ["monthly", "yearly"];

function toRefundRow(user) {
  return {
    userId: String(user?._id || ""),
    username: user?.username || "",
    email: user?.email || "",
    vipPlan: user?.vipPlan || "none",
    vipSince: user?.vipSince || null,
    subscriptionEnds: user?.vipEndAt || null,
    refundStatus: user?.refundStatus || "none",
    refundReason: user?.refundReason || "",
    refundNote: user?.refundNote || "",
    refundRequestedAt: user?.refundRequestedAt || null,
    refundReviewedAt: user?.refundReviewedAt || null,
    refundReviewedBy: user?.refundReviewedBy || "",
    refundAdminNote: user?.refundAdminNote || "",
    isVip: Boolean(user?.vip_status || user?.isVip),
  };
}

function normalizeForumStatus(value) {
  const key = String(value || "normal").trim().toLowerCase();
  if (key === "warned" || key === "removed") return key;
  return "normal";
}

function toForumModerationRow(row) {
  const status = normalizeForumStatus(row?.status);
  return {
    id: String(row?._id || ""),
    title: String(row?.title || "").trim(),
    content: String(row?.content || "").trim(),
    authorName: String(row?.authorName || "").trim(),
    tags: Array.isArray(row?.tags) ? row.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
    likeCount: Array.isArray(row?.likedBy) ? row.likedBy.length : Number(row?.likeCount || 0),
    commentCount: Array.isArray(row?.comments)
      ? row.comments.filter((c) => c && String(c.content || "").trim()).length
      : Number(row?.commentCount || 0),
    status,
    warningMessage: String(row?.warningMessage || "").trim(),
    removalReason: String(row?.removalReason || "").trim(),
    moderatedAt: row?.moderatedAt || null,
    moderatedBy: String(row?.moderatedBy || "").trim(),
    createdAt: row?.createdAt || null,
  };
}

const safeIsoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const toLocalDateKey = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const VALID_SCHEDULE_FILTER = {
  itemType: { $ne: "diet" },
  title: { $exists: true, $type: "string", $ne: "" },
  date: { $exists: true, $type: "string", $ne: "" },
  time: { $exists: true, $type: "string", $ne: "" },
};

function emptyWorkoutStatusBreakdown() {
  return {
    not_started: 0,
    in_progress: 0,
    paused: 0,
    completed: 0,
    missed: 0,
    scheduled: 0,
  };
}

/** Prefer stored caloriesBurned; if logged as 0, recompute from MET using type + duration. */
function effectiveStoredWorkoutBurn(doc, weightKg) {
  const stored = Number(doc?.caloriesBurned) || 0;
  if (stored > 0) return stored;
  const dur = Number(doc?.duration) || 0;
  if (dur <= 0) return 0;
  return calculateWorkoutCaloriesBurned({
    title: doc?.type || "",
    category: "",
    durationMinutes: dur,
    weightKg,
  });
}

function isUserVipActive(user, now = new Date()) {
  const flag = Boolean(user?.vip_status || user?.isVip);
  const plan = String(user?.vipPlan || "none");
  if (!flag || !ACTIVE_VIP_PLANS.includes(plan)) return false;
  if (!user?.vipEndAt) return true;
  const end = new Date(user.vipEndAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() >= now.getTime();
}

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
    User.findById(userId).select("bmi weight").lean(),
  ]);

  const weightForBurn = resolveWeightKg(profile?.weight);

  const [totalWorkouts, caloriesBurnedRows, caloriesConsumedRows, recentWorkout, recentDiet, recentSchedule, weeklyWorkoutRows, weekWorkoutBurnDocs, weeklyCaloriesInRows, monthWorkoutBurnDocs, monthlyDietRows, schedulesCount] =
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
      Workout.find({
        userId: userObjectId,
        date: { $gte: weekStart, $lte: todayEnd },
      })
        .select("type duration caloriesBurned date")
        .lean(),
      Diet.aggregate([
        { $match: { userId: userObjectId, date: { $gte: weekStart, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            caloriesIn: { $sum: "$calories" },
          },
        },
      ]),
      Workout.find({
        userId: userObjectId,
        date: { $gte: monthStart, $lte: todayEnd },
      })
        .select("type duration caloriesBurned date")
        .lean(),
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
  const caloriesOutMap = new Map();
  for (const doc of weekWorkoutBurnDocs || []) {
    const key = safeIsoDate(doc.date);
    caloriesOutMap.set(key, (caloriesOutMap.get(key) || 0) + effectiveStoredWorkoutBurn(doc, weightForBurn));
  }
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
      out: caloriesOutMap.get(key) ?? 0,
    });
  }

  const monthOutMap = new Map();
  for (const doc of monthWorkoutBurnDocs || []) {
    const d = new Date(doc.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthOutMap.set(key, (monthOutMap.get(key) || 0) + effectiveStoredWorkoutBurn(doc, weightForBurn));
  }
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

  let recentWorkoutPayload = recentWorkout;
  if (recentWorkoutPayload && !(Number(recentWorkoutPayload.caloriesBurned) > 0)) {
    recentWorkoutPayload = {
      ...recentWorkoutPayload,
      caloriesBurned: effectiveStoredWorkoutBurn(recentWorkoutPayload, weightForBurn),
    };
  }

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
      workout: recentWorkoutPayload
        ? {
            title: recentWorkoutPayload.type,
            value: `${recentWorkoutPayload.duration || 0} min`,
            extra: `${recentWorkoutPayload.caloriesBurned || 0} kcal`,
            at: recentWorkoutPayload.date,
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

const getSystemStatus = asyncHandler(async (req, res) => {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const todayDateKey = toLocalDateKey(now);
  const forumVisible = forumPostsUserVisibleFilter();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const vipFlagMatch = { $or: [{ vip_status: true }, { isVip: true }] };
  const vipActiveBaseMatch = {
    ...vipFlagMatch,
    vipPlan: { $in: ACTIVE_VIP_PLANS },
  };

  const vipDirtyFixResult = await User.updateMany(
    {
      ...vipFlagMatch,
      vipPlan: "none",
      refundStatus: { $ne: "pending" },
    },
    {
      $set: {
        isVip: false,
        vip_status: false,
        vipSince: null,
        vipEndAt: null,
      },
    }
  );

  const [
    totalWorkoutPlans,
    completedWorkoutDailyTasks,
    completedManualWorkoutScheduleTasks,
    totalDiets,
    totalSchedulesRows,
    courseEnrollmentsActiveCompletedRows,
    completedCourseDaysByCard,
    completedCourseExercises,
    postsVisibleCount,
    postsTodayVisibleCount,
    likesTotalRows,
    commentsTotalRows,
    latestDiet,
    latestSchedule,
    latestWorkoutPlan,
    latestWorkoutStatus,
    latestCourseProgress,
    latestPost,
    latestCommentRows,
    totalRegisteredUsers,
    usersAssessmentCompleted,
    usersRegisteredLast7Days,
    usersRegisteredLast30Days,
    totalVipUsers,
    vipMonthlyUsers,
    vipYearlyUsers,
    vipExpiredUsers,
    vipActivePlanNone,
    totalCoursesInCatalog,
    premiumCoursesInCatalog,
    enrollmentsByStatusRows,
    topCoursesByEnrollment,
    totalFavorites,
    distinctForumAuthors,
    distinctWorkoutUsers,
    distinctDietUsers,
    distinctScheduleUsers,
    distinctWorkoutPlanUsers,
    distinctWorkoutDailyUsers,
    distinctCourseEnrolledUsersRows,
    distinctFavoriteUsers,
    distinctHealthRecordUsers,
    totalEnrollmentsAllStatusesRows,
    workoutStatusRows,
    totalBurnedCaloriesRows,
    totalConsumedCaloriesRows,
  ] = await Promise.all([
    WorkoutPlan.countDocuments(),
    WorkoutDailyStatus.countDocuments({ is_completed: true }),
    ScheduleItem.countDocuments({
      itemType: "workout",
      is_completed: true,
      planId: null,
    }),
    Diet.countDocuments(),
    ScheduleItem.aggregate([
      {
        $match: {
          ...VALID_SCHEDULE_FILTER,
          date: { $gte: todayDateKey },
        },
      },
      {
        $lookup: {
          from: WorkoutPlan.collection.name,
          localField: "planId",
          foreignField: "_id",
          as: "linkedPlan",
        },
      },
      {
        $lookup: {
          from: Course.collection.name,
          localField: "courseId",
          foreignField: "_id",
          as: "linkedCourse",
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              {
                $or: [
                  { $eq: ["$planId", null] },
                  { $gt: [{ $size: "$linkedPlan" }, 0] },
                ],
              },
              {
                $or: [
                  { $eq: ["$courseId", null] },
                  { $gt: [{ $size: "$linkedCourse" }, 0] },
                ],
              },
            ],
          },
        },
      },
      { $count: "total" },
    ]),
    EnrolledCourse.aggregate([
      { $match: { status: { $in: ["active", "completed"] } } },
      {
        $lookup: {
          from: Course.collection.name,
          localField: "course_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: false } },
      { $group: { _id: { user: "$user_id", course: "$course_id" } } },
      { $count: "total" },
    ]),
    CourseDailyProgress.countDocuments({ is_completed: true }),
    CourseDailyProgress.aggregate([
      {
        $project: {
          exercises: { $ifNull: ["$exercises", []] },
        },
      },
      { $unwind: { path: "$exercises", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: null,
          completed: {
            $sum: {
              $cond: [{ $eq: ["$exercises.status", "completed"] }, 1, 0],
            },
          },
          total: { $sum: 1 },
        },
      },
    ]),
    ForumPost.countDocuments(forumVisible),
    ForumPost.countDocuments({ ...forumVisible, createdAt: { $gte: dayStart } }),
    ForumPost.aggregate([
      { $match: forumVisible },
      {
        $group: {
          _id: null,
          total: { $sum: { $size: { $ifNull: ["$likedBy", []] } } },
        },
      },
    ]),
    ForumPost.aggregate([
      { $match: forumVisible },
      {
        $unwind: { path: "$comments", preserveNullAndEmptyArrays: false },
      },
      {
        $group: { _id: null, total: { $sum: 1 } },
      },
    ]),
    Diet.findOne().sort({ date: -1, createdAt: -1 }).select("date createdAt updatedAt").lean(),
    ScheduleItem.findOne(VALID_SCHEDULE_FILTER).sort({ createdAt: -1 }).select("date createdAt updatedAt").lean(),
    WorkoutPlan.findOne().sort({ created_at: -1 }).select("created_at").lean(),
    WorkoutDailyStatus.findOne().sort({ updatedAt: -1, createdAt: -1 }).select("updatedAt createdAt").lean(),
    CourseDailyProgress.findOne().sort({ updatedAt: -1, createdAt: -1 }).select("updatedAt createdAt").lean(),
    ForumPost.findOne(forumVisible).sort({ createdAt: -1, updatedAt: -1 }).select("createdAt updatedAt").lean(),
    ForumPost.aggregate([
      { $match: forumVisible },
      { $unwind: { path: "$comments", preserveNullAndEmptyArrays: false } },
      { $sort: { "comments.createdAt": -1 } },
      { $limit: 1 },
      { $project: { _id: 0, createdAt: "$comments.createdAt" } },
    ]),
    User.countDocuments(),
    User.countDocuments({ assessment_completed: true }),
    User.countDocuments({ createdAt: { $gte: weekAgo } }),
    User.countDocuments({ createdAt: { $gte: monthAgo } }),
    User.countDocuments({
      ...vipActiveBaseMatch,
      $or: [{ vipEndAt: null }, { vipEndAt: { $gte: now } }],
    }),
    User.countDocuments({
      ...vipActiveBaseMatch,
      vipPlan: "monthly",
      $or: [{ vipEndAt: null }, { vipEndAt: { $gte: now } }],
    }),
    User.countDocuments({
      ...vipActiveBaseMatch,
      vipPlan: "yearly",
      $or: [{ vipEndAt: null }, { vipEndAt: { $gte: now } }],
    }),
    User.countDocuments({
      ...vipActiveBaseMatch,
      vipEndAt: { $lt: now },
    }),
    User.countDocuments({ ...vipFlagMatch, vipPlan: "none" }),
    Course.countDocuments(),
    Course.countDocuments({ isPremium: true }),
    EnrolledCourse.aggregate([
      {
        $lookup: {
          from: Course.collection.name,
          localField: "course_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: { user: "$user_id", course: "$course_id" },
          status: { $first: "$status" },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    EnrolledCourse.aggregate([
      { $group: { _id: "$course_id", enrollments: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } },
      {
        $lookup: {
          from: Course.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: false } },
      {
        $match: {
          $expr: {
            $not: {
              $and: [
                { $eq: [{ $toLower: { $ifNull: ["$course.title", ""] } }, "run"] },
                { $lte: [{ $ifNull: ["$course.duration", 0] }, 1] },
              ],
            },
          },
        },
      },
      { $sort: { enrollments: -1, "course.title": 1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          courseId: "$_id",
          enrollments: 1,
          title: { $ifNull: ["$course.title", ""] },
          isPremium: { $ifNull: ["$course.isPremium", false] },
        },
      },
    ]),
    Favorite.countDocuments(),
    ForumPost.distinct("userId", forumVisible),
    Workout.distinct("userId"),
    Diet.distinct("userId"),
    ScheduleItem.distinct("userId", VALID_SCHEDULE_FILTER),
    WorkoutPlan.distinct("user_id"),
    WorkoutDailyStatus.distinct("user_id"),
    EnrolledCourse.aggregate([
      { $match: { status: { $in: ["active", "completed"] } } },
      {
        $lookup: {
          from: Course.collection.name,
          localField: "course_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$user_id" } },
    ]),
    Favorite.distinct("userId"),
    HealthRecord.distinct("userId"),
    EnrolledCourse.aggregate([
      {
        $lookup: {
          from: Course.collection.name,
          localField: "course_id",
          foreignField: "_id",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: false } },
      { $group: { _id: { user: "$user_id", course: "$course_id" } } },
      { $count: "total" },
    ]),
    ScheduleItem.aggregate([
      {
        $match: {
          itemType: "workout",
          title: { $exists: true, $type: "string", $ne: "" },
          date: { $exists: true, $type: "string", $ne: "" },
          time: { $exists: true, $type: "string", $ne: "" },
        },
      },
      {
        $lookup: {
          from: WorkoutPlan.collection.name,
          localField: "planId",
          foreignField: "_id",
          as: "plan",
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ["$planId", null] },
              { $gt: [{ $size: "$plan" }, 0] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: WorkoutDailyStatus.collection.name,
          let: { uid: "$userId", pid: "$planId", d: "$date" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$user_id", "$$uid"] },
                    { $eq: ["$workout_plan_id", "$$pid"] },
                    { $eq: ["$date", "$$d"] },
                  ],
                },
              },
            },
            { $project: { _id: 0, status: 1, is_completed: 1 } },
            { $limit: 1 },
          ],
          as: "dailyStatus",
        },
      },
      { $set: { dailyStatus: { $arrayElemAt: ["$dailyStatus", 0] } } },
      {
        $set: {
          normalizedStatus: {
            $switch: {
              branches: [
                {
                  case: {
                    $or: [{ $eq: ["$is_completed", true] }, { $eq: ["$dailyStatus.is_completed", true] }],
                  },
                  then: "completed",
                },
                { case: { $eq: ["$dailyStatus.status", "paused"] }, then: "paused" },
                { case: { $eq: ["$dailyStatus.status", "in_progress"] }, then: "in_progress" },
                { case: { $eq: ["$dailyStatus.status", "scheduled"] }, then: "scheduled" },
                { case: { $eq: ["$dailyStatus.status", "missed"] }, then: "missed" },
                { case: { $eq: ["$dailyStatus.status", "not_started"] }, then: "not_started" },
                { case: { $gt: ["$date", todayDateKey] }, then: "scheduled" },
                { case: { $lt: ["$date", todayDateKey] }, then: "missed" },
              ],
              default: "not_started",
            },
          },
        },
      },
      { $group: { _id: "$normalizedStatus", count: { $sum: 1 } } },
    ]),
    Workout.aggregate([
      { $group: { _id: null, total: { $sum: "$caloriesBurned" } } },
    ]),
    Diet.aggregate([
      { $group: { _id: null, total: { $sum: "$calories" } } },
    ]),
  ]);

  const likesTotal = likesTotalRows[0]?.total || 0;
  const commentsTotal = commentsTotalRows[0]?.total || 0;
  const communityInteractions = likesTotal + commentsTotal;

  const postsRemovedCount = await ForumPost.countDocuments({ status: "removed" });
  const completedWorkoutTasks = Number(completedWorkoutDailyTasks || 0) + Number(completedManualWorkoutScheduleTasks || 0);
  const completedCourseExercisesTotal = Number(completedCourseExercises?.[0]?.completed || 0);
  const totalCourseExercisesTotal = Number(completedCourseExercises?.[0]?.total || 0);
  const burnedCaloriesTotal = Number(totalBurnedCaloriesRows?.[0]?.total || 0);
  const consumedCaloriesTotal = Number(totalConsumedCaloriesRows?.[0]?.total || 0);
  const totalSchedules = Number(totalSchedulesRows?.[0]?.total || 0);
  const courseEnrollmentsActiveCompleted = Number(courseEnrollmentsActiveCompletedRows?.[0]?.total || 0);
  const totalEnrollmentsAllStatuses = Number(totalEnrollmentsAllStatusesRows?.[0]?.total || 0);

  const activityCandidates = [
    latestDiet?.date,
    latestDiet?.createdAt,
    latestDiet?.updatedAt,
    latestSchedule?.date,
    latestSchedule?.createdAt,
    latestSchedule?.updatedAt,
    latestWorkoutPlan?.created_at,
    latestWorkoutStatus?.createdAt,
    latestWorkoutStatus?.updatedAt,
    latestCourseProgress?.createdAt,
    latestCourseProgress?.updatedAt,
    latestPost?.createdAt,
    latestPost?.updatedAt,
    latestCommentRows[0]?.createdAt,
  ]
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  const latestUserActivityAt = activityCandidates.length
    ? new Date(Math.max(...activityCandidates.map((date) => date.getTime()))).toISOString()
    : null;

  const dbStateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const dbStatus = dbStateMap[mongoose.connection.readyState] || "unknown";

  const enrollmentsByStatus = { active: 0, completed: 0, cancelled: 0 };
  for (const row of enrollmentsByStatusRows || []) {
    const key = row._id;
    if (key && Object.prototype.hasOwnProperty.call(enrollmentsByStatus, key)) {
      enrollmentsByStatus[key] = row.count;
    }
  }

  const topCourses = (topCoursesByEnrollment || [])
    .map((row) => ({
      courseId: row.courseId ? String(row.courseId) : "",
      title: String(row.title || "").trim(),
      enrollments: row.enrollments || 0,
      isPremium: Boolean(row.isPremium),
    }))
    .filter((row) => row.courseId && row.title);

  const workoutStatusBreakdown = emptyWorkoutStatusBreakdown();
  for (const row of workoutStatusRows || []) {
    const key = String(row?._id || "");
    if (Object.prototype.hasOwnProperty.call(workoutStatusBreakdown, key)) {
      workoutStatusBreakdown[key] = Number(row?.count || 0);
    }
  }

  const avgEnrollmentsPerCourse =
    totalCoursesInCatalog > 0 ? Math.round((totalEnrollmentsAllStatuses / totalCoursesInCatalog) * 100) / 100 : 0;

  const registeredUsersPreview = await User.find()
    .sort({ createdAt: -1 })
    .limit(12)
    .select("username email createdAt vip_status isVip vipPlan vipEndAt assessment_completed")
    .lean();
  const refundUsers = await User.find({ refundStatus: { $in: REFUND_STATUSES } })
    .sort({ refundRequestedAt: -1, updatedAt: -1 })
    .select(
      "username email vip_status isVip vipPlan vipSince vipEndAt refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy refundAdminNote"
    )
    .lean();
  const refundRows = (refundUsers || []).map((row) => toRefundRow(row));
  const pendingCount = refundRows.filter((x) => x.refundStatus === "pending").length;
  const approvedCount = refundRows.filter((x) => x.refundStatus === "approved").length;
  const rejectedCount = refundRows.filter((x) => x.refundStatus === "rejected").length;

  res.json({
    users: {
      totalRegistered: totalRegisteredUsers,
      assessmentCompleted: usersAssessmentCompleted,
      registeredLast7Days: usersRegisteredLast7Days,
      registeredLast30Days: usersRegisteredLast30Days,
      preview12: (registeredUsersPreview || []).map((u) => ({
        id: String(u._id),
        username: u.username || "",
        email: u.email || "",
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
        assessmentCompleted: Boolean(u.assessment_completed),
        isVip: isUserVipActive(u, now),
        vipPlan: u.vipPlan || "none",
      })),
    },
    vip: {
      totalVipUsers,
      monthlyPlanUsers: vipMonthlyUsers,
      yearlyPlanUsers: vipYearlyUsers,
      expiredVipUsers: vipExpiredUsers,
      vipButPlanNone: vipActivePlanNone,
      refundPendingRequests: pendingCount,
      autoCleanedVipFlagPlanMismatch: Number(vipDirtyFixResult?.modifiedCount || 0),
    },
    refundRequests: {
      pendingCount,
      approvedCount,
      rejectedCount,
      rows: refundRows,
    },
    catalog: {
      totalCourses: totalCoursesInCatalog,
      premiumCourses: premiumCoursesInCatalog,
    },
    courseEnrollments: {
      activeOrCompletedRecords: courseEnrollmentsActiveCompleted,
      allStatusRecords: totalEnrollmentsAllStatuses,
      byStatus: enrollmentsByStatus,
      avgEnrollmentsPerCourse,
      topByEnrollments: topCourses,
    },
    featureAdoption: {
      distinctUsersWithWorkoutLog: distinctWorkoutUsers.length,
      distinctUsersWithDiet: distinctDietUsers.length,
      distinctUsersWithSchedule: distinctScheduleUsers.length,
      distinctUsersWithWorkoutPlan: distinctWorkoutPlanUsers.length,
      distinctUsersWithWorkoutDaily: distinctWorkoutDailyUsers.length,
      distinctUsersWithCourseEnrollment: distinctCourseEnrolledUsersRows.length,
      distinctUsersWithForumPost: distinctForumAuthors.length,
      distinctUsersWithFavorite: distinctFavoriteUsers.length,
      distinctUsersWithHealthRecord: distinctHealthRecordUsers.length,
    },
    featureUsage: {
      workoutPlansCreated: totalWorkoutPlans,
      workoutTasksCompleted: completedWorkoutTasks,
      completedManualWorkoutScheduleTasks: completedManualWorkoutScheduleTasks || 0,
      dietEntries: totalDiets,
      scheduleItems: totalSchedules,
      courseEnrollments: courseEnrollmentsActiveCompleted,
      completedCourseDays: completedCourseDaysByCard,
      completedCourseExercises: completedCourseExercisesTotal,
      totalCourseExercises: totalCourseExercisesTotal,
      favoritesSaved: totalFavorites,
      totalCaloriesBurned: burnedCaloriesTotal,
      totalCaloriesConsumed: consumedCaloriesTotal,
    },
    workoutStatusBreakdown,
    forum: {
      /** Same filter as `GET /forum/posts` (visible in the app, excludes removed + legacy demo titles). */
      postsVisible: postsVisibleCount,
      postsToday: postsTodayVisibleCount,
      postsRemoved: postsRemovedCount,
      /** @deprecated Same as postsVisible; kept for older admin clients. */
      postsTotal: postsVisibleCount,
      likesTotal,
      commentsTotal,
      totalInteractions: communityInteractions,
      distinctAuthors: distinctForumAuthors.length,
    },
    // Backward-compatible alias for older clients.
    community: {
      postsToday: postsTodayVisibleCount,
      postsTotal: postsVisibleCount,
      postsVisible: postsVisibleCount,
      postsRemoved: postsRemovedCount,
      likesTotal,
      commentsTotal,
      totalInteractions: communityInteractions,
      distinctAuthors: distinctForumAuthors.length,
    },
    systemRuntime: {
      apiStatus: "online",
      databaseStatus: dbStatus,
      processUptimeSeconds: Math.floor(process.uptime()),
      serverTime: now.toISOString(),
      latestPlatformActivityAt: latestUserActivityAt,
      statsDate: todayDateKey,
    },
  });
});

const listRefundRequests = asyncHandler(async (_req, res) => {
  const users = await User.find({ refundStatus: { $in: REFUND_STATUSES } })
    .sort({ refundRequestedAt: -1, updatedAt: -1 })
    .select(
      "username email vip_status isVip vipPlan vipSince vipEndAt refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy refundAdminNote"
    )
    .lean();
  const rows = (users || []).map((row) => toRefundRow(row));
  const pendingCount = rows.filter((x) => x.refundStatus === "pending").length;
  const approvedCount = rows.filter((x) => x.refundStatus === "approved").length;
  const rejectedCount = rows.filter((x) => x.refundStatus === "rejected").length;
  res.json({
    pendingCount,
    approvedCount,
    rejectedCount,
    rows,
  });
});

const approveRefundRequest = asyncHandler(async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ message: "User ID is required." });

  const user = await User.findById(userId).select("refundStatus").lean();
  if (!user) return res.status(404).json({ message: "User not found." });
  if (user.refundStatus !== "pending") return res.status(400).json({ message: "Only pending requests can be approved." });

  const reviewer = String(req.body?.reviewedBy || req.user?.email || req.user?.id || "system-status-console").trim();
  const adminNote = String(req.body?.adminNote || req.body?.refundAdminNote || "").trim().slice(0, 1000);
  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        isVip: false,
        vip_status: false,
        vipSince: null,
        vipEndAt: null,
        vipPlan: "none",
        refundStatus: "approved",
        refundReviewedAt: new Date(),
        refundReviewedBy: reviewer,
        refundAdminNote: adminNote,
      },
    },
    { new: true }
  )
    .select(
      "username email vip_status isVip vipPlan vipSince vipEndAt refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy refundAdminNote"
    )
    .lean();

  res.json(toRefundRow(updated));
});

const rejectRefundRequest = asyncHandler(async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) return res.status(400).json({ message: "User ID is required." });

  const user = await User.findById(userId).select("refundStatus").lean();
  if (!user) return res.status(404).json({ message: "User not found." });
  if (user.refundStatus !== "pending") return res.status(400).json({ message: "Only pending requests can be rejected." });

  const reviewer = String(req.body?.reviewedBy || req.user?.email || req.user?.id || "system-status-console").trim();
  const adminNote = String(req.body?.adminNote || req.body?.rejectionReason || "").trim().slice(0, 1000);
  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        refundStatus: "rejected",
        refundReviewedAt: new Date(),
        refundReviewedBy: reviewer,
        refundAdminNote: adminNote,
      },
    },
    { new: true }
  )
    .select(
      "username email vip_status isVip vipPlan vipSince vipEndAt refundStatus refundReason refundNote refundRequestedAt refundReviewedAt refundReviewedBy refundAdminNote"
    )
    .lean();

  res.json(toRefundRow(updated));
});

const listForumModerationPosts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
  const rows = await ForumPost.find(forumPostsModerationListFilter())
    .sort({ createdAt: -1, updatedAt: -1 })
    .limit(limit)
    .select(
      "title content authorName tags likedBy comments status warningMessage removalReason moderatedAt moderatedBy createdAt"
    )
    .lean();
  res.json(rows.map((row) => toForumModerationRow(row)));
});

const addForumWarning = asyncHandler(async (req, res) => {
  const postId = String(req.params.postId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(postId)) return res.status(400).json({ message: "Invalid post id." });
  const warningMessage = String(req.body?.warningMessage || "").trim();
  if (!warningMessage) return res.status(400).json({ message: "warningMessage is required." });

  const moderator = String(req.body?.moderatedBy || req.user?.email || req.user?.id || "system-status-console").trim();
  const row = await ForumPost.findById(postId);
  if (!row) return res.status(404).json({ message: "Post not found." });
  row.status = "warned";
  row.warningMessage = warningMessage.slice(0, 500);
  row.moderatedAt = new Date();
  row.moderatedBy = moderator;
  await row.save();

  const postTitle = String(row.title || "Untitled")
    .trim()
    .slice(0, 180)
    .replace(/"/g, "'");
  const reasonText = row.warningMessage.slice(0, 500);
  await Notification.deleteMany({
    userId: row.userId,
    type: "post_warning",
    relatedPostId: row._id,
    isRead: false,
  });
  await Notification.create({
    userId: row.userId,
    type: "post_warning",
    title: "Post warning",
    message: `Your post "${postTitle}" received a moderator warning.`,
    reason: reasonText,
    relatedPostId: row._id,
    isRead: false,
  });

  res.json(toForumModerationRow(row));
});

const removeForumWarning = asyncHandler(async (req, res) => {
  const postId = String(req.params.postId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(postId)) return res.status(400).json({ message: "Invalid post id." });
  const moderator = String(req.body?.moderatedBy || req.user?.email || req.user?.id || "system-status-console").trim();
  const row = await ForumPost.findById(postId);
  if (!row) return res.status(404).json({ message: "Post not found." });
  row.status = "normal";
  row.warningMessage = "";
  row.moderatedAt = new Date();
  row.moderatedBy = moderator;
  await row.save();
  res.json(toForumModerationRow(row));
});

const removeForumPost = asyncHandler(async (req, res) => {
  const postId = String(req.params.postId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(postId)) return res.status(400).json({ message: "Invalid post id." });
  const moderator = String(req.body?.moderatedBy || req.user?.email || req.user?.id || "system-status-console").trim();
  const removalReason = String(req.body?.removalReason || req.body?.reason || req.body?.adminNote || "").trim();
  const row = await ForumPost.findById(postId);
  if (!row) return res.status(404).json({ message: "Post not found." });
  if (String(row.status || "") === "removed") {
    return res.json({ success: true, postId, alreadyRemoved: true });
  }
  if (!removalReason) {
    return res.status(400).json({ message: "removalReason is required." });
  }
  const reasonStored = removalReason.slice(0, 1000);
  const postTitle = String(row.title || "Untitled")
    .trim()
    .slice(0, 180)
    .replace(/"/g, "'");
  row.status = "removed";
  row.removalReason = reasonStored;
  row.moderatedAt = new Date();
  row.moderatedBy = moderator;
  await row.save();

  const dup = await Notification.exists({
    userId: row.userId,
    type: "post_removed",
    relatedPostId: row._id,
  });
  if (!dup) {
    await Notification.create({
      userId: row.userId,
      type: "post_removed",
      title: "Post removed",
      message: `Your post "${postTitle}" was removed by an administrator.`,
      reason: reasonStored,
      relatedPostId: row._id,
      isRead: false,
    });
  }

  res.json({ success: true, postId });
});

module.exports = {
  getDashboard,
  getSystemStatus,
  listRefundRequests,
  approveRefundRequest,
  rejectRefundRequest,
  listForumModerationPosts,
  addForumWarning,
  removeForumWarning,
  removeForumPost,
};
