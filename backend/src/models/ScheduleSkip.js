const mongoose = require("mongoose");

const scheduleSkipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true, trim: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkoutPlan", default: null, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null, index: true },
  },
  { versionKey: false, timestamps: true }
);

scheduleSkipSchema.index({ userId: 1, date: 1, planId: 1 });
scheduleSkipSchema.index({ userId: 1, date: 1, courseId: 1 });

module.exports = mongoose.model("ScheduleSkip", scheduleSkipSchema);
