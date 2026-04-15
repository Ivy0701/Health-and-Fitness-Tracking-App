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
  const { gender, age, height, weight, targetWeight, targetDays, bmi } = req.body;
  const validGender = ["male", "female", "other", "prefer_not_to_say"];
  if (!validGender.includes(gender)) {
    return res.status(400).json({ message: "gender must be one of: male, female, other, prefer_not_to_say" });
  }

  const parsedAge = Number(age);
  const parsedHeight = Number(height);
  const parsedWeight = Number(weight);
  const parsedTargetWeight = targetWeight == null || targetWeight === "" ? parsedWeight : Number(targetWeight);
  const parsedTargetDays = targetDays == null || targetDays === "" ? 30 : Number(targetDays);

  if (!Number.isInteger(parsedAge) || parsedAge < 5 || parsedAge > 100) {
    return res.status(400).json({ message: "age must be an integer between 5 and 100" });
  }
  if (!Number.isFinite(parsedHeight) || parsedHeight < 120 || parsedHeight > 220) {
    return res.status(400).json({ message: "height must be between 120 and 220" });
  }
  if (!Number.isFinite(parsedWeight) || parsedWeight < 30 || parsedWeight > 150) {
    return res.status(400).json({ message: "weight must be between 30 and 150" });
  }
  if (!Number.isFinite(parsedTargetWeight) || parsedTargetWeight < 30 || parsedTargetWeight > 200) {
    return res.status(400).json({ message: "targetWeight must be between 30 and 200" });
  }
  if (!Number.isInteger(parsedTargetDays) || parsedTargetDays < 7 || parsedTargetDays > 365) {
    return res.status(400).json({ message: "targetDays must be an integer between 7 and 365" });
  }

  const weeks = parsedTargetDays / 7;
  const lossPerWeek = (parsedWeight - parsedTargetWeight) / weeks;
  const gainPerWeek = (parsedTargetWeight - parsedWeight) / weeks;
  if (lossPerWeek > 1.5 || gainPerWeek > 1) {
    return res.status(400).json({ message: "Your goal is too aggressive. Please set a more realistic plan." });
  }

  const data = await usersModel.saveBasicAssessment(req.user.id, {
    gender,
    age: parsedAge,
    height: parsedHeight,
    weight: parsedWeight,
    targetWeight: parsedTargetWeight,
    targetDays: parsedTargetDays,
    bmi,
  });
  if (!data) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json({ message: "Assessment saved successfully.", user: data });
});

module.exports = { me, updateMe, saveAssessment };
