const mongoose = require("mongoose");

const scheduleItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemType: { type: String, trim: true, default: "manual" },
    meal: { type: String, trim: true, default: "" },
    totalCalories: { type: Number, min: 0, default: 0 },
    timestamp: { type: Date, default: null },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true, default: "" },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: "" },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
    linkedDietId: { type: mongoose.Schema.Types.ObjectId, ref: "Diet", default: null, index: true },
    durationMinutes: { type: Number, min: 1, default: 60 },
    overlapAccepted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("ScheduleItem", scheduleItemSchema);
