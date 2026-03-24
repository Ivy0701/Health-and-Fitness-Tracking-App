const asyncHandler = require("../../utils/asyncHandler");
const usersModel = require("./users.model");

const me = asyncHandler(async (req, res) => {
  const data = await usersModel.getMe(req.user.id);
  res.json(data);
});

const updateMe = asyncHandler(async (req, res) => {
  const data = await usersModel.updateMe(req.user.id, req.body);
  res.json(data);
});

module.exports = { me, updateMe };
