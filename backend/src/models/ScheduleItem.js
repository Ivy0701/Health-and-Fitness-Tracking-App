const mongoose = require("mongoose");

const scheduleItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemType: { type: String, trim: true, default: "manual" },
    category: { type: String, trim: true, default: "" },
    meal: { type: String, trim: true, default: "" },
    totalCalories: { type: Number, min: 0, default: 0 },
    timestamp: { type: Date, default: null },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: "" },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkoutPlan", default: null, index: true },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: "" },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    linkedDietId: { type: mongoose.Schema.Types.ObjectId, ref: "Diet", default: null, index: true },
    durationMinutes: { type: Number, min: 1, default: 60 },
    overlapAccepted: { type: Boolean, default: false },
    is_completed: { type: Boolean, default: false },
    completed_at: { type: Date, default: null },
    /** Human-readable diet plan name (e.g. "Hot Meal Plans") when itemType is diet */
    planName: { type: String, trim: true, default: "" },
    /** Stable id from PLAN_DEFINITIONS (e.g. "hot") for diet_plan_apply rows */
    dietPlanId: { type: String, trim: true, default: "" },
    /** diet_plan_apply | diet_log_sync | manual | "" */
    scheduleSource: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("ScheduleItem", scheduleItemSchema);
