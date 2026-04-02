const User = require("../../models/User");

function sanitizeUser(user) {
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
    avatar: user.avatar,
    vip_status: user.vip_status,
    isVip: user.isVip,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function findByEmail(email) {
  return User.findOne({ email: String(email).toLowerCase() });
}

async function findByUsername(username) {
  return User.findOne({ username });
}

async function findByEmailOrUsername(identifier) {
  return User.findOne({
    $or: [{ email: String(identifier).toLowerCase() }, { username: identifier }],
  });
}

async function findById(id) {
  return User.findById(id);
}

async function createUser({ email, passwordHash, username }) {
  const user = await User.create({
    email: String(email).toLowerCase(),
    username,
    password: passwordHash,
  });
  return user;
}

module.exports = {
  sanitizeUser,
  findByEmail,
  findByUsername,
  findByEmailOrUsername,
  findById,
  createUser,
};
