const HealthRecord = require("../../models/HealthRecord");
const User = require("../../models/User");

async function createAssessment(userId, payload) {
  const record = await HealthRecord.create({
    userId,
    gender: payload.gender,
    height: payload.height_cm,
    weight: payload.weight_kg,
    targetWeight: payload.target_weight_kg,
    bmi: payload.bmi,
    heartRate: payload.heart_rate || payload.heartRate,
    note: payload.note || "",
    recordedAt: payload.recordedAt || new Date(),
  });

  await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        gender: payload.gender,
        age: payload.age,
        height: payload.height_cm,
        weight: payload.weight_kg,
        targetWeight: payload.target_weight_kg,
        bmi: payload.bmi,
        heartRate: payload.heart_rate || payload.heartRate,
      },
    },
    { new: false }
  );

  return record;
}

async function getLatestAssessment(userId) {
  return HealthRecord.findOne({ userId }).sort({ recordedAt: -1, createdAt: -1 });
}

module.exports = { createAssessment, getLatestAssessment };
