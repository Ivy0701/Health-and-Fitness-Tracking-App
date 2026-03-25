const asyncHandler = require("../../utils/asyncHandler");
const HealthRecord = require("../../models/HealthRecord");
const User = require("../../models/User");
const { calculateBmi } = require("../../utils/bmi.util");

const save = asyncHandler(async (req, res) => {
  const {
    gender,
    height,
    weight,
    targetWeight,
    bmi: inputBmi,
    heartRate,
    note,
    recordedAt,
  } = req.body;

  if (height == null || weight == null) {
    return res.status(400).json({ message: "height and weight are required" });
  }

  const bmi = inputBmi ?? calculateBmi(weight, height);
  const record = await HealthRecord.create({
    userId: req.user.id,
    gender,
    height,
    weight,
    targetWeight,
    bmi,
    heartRate,
    note,
    recordedAt: recordedAt || new Date(),
  });

  await User.findByIdAndUpdate(req.user.id, {
    $set: {
      gender: gender ?? undefined,
      height,
      weight,
      targetWeight,
      bmi,
      heartRate,
    },
  });

  res.status(201).json(record);
});

const history = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requesterId = String(req.user.id);
  if (String(userId) !== requesterId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const rows = await HealthRecord.find({ userId }).sort({ recordedAt: -1, createdAt: -1 });
  res.json(rows);
});

module.exports = { save, history };

