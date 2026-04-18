const mongoose = require("mongoose");

const workoutSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, trim: true },
    duration: { type: Number, required: true, min: 1 },
    caloriesBurned: { type: Number, min: 0, default: 0 },
    date: { type: Date, default: Date.now, index: true },
    note: { type: String, trim: true, default: "" },
    /** When logged from a course day, links the course for cascade delete on drop. */
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Workout", workoutSchema);

