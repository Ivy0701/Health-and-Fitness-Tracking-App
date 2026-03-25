const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authModel = require("./auth.model");

function signToken(user) {
  return jwt.sign(
    { id: String(user._id), email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

async function register(payload) {
  const emailExists = await authModel.findByEmail(payload.email);
  if (emailExists) {
    const error = new Error("Email already exists, please use another email");
    error.status = 400;
    throw error;
  }
  const usernameExists = await authModel.findByUsername(payload.username);
  if (usernameExists) {
    const error = new Error("Username already exists, please use another username");
    error.status = 400;
    throw error;
  }
  const passwordHash = await bcrypt.hash(payload.password, 10);
  const createdUser = await authModel.createUser({
    email: payload.email,
    username: payload.username,
    passwordHash
  });
  return { user: authModel.sanitizeUser(createdUser), token: signToken(createdUser) };
}

async function login(identifier, password) {
  const user = await authModel.findByEmailOrUsername(identifier);
  if (!user) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }
  return {
    user: authModel.sanitizeUser(user),
    token: signToken(user)
  };
}

module.exports = { register, login };
