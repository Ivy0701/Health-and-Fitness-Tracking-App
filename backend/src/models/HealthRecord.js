const mongoose = require("mongoose");

const healthRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      default: "prefer_not_to_say",
    },
    height: { type: Number, required: true, min: 30, max: 300 },
    weight: { type: Number, required: true, min: 1, max: 600 },
    targetWeight: { type: Number, min: 1, max: 600 },
    bmi: { type: Number, min: 0, max: 100 },
    heartRate: { type: Number, min: 20, max: 260 },
    note: { type: String, trim: true, maxlength: 2000 },
    bodyFat: { type: Number, min: 0, max: 80 },
    bloodPressure: { type: String, trim: true, maxlength: 20 },
    sleepHours: { type: Number, min: 0, max: 24 },
    calorieGoal: { type: Number, min: 0, max: 20000 },
    workoutFrequency: { type: Number, min: 0, max: 14 },
    recordedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

healthRecordSchema.index({ userId: 1, recordedAt: -1 });

module.exports = mongoose.model("HealthRecord", healthRecordSchema);

