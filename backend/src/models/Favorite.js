const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemType: { type: String, enum: ["course", "workout", "article", "diet"], required: true },
    itemId: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: "" },
    planType: { type: String, trim: true, default: "" },
    targetCalories: { type: Number, min: 0, default: null },
    description: { type: String, trim: true, default: "" },
    sourceType: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false }
);

favoriteSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);

