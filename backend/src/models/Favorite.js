const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemType: { type: String, enum: ["course", "workout", "article"], required: true },
    itemId: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: "" },
  },
  { timestamps: true, versionKey: false }
);

favoriteSchema.index({ userId: 1, itemType: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);

