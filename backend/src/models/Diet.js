const mongoose = require("mongoose");

const dietSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    foodName: { type: String, required: true, trim: true },
    calories: { type: Number, min: 0, default: 0 },
    mealType: { type: String, enum: ["breakfast", "lunch", "dinner", "snack"], default: "lunch" },
    date: { type: Date, default: Date.now, index: true },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Diet", dietSchema);

