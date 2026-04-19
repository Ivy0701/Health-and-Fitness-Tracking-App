const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authModel = require("./auth.model");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const RESET_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateResetVerificationCode() {
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += RESET_CODE_ALPHABET[crypto.randomInt(0, RESET_CODE_ALPHABET.length)];
  }
  return out;
}

/** Issue or refresh an on-page verification code (no email). */
async function issueResetVerification(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!email || !emailRegex.test(email)) {
    const err = new Error("Please enter your email.");
    err.status = 400;
    throw err;
  }
  const user = await authModel.findByEmail(email);
  if (!user) {
    const err = new Error("No account found with this email address.");
    err.status = 404;
    throw err;
  }
  const code = generateResetVerificationCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await authModel.updateUserById(user._id, {
    resetPasswordCode: code,
    resetPasswordExpires: expiresAt,
    resetPasswordCodeUpdatedAt: new Date(),
  });
  return { verificationCode: code };
}

async function resetPasswordWithCode({ email, verificationCode, code, newPassword, confirmPassword }) {
  const emailNorm = String(email || "").trim().toLowerCase();
  if (!emailNorm || !emailRegex.test(emailNorm)) {
    const err = new Error("Please enter your email.");
    err.status = 400;
    throw err;
  }

  const codeStr = String(verificationCode ?? code ?? "").trim();
  if (!codeStr) {
    const err = new Error("Invalid verification code.");
    err.status = 400;
    throw err;
  }

  const p1 = newPassword != null ? String(newPassword) : "";
  const p2 = confirmPassword != null ? String(confirmPassword) : "";

  if (!p1 || p1.length < 8) {
    const err = new Error("Password must be at least 8 characters.");
    err.status = 400;
    throw err;
  }
  if (p1 !== p2) {
    const err = new Error("Passwords do not match.");
    err.status = 400;
    throw err;
  }

  const user = await authModel.findByEmailForPasswordReset(emailNorm);
  if (!user) {
    const err = new Error("No account found with this email address.");
    err.status = 404;
    throw err;
  }
  if (!user.resetPasswordCode || !user.resetPasswordExpires) {
    const err = new Error("Invalid verification code.");
    err.status = 400;
    throw err;
  }
  if (new Date() > new Date(user.resetPasswordExpires)) {
    const err = new Error("Verification code expired.");
    err.status = 400;
    throw err;
  }
  if (String(user.resetPasswordCode).toUpperCase() !== codeStr.toUpperCase()) {
    const err = new Error("Invalid verification code.");
    err.status = 400;
    throw err;
  }

  const sameAsOld = await bcrypt.compare(p1, user.password);
  if (sameAsOld) {
    const err = new Error("New password cannot be the same as your current password.");
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(p1, 10);
  await authModel.updatePasswordAndClearReset(user._id, passwordHash);
  return { message: "Password reset successfully. Please sign in with your new password." };
}

module.exports = { register, login, issueResetVerification, resetPasswordWithCode };
