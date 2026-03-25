const asyncHandler = require("../../utils/asyncHandler");
const Course = require("../../models/Course");

const list = asyncHandler(async (req, res) => {
  const rows = await Course.find().sort({ createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { title, description, difficulty, duration, category, isFeatured } = req.body;
  if (!title) return res.status(400).json({ message: "title is required" });
  const row = await Course.create({ title, description, difficulty, duration, category, isFeatured });
  res.status(201).json(row);
});

const detail = asyncHandler(async (req, res) => {
  const row = await Course.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Course not found" });
  res.json(row);
});

module.exports = { list, create, detail };

