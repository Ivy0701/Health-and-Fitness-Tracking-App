const mongoose = require("mongoose");

const weeklySlotSchema = new mongoose.Schema(
  {
    weekday: { type: Number, min: 0, max: 6, required: true },
    startTime: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    difficulty: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    duration: { type: Number, min: 1, default: 30 },
    category: { type: String, trim: true, default: "fitness" },
    isFeatured: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    weeklySlots: { type: [weeklySlotSchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Course", courseSchema);
