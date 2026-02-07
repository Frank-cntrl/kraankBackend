const express = require("express");
const router = express.Router();
const { Video } = require("../database");

// GET /api/videos - Get all videos
router.get("/", async (req, res, next) => {
  try {
    const videos = await Video.findAll({
      order: [["sortOrder", "ASC"]],
    });
    res.json(videos);
  } catch (error) {
    next(error);
  }
});

// GET /api/videos/:id - Get a specific video
router.get("/:id", async (req, res, next) => {
  try {
    const video = await Video.findByPk(req.params.id);
    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }
    res.json(video);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
