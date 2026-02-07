const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const sharp = require("sharp");
const { Photo, Streak, DeviceToken } = require("../database");
const { sendPushNotification } = require("../services/notifications");

// Image resize settings
const MAX_WIDTH = 1200;  // Max width for photos
const MAX_HEIGHT = 1200; // Max height for photos
const JPEG_QUALITY = 85; // Quality for JPEG compression

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

// Helper function to resize image
const resizeImage = async (buffer) => {
  try {
    const resizedBuffer = await sharp(buffer)
      .rotate() // Auto-rotate based on EXIF orientation
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',           // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true // Don't upscale small images
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    
    return resizedBuffer;
  } catch (error) {
    console.error('Error resizing image:', error);
    // Return original buffer if resize fails
    return buffer;
  }
};

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

// Helper: Check if both users uploaded within the streak window
function bothUploadedRecently(streak) {
  if (!streak.lastFrankUpload || !streak.lastKeilyUpload) return false;
  
  const now = new Date();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  
  const frankRecent = new Date(streak.lastFrankUpload) > twentyFourHoursAgo;
  const keilyRecent = new Date(streak.lastKeilyUpload) > twentyFourHoursAgo;
  
  return frankRecent && keilyRecent;
}

// Helper function to update streak after photo upload
async function updateStreak(userId) {
  const normalizedUserId = userId.toLowerCase();
  
  // Get or create streak
  let streak = await Streak.findOne();
  if (!streak) {
    streak = await Streak.create({
      currentStreak: 0,
      longestStreak: 0,
      isActive: false,
    });
  }
  
  const now = new Date();
  
  // Check if streak expired
  if (streak.streakExpiresAt && now > new Date(streak.streakExpiresAt)) {
    await streak.update({
      currentStreak: 0,
      isActive: false,
      streakExpiresAt: null,
    });
  }
  
  // Update the user's last upload time
  const updateData = {};
  if (normalizedUserId === "frank") {
    updateData.lastFrankUpload = now;
  } else {
    updateData.lastKeilyUpload = now;
  }
  
  await streak.update(updateData);
  await streak.reload();
  
  // Get today's date as a string (YYYY-MM-DD) for tracking daily increments
  const today = now.toISOString().split('T')[0];
  const alreadyIncrementedToday = streak.lastStreakIncrementDate === today;
  
  // Check if both users have now uploaded within 24 hours
  if (bothUploadedRecently(streak) && !alreadyIncrementedToday) {
    if (!streak.isActive) {
      // Start new streak
      const frankUpload = new Date(streak.lastFrankUpload);
      const keilyUpload = new Date(streak.lastKeilyUpload);
      const earlierUpload = frankUpload < keilyUpload ? frankUpload : keilyUpload;
      
      await streak.update({
        currentStreak: 1,
        longestStreak: Math.max(streak.longestStreak, 1),
        isActive: true,
        streakStartDate: earlierUpload,
        streakExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        lastStreakIncrementDate: today,
      });
    } else {
      // Increment streak (only once per day)
      const newStreak = streak.currentStreak + 1;
      await streak.update({
        currentStreak: newStreak,
        longestStreak: Math.max(streak.longestStreak, newStreak),
        streakExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        lastStreakIncrementDate: today,
      });
    }
  } else if (bothUploadedRecently(streak) && alreadyIncrementedToday) {
    // Both uploaded but already counted today - just extend the expiry
    await streak.update({
      streakExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
  } else if (!streak.isActive) {
    // One person uploaded, set expiry
    const lastUpload = streak.lastFrankUpload || streak.lastKeilyUpload;
    await streak.update({
      streakExpiresAt: new Date(new Date(lastUpload).getTime() + 24 * 60 * 60 * 1000),
    });
  }
  
  // Send notification to the other user
  const otherUser = normalizedUserId === "frank" ? "keily" : "frank";
  const displayName = normalizedUserId === "frank" ? "Frank" : "Keily";
  
  console.log(`📸 Photo uploaded by ${displayName}, sending notification to ${otherUser}...`);
  
  try {
    const notifResult = await sendPushNotification(
      otherUser,
      "📸 New Photo!",
      `${displayName} just uploaded a photo for you! 💕`
    );
    console.log(`📸 Notification result for ${otherUser}:`, JSON.stringify(notifResult));
  } catch (notifError) {
    console.error("Failed to send notification:", notifError);
  }
}

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

    // Resize image before uploading
    const resizedBuffer = await resizeImage(req.file.buffer);

    // Upload resized image to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(resizedBuffer);

    // Create photo record in database
    const photo = await Photo.create({
      userId,
      imageUrl: cloudinaryResult.secure_url,
      cloudinaryPublicId: cloudinaryResult.public_id,
      caption: caption || null,
      uploadedAt: new Date(),
    });

    // Update streak
    try {
      await updateStreak(userId);
    } catch (streakError) {
      console.error("Failed to update streak:", streakError);
      // Don't fail the upload if streak update fails
    }

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
