/**
 * Upload Videos to Cloudinary Script
 * 
 * Uploads all video files from the local downscaled_videos folder
 * to Cloudinary and creates database records.
 * 
 * Usage: node scripts/upload-videos.js
 * 
 * Requires .env file with:
 *   DATABASE_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */

require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
const { db, Video } = require("../database");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Path to the local videos
const VIDEOS_DIR = path.join(
  __dirname,
  "../../Dumb Ass Temp Folders/videosVideos/downscaled_videos"
);

async function uploadVideo(filePath, sortOrder) {
  const fileName = path.basename(filePath, path.extname(filePath));
  console.log(`⬆️  Uploading ${fileName}...`);

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "krannk-videos",
      resource_type: "video",
      public_id: fileName,
      // Cloudinary will handle streaming optimization
      eager: [{ format: "mp4", video_codec: "h264" }],
      eager_async: true,
    });

    console.log(`✅ Uploaded ${fileName} → ${result.secure_url}`);
    return {
      videoUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      title: fileName,
      sortOrder,
    };
  } catch (error) {
    console.error(`❌ Failed to upload ${fileName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🎬 Krannk Video Upload Script");
  console.log("==============================\n");

  // Check videos directory exists
  if (!fs.existsSync(VIDEOS_DIR)) {
    console.error(`❌ Videos directory not found: ${VIDEOS_DIR}`);
    process.exit(1);
  }

  // Get all video files
  const videoFiles = fs
    .readdirSync(VIDEOS_DIR)
    .filter((f) => /\.(mov|mp4|m4v)$/i.test(f))
    .sort((a, b) => {
      // Sort by number in filename
      const numA = parseInt(a.match(/(\d+)/)?.[1] || "0");
      const numB = parseInt(b.match(/(\d+)/)?.[1] || "0");
      return numA - numB;
    });

  console.log(`📁 Found ${videoFiles.length} videos in ${VIDEOS_DIR}\n`);

  // Connect to database
  try {
    await db.authenticate();
    console.log("✅ Database connected");
    await db.sync({ alter: true }); // Ensure video table exists
    console.log("✅ Database synced\n");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }

  // Check if videos already exist
  const existingCount = await Video.count();
  if (existingCount > 0) {
    console.log(`⚠️  Found ${existingCount} existing videos in database.`);
    console.log("   Delete them first if you want to re-upload.");
    console.log("   Continuing will skip already-uploaded videos.\n");
  }

  // Upload each video
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < videoFiles.length; i++) {
    const fileName = videoFiles[i];
    const baseName = path.basename(fileName, path.extname(fileName));
    const filePath = path.join(VIDEOS_DIR, fileName);

    // Check if already in database
    const existing = await Video.findOne({ where: { title: baseName } });
    if (existing) {
      console.log(`⏭️  Skipping ${baseName} (already in database)`);
      skipped++;
      continue;
    }

    const result = await uploadVideo(filePath, i + 1);
    if (result) {
      await Video.create(result);
      uploaded++;
      console.log(`   💾 Saved to database (${uploaded}/${videoFiles.length})\n`);
    } else {
      failed++;
    }

    // Small delay between uploads to avoid rate limiting
    if (i < videoFiles.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log("\n==============================");
  console.log(`🎬 Upload Complete!`);
  console.log(`   ✅ Uploaded: ${uploaded}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📊 Total in DB: ${await Video.count()}`);

  await db.close();
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
