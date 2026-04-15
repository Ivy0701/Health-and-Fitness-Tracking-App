const express = require("express");
const controller = require("./diets.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/foods/search", auth, controller.searchFoods);
router.get("/:userId/overview", auth, controller.getOverview);
router.get("/:userId", auth, controller.list);
router.post("/", auth, controller.create);
router.put("/:id", auth, controller.update);
router.delete("/:id", auth, controller.remove);

module.exports = router;
