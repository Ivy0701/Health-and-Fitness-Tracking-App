const User = require("../../models/User");
const { calculateBmi } = require("../../utils/bmi.util");

function toProfile(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    gender: user.gender,
    age: user.age,
    height: user.height,
    weight: user.weight,
    targetWeight: user.targetWeight,
    bmi: user.bmi,
    assessment_completed: user.assessment_completed,
    heartRate: user.heartRate,
    goal: user.goal,
    activityLevel: user.activityLevel,
    preferredWorkoutTypes: Array.isArray(user.preferredWorkoutTypes) ? user.preferredWorkoutTypes : [],
    preferredDietFocus: user.preferredDietFocus || "",
    avatar: user.avatar,
    vip_status: user.vip_status,
    isVip: user.isVip,
    vipSince: user.vipSince,
    vipPlan: user.vipPlan,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function getMe(userId) {
  const user = await User.findById(userId);
  return toProfile(user);
}

async function updateMe(userId, payload) {
  const allowed = [
    "gender",
    "age",
    "height",
    "weight",
    "targetWeight",
    "goal",
    "activityLevel",
    "preferredWorkoutTypes",
    "preferredDietFocus",
    "heartRate",
    "avatar",
    "username",
  ];

  const update = {};
  allowed.forEach((key) => {
    if (payload[key] !== undefined) update[key] = payload[key];
  });

  if (Array.isArray(update.preferredWorkoutTypes)) {
    update.preferredWorkoutTypes = [...new Set(update.preferredWorkoutTypes.map(String).filter(Boolean))].slice(0, 12);
  }

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true });
  return toProfile(user);
}

async function saveBasicAssessment(userId, payload) {
  const height = Number(payload.height);
  const weight = Number(payload.weight);
  const bmi = payload.bmi != null ? Number(payload.bmi) : calculateBmi(weight, height);

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        gender: payload.gender,
        age: Number(payload.age),
        height,
        weight,
        bmi: Number(bmi.toFixed(1)),
        assessment_completed: true,
      },
    },
    { new: true, runValidators: true }
  );

  return toProfile(user);
}

module.exports = { getMe, updateMe, saveBasicAssessment, toProfile };
