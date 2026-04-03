const mongoose = require("mongoose");

const courseDailyProgressSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    enrolled_course_id: { type: mongoose.Schema.Types.ObjectId, ref: "EnrolledCourse", required: true, index: true },
    date: { type: String, required: true, trim: true },
    is_completed: { type: Boolean, default: false },
    completed_at: { type: Date, default: null },
  },
  { versionKey: false, timestamps: true }
);

courseDailyProgressSchema.index({ user_id: 1, enrolled_course_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("CourseDailyProgress", courseDailyProgressSchema);
