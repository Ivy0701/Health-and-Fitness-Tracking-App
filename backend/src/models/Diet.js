const mongoose = require("mongoose");

const dietSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    foodName: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, default: 0 },
    amountInGrams: { type: Number, min: 0, default: 0 },
    unit: { type: String, enum: ["g", "ml", "serving"], default: "g" },
    calories: { type: Number, min: 0, default: 0 },
    protein: { type: Number, min: 0, default: 0 },
    carbs: { type: Number, min: 0, default: 0 },
    fat: { type: Number, min: 0, default: 0 },
    mealType: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"], default: "lunch" },
    date: { type: Date, default: Date.now, index: true },
    note: { type: String, trim: true, default: "" },
    sourceType: { type: String, enum: ["manual", "recommended"], default: "manual" },
    foodId: { type: String, trim: true, default: "" },
    recommendationId: { type: String, trim: true, default: "" },
    /** Stable plan id from PLAN_DEFINITIONS when logged from a recommended plan (optional). */
    dietPlanId: { type: String, trim: true, default: "" },
    planName: { type: String, trim: true, default: "" },
    scheduleItemId: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduleItem", default: null, index: true },
    /** Client local wall time HH:mm for this log (used with date for Schedule diet_log_sync display). */
    recordedTimeLocal: { type: String, trim: true, default: "" },
    recordedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

dietSchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model("Diet", dietSchema);

