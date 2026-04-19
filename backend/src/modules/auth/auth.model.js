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

/** Includes password + reset fields for forgot-password flow. */
async function findByEmailForPasswordReset(email) {
  return User.findOne({ email: String(email).toLowerCase() })
    .select("+password +resetPasswordCode +resetPasswordExpires")
    .exec();
}

async function updateUserById(userId, patch) {
  return User.findByIdAndUpdate(userId, { $set: patch }, { new: true }).exec();
}

async function updatePasswordAndClearReset(userId, passwordHash) {
  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        password: passwordHash,
        resetPasswordCode: null,
        resetPasswordExpires: null,
        resetPasswordCodeUpdatedAt: null,
      },
    },
    { new: true }
  ).exec();
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
  findByEmailForPasswordReset,
  findByUsername,
  findByEmailOrUsername,
  findById,
  createUser,
  updateUserById,
  updatePasswordAndClearReset,
};
