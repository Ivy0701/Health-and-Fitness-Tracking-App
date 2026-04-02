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

const saveAssessment = asyncHandler(async (req, res) => {
  const { gender, age, height, weight, bmi } = req.body;
  const validGender = ["male", "female", "other", "prefer_not_to_say"];
  if (!validGender.includes(gender)) {
    return res.status(400).json({ message: "gender must be one of: male, female, other, prefer_not_to_say" });
  }

  const parsedAge = Number(age);
  const parsedHeight = Number(height);
  const parsedWeight = Number(weight);

  if (!Number.isInteger(parsedAge) || parsedAge < 5 || parsedAge > 100) {
    return res.status(400).json({ message: "age must be an integer between 5 and 100" });
  }
  if (!Number.isFinite(parsedHeight) || parsedHeight < 120 || parsedHeight > 220) {
    return res.status(400).json({ message: "height must be between 120 and 220" });
  }
  if (!Number.isFinite(parsedWeight) || parsedWeight < 30 || parsedWeight > 150) {
    return res.status(400).json({ message: "weight must be between 30 and 150" });
  }

  const data = await usersModel.saveBasicAssessment(req.user.id, {
    gender,
    age: parsedAge,
    height: parsedHeight,
    weight: parsedWeight,
    bmi,
  });
  if (!data) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json({ message: "Assessment saved successfully.", user: data });
});

module.exports = { me, updateMe, saveAssessment };
