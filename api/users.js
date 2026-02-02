const express = require("express");
const router = express.Router();
const { User, Photo } = require("../database");

// GET /api/users - Get all users
router.get("/", async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "username", "email", "createdAt"],
    });

    const formattedUsers = users.map((user) => ({
      id: user.id.toString(),
      username: user.username,
      displayName: user.username, // Using username as displayName for now
    }));

    res.json(formattedUsers);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id - Get a specific user by ID
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try to find by numeric ID first, then by username
    let user = await User.findByPk(id);

    if (!user) {
      // Try to find by username (since frontend uses string IDs like "frank", "keily")
      user = await User.findOne({ where: { username: id } });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user.id.toString(),
      username: user.username,
      displayName: user.username,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:userId/photos - Get all photos for a specific user
router.get("/:userId/photos", async (req, res, next) => {
  try {
    const { userId } = req.params;

    const photos = await Photo.findAll({
      where: { userId },
      order: [["uploadedAt", "DESC"]],
    });

    const formattedPhotos = photos.map((photo) => ({
      id: photo.id,
      userId: photo.userId,
      imageUrl: photo.imageUrl,
      uploadedAt: photo.uploadedAt.toISOString(),
      caption: photo.caption,
    }));

    res.json(formattedPhotos);
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Create a new user (simple registration)
router.post("/", async (req, res, next) => {
  try {
    const { username, email } = req.body;

    if (!username) {
      return res.status(400).json({ message: "Username is required" });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const user = await User.create({
      username,
      email: email || null,
    });

    res.status(201).json({
      id: user.id.toString(),
      username: user.username,
      displayName: user.username,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
