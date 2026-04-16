const mongoose = require("mongoose");

const courseExerciseSchema = new mongoose.Schema(
  {
    exercise_id: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["time", "reps", "hold"], default: "time" },
    duration_minutes: { type: Number, min: 0, default: 0 },
    reps: { type: Number, min: 0, default: 0 },
    hold_seconds: { type: Number, min: 0, default: 0 },
    estimated_burn: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["not_started", "in_progress", "completed"], default: "not_started" },
  },
  { _id: false }
);

const courseDailyProgressSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    enrolled_course_id: { type: mongoose.Schema.Types.ObjectId, ref: "EnrolledCourse", required: true, index: true },
    date: { type: String, required: true, trim: true },
    status: { type: String, enum: ["not_started", "in_progress", "completed"], default: "not_started" },
    exercises: { type: [courseExerciseSchema], default: [] },
    is_completed: { type: Boolean, default: false },
    completed_at: { type: Date, default: null },
  },
  { versionKey: false, timestamps: true }
);

courseDailyProgressSchema.index({ user_id: 1, enrolled_course_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("CourseDailyProgress", courseDailyProgressSchema);
