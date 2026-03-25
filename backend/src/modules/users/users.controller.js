const asyncHandler = require("../../utils/asyncHandler");
const usersModel = require("./users.model");

const me = asyncHandler(async (req, res) => {
  const data = await usersModel.getMe(req.user.id);
  if (!data) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json(data);
});

const updateMe = asyncHandler(async (req, res) => {
  const data = await usersModel.updateMe(req.user.id, req.body);
  if (!data) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json(data);
});

module.exports = { me, updateMe };
