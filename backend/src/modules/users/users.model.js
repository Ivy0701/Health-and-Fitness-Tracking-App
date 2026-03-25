const User = require("../../models/User");

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
    heartRate: user.heartRate,
    goal: user.goal,
    activityLevel: user.activityLevel,
    avatar: user.avatar,
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
    "heartRate",
    "avatar",
    "username",
  ];

  const update = {};
  allowed.forEach((key) => {
    if (payload[key] !== undefined) update[key] = payload[key];
  });

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true });
  return toProfile(user);
}

module.exports = { getMe, updateMe, toProfile };
