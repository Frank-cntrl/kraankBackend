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

// POST /api/videos/seed - One-time seed from Cloudinary URLs
router.post("/seed", async (req, res, next) => {
  try {
    const existing = await Video.count();
    if (existing > 0) {
      return res.json({ message: `Already seeded (${existing} videos exist)` });
    }

    const videos = req.body;
    if (!Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({ message: "Provide an array of video objects" });
    }

    const created = await Video.bulkCreate(videos);
    res.json({ message: `Seeded ${created.length} videos` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
