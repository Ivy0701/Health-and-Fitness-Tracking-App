const asyncHandler = require("../../utils/asyncHandler");
const authService = require("./auth.service");
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const register = asyncHandler(async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ message: "email, password, username are required" });
  }
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Please input a valid email address" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }
  const data = await authService.register({ email, password, username });
  res.status(201).json(data);
});

const login = asyncHandler(async (req, res) => {
  const { identifier, email, username, password } = req.body;
  const loginId = identifier || email || username;
  if (!loginId || !password) {
    return res.status(400).json({ message: "identifier (email/username) and password are required" });
  }
  const data = await authService.login(loginId, password);
  res.json(data);
});

const verify = asyncHandler(async (req, res) => {
  res.json({ valid: true, user: req.user });
});

const issueResetVerification = asyncHandler(async (req, res) => {
  const data = await authService.issueResetVerification(req.body?.email);
  res.json(data);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, verificationCode, newPassword, confirmPassword } = req.body;
  const data = await authService.resetPasswordWithCode({
    email,
    verificationCode,
    code,
    newPassword,
    confirmPassword,
  });
  res.json(data);
});

module.exports = { register, login, verify, issueResetVerification, resetPassword };
