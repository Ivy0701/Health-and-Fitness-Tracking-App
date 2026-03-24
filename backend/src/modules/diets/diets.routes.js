const express = require("express");
const controller = require("./diets.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/recommendations", auth, controller.recommendations);
router.post("/records", auth, controller.addRecord);

module.exports = router;
