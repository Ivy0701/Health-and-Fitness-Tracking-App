const bcrypt = require("bcryptjs");
const User = require("../models/User");

const TEST_ACCOUNTS = [
  {
    username: "testuser1",
    email: "test1@example.com",
    password: "Test1234",
  },
  {
    username: "testuser2",
    email: "test2@example.com",
    password: "Test5678",
  },
];

async function ensureTestAccount(account) {
  const hashed = await bcrypt.hash(account.password, 10);
  const existing = await User.findOne({ email: account.email });

  if (!existing) {
    await User.create({
      username: account.username,
      email: account.email,
      password: hashed,
      gender: "prefer_not_to_say",
      activityLevel: "moderate",
      vipPlan: "none",
    });
    return;
  }

  // Keep idempotent behavior and avoid duplicate insertions.
  // Refresh password to guarantee test login works in every environment.
  existing.password = hashed;
  if (!existing.username) existing.username = account.username;
  await existing.save();
}

async function initTestAccounts() {
  for (const account of TEST_ACCOUNTS) {
    await ensureTestAccount(account);
  }
}

module.exports = initTestAccounts;

