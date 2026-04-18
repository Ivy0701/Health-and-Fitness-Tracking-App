const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 40,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      default: "prefer_not_to_say",
    },
    age: { type: Number, min: 1, max: 130 },
    height: { type: Number, min: 30, max: 300 },
    weight: { type: Number, min: 1, max: 600 },
    targetWeight: { type: Number, min: 1, max: 600 },
    targetDays: { type: Number, min: 1, max: 3650 },
    bmi: { type: Number, min: 0, max: 100 },
    heartRate: { type: Number, min: 20, max: 260 },
    goal: { type: String, trim: true, maxlength: 200 },
    activityLevel: {
      type: String,
      enum: ["sedentary", "light", "moderate", "active", "very_active"],
      default: "moderate",
    },
    preferredWorkoutTypes: {
      type: [String],
      default: [],
    },
    preferredDietFocus: { type: String, trim: true, maxlength: 80, default: "" },
    avatar: { type: String, trim: true },
    isVip: { type: Boolean, default: false },
    vip_status: { type: Boolean, default: false },
    vipSince: { type: Date },
    vipEndAt: { type: Date, default: null },
    vipPlan: { type: String, enum: ["none", "monthly", "yearly"], default: "none" },
    refundStatus: { type: String, enum: ["none", "pending", "approved", "rejected"], default: "none" },
    refundReason: { type: String, trim: true, maxlength: 500, default: "" },
    refundNote: { type: String, trim: true, maxlength: 1000, default: "" },
    refundRequestedAt: { type: Date, default: null },
    refundReviewedAt: { type: Date, default: null },
    refundReviewedBy: { type: String, trim: true, maxlength: 120, default: "" },
    /** Admin-only note shown to user when a refund request is rejected (or optional message on approve). */
    refundAdminNote: { type: String, trim: true, maxlength: 1000, default: "" },
    bodyFat: { type: Number, min: 0, max: 80 },
    bloodPressure: { type: String, trim: true, maxlength: 20 },
    sleepHours: { type: Number, min: 0, max: 24 },
    calorieGoal: { type: Number, min: 0, max: 20000 },
    workoutFrequency: { type: Number, min: 0, max: 14 },
    assessment_completed: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.index({ username: 1 });

module.exports = mongoose.model("User", userSchema);

