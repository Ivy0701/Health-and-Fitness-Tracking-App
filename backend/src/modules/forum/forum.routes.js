const express = require("express");
const controller = require("./forum.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/posts", auth, controller.list);
router.post("/posts", auth, controller.create);
router.get("/posts/:id", auth, controller.detail);
router.delete("/posts/:id", auth, controller.remove);
router.patch("/posts/:id/like", auth, controller.toggleLike);
router.post("/posts/:id/comments", auth, controller.addComment);
router.put("/posts/:id/comments/:commentId", auth, controller.updateComment);
router.delete("/posts/:id/comments/:commentId", auth, controller.deleteComment);

module.exports = router;

