const mongoose = require("mongoose");

const workoutPlanSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    exercise_name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    duration_per_day: { type: Number, required: true, min: 1 },
    days: { type: Number, required: true, min: 1, max: 30 },
    is_custom: { type: Boolean, default: false },
    start_date: { type: Date, default: Date.now, index: true },
    fixed_time: { type: String, default: "07:00" },
    note: { type: String, default: "" },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model("WorkoutPlan", workoutPlanSchema);
