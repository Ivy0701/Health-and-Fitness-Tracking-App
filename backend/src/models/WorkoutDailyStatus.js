const mongoose = require("mongoose");

const workoutDailyStatusSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workout_plan_id: { type: mongoose.Schema.Types.ObjectId, ref: "WorkoutPlan", required: true, index: true },
    date: { type: String, required: true, trim: true },
    is_completed: { type: Boolean, default: false },
    remaining_seconds: { type: Number, min: 0, default: null },
    completed_at: { type: Date, default: null },
  },
  { versionKey: false, timestamps: true }
);

workoutDailyStatusSchema.index({ user_id: 1, workout_plan_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("WorkoutDailyStatus", workoutDailyStatusSchema);
