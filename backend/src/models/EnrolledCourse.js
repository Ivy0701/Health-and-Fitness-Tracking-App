const mongoose = require("mongoose");

const enrolledCourseSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course_id: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    enrolled_at: { type: Date, default: Date.now },
    start_date: { type: String, required: true, trim: true },
    current_day: { type: Number, min: 1, default: 1 },
    is_completed: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "completed", "cancelled"], default: "active", index: true },
  },
  { versionKey: false, timestamps: true }
);

enrolledCourseSchema.index({ user_id: 1, course_id: 1 }, { unique: true });

module.exports = mongoose.model("EnrolledCourse", enrolledCourseSchema);
