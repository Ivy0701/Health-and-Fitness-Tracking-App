const asyncHandler = require("../../utils/asyncHandler");
const authService = require("./auth.service");

const register = asyncHandler(async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ message: "email, password, username are required" });
  }
  const data = await authService.register({ email, password, username });
  res.status(201).json(data);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }
  const data = await authService.login(email, password);
  res.json(data);
});

const verify = asyncHandler(async (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = { register, login, verify };
