const mongoose = require("mongoose");

const scheduleItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("ScheduleItem", scheduleItemSchema);

