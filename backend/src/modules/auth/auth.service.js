const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authModel = require("./auth.model");

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

async function register(payload) {
  const exists = await authModel.findByEmail(payload.email);
  if (exists) {
    const error = new Error("Email already exists");
    error.status = 400;
    throw error;
  }
  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await authModel.createUser({
    email: payload.email,
    username: payload.username,
    passwordHash
  });
  return { user, token: signToken(user) };
}

async function login(email, password) {
  const user = await authModel.findByEmail(email);
  if (!user) {
    const error = new Error("Invalid credentials");
    error.status = 401;
    throw error;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const error = new Error("Invalid credentials");
    error.status = 401;
    throw error;
  }
  return {
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
    token: signToken(user)
  };
}

module.exports = { register, login };
