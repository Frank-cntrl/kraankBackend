const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { Photo } = require("../database");

// Configure multer for memory storage (we'll upload to Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "krannk-photos",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

// GET /api/photos - Get all photos (with optional userId filter)
router.get("/", async (req, res, next) => {
  try {
    const { userId } = req.query;
    
    const whereClause = userId ? { userId } : {};
    
    const photos = await Photo.findAll({
      where: whereClause,
      order: [["uploadedAt", "DESC"]],
    });
    res.json(photos);
  } catch (error) {
    next(error);
  }
});

// GET /api/photos/latest - Get the most recent photo
router.get("/latest", async (req, res, next) => {
  try {
    const photo = await Photo.findOne({
      order: [["uploadedAt", "DESC"]],
    });

    if (!photo) {
      return res.status(404).json({ message: "No photos found" });
    }

    res.json(photo);
  } catch (error) {
    next(error);
  }
});

// GET /api/photos/latest/:userId - Get the latest photo for a specific user
router.get("/latest/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;

    const photo = await Photo.findOne({
      where: { userId },
      order: [["uploadedAt", "DESC"]],
    });

    if (!photo) {
      return res.status(404).json({ message: "No photos found for this user" });
    }

    res.json(photo);
  } catch (error) {
    next(error);
  }
});

// GET /api/photos/:id - Get a specific photo by ID
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const photo = await Photo.findByPk(id);

    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }

    res.json(photo);
  } catch (error) {
    next(error);
  }
});

// POST /api/photos/upload - Upload a new photo
router.post("/upload", upload.single("image"), async (req, res, next) => {
  try {
    const { userId, caption } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
        photo: null,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
        photo: null,
      });
    }

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer);

    // Create photo record in database
    const photo = await Photo.create({
      userId,
      imageUrl: cloudinaryResult.secure_url,
      cloudinaryPublicId: cloudinaryResult.public_id,
      caption: caption || null,
      uploadedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Photo uploaded successfully",
      photo: {
        id: photo.id,
        userId: photo.userId,
        imageUrl: photo.imageUrl,
        uploadedAt: photo.uploadedAt.toISOString(),
        caption: photo.caption,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload photo",
      photo: null,
    });
  }
});

// DELETE /api/photos/:id - Delete a photo
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const photo = await Photo.findByPk(id);

    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }

    // Delete from Cloudinary if we have the public ID
    if (photo.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(photo.cloudinaryPublicId);
      } catch (cloudinaryError) {
        console.error("Cloudinary delete error:", cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }
    }

    await photo.destroy();

    res.json({ message: "Photo deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
