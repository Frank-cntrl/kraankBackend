const express = require("express");
const router = express.Router();
const { Streak, DeviceToken } = require("../database");
const { sendPushNotification } = require("../services/notifications");

// Helper: Get or create the streak record (singleton for the couple)
async function getOrCreateStreak() {
  let streak = await Streak.findOne();
  if (!streak) {
    streak = await Streak.create({
      currentStreak: 0,
      longestStreak: 0,
      isActive: false,
    });
  }
  return streak;
}

// Helper: Calculate hours until streak expires
function getHoursUntilExpiry(expiresAt) {
  if (!expiresAt) return null;
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry - now;
  return diffMs / (1000 * 60 * 60); // Convert to hours
}

// Helper: Check if both users uploaded within the streak window
function bothUploadedToday(streak) {
  if (!streak.lastFrankUpload || !streak.lastKeilyUpload) return false;
  
  const now = new Date();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  
  const frankRecent = new Date(streak.lastFrankUpload) > twentyFourHoursAgo;
  const keilyRecent = new Date(streak.lastKeilyUpload) > twentyFourHoursAgo;
  
  return frankRecent && keilyRecent;
}

// GET /api/streak - Get current streak info
router.get("/", async (req, res, next) => {
  try {
    const streak = await getOrCreateStreak();
    
    // Check if streak has expired
    if (streak.streakExpiresAt && new Date() > new Date(streak.streakExpiresAt)) {
      // Streak expired - reset it
      await streak.update({
        currentStreak: 0,
        isActive: false,
        streakExpiresAt: null,
      });
    }
    
    const hoursUntilExpiry = getHoursUntilExpiry(streak.streakExpiresAt);
    
    res.json({
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastFrankUpload: streak.lastFrankUpload,
      lastKeilyUpload: streak.lastKeilyUpload,
      streakStartDate: streak.streakStartDate,
      streakExpiresAt: streak.streakExpiresAt,
      hoursUntilExpiry: hoursUntilExpiry ? Math.max(0, hoursUntilExpiry) : null,
      isActive: streak.isActive,
      frankUploadedToday: streak.lastFrankUpload ? 
        new Date(streak.lastFrankUpload) > new Date(Date.now() - 24 * 60 * 60 * 1000) : false,
      keilyUploadedToday: streak.lastKeilyUpload ? 
        new Date(streak.lastKeilyUpload) > new Date(Date.now() - 24 * 60 * 60 * 1000) : false,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/streak/upload - Record an upload and update streak
router.post("/upload", async (req, res, next) => {
  try {
    const { userId } = req.body;
    
    if (!userId || !["frank", "keily"].includes(userId.toLowerCase())) {
      return res.status(400).json({ error: "Invalid userId. Must be 'frank' or 'keily'" });
    }
    
    const normalizedUserId = userId.toLowerCase();
    const streak = await getOrCreateStreak();
    const now = new Date();
    
    // Update the user's last upload time
    const updateData = {};
    if (normalizedUserId === "frank") {
      updateData.lastFrankUpload = now;
    } else {
      updateData.lastKeilyUpload = now;
    }
    
    await streak.update(updateData);
    await streak.reload();
    
    // Get today's date as a string (YYYY-MM-DD)
    const today = now.toISOString().split('T')[0];
    const alreadyIncrementedToday = streak.lastStreakIncrementDate === today;
    
    // Check if both users have now uploaded within 24 hours
    if (bothUploadedToday(streak) && !alreadyIncrementedToday) {
      // Calculate when the streak window started (the earlier of the two uploads)
      const frankUpload = new Date(streak.lastFrankUpload);
      const keilyUpload = new Date(streak.lastKeilyUpload);
      const earlierUpload = frankUpload < keilyUpload ? frankUpload : keilyUpload;
      
      // If streak wasn't active, start a new streak
      if (!streak.isActive) {
        await streak.update({
          currentStreak: 1,
          isActive: true,
          streakStartDate: earlierUpload,
          streakExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours from now
          lastStreakIncrementDate: today,
        });
      } else {
        // Increment streak and extend expiry (only once per day)
        const newStreak = streak.currentStreak + 1;
        await streak.update({
          currentStreak: newStreak,
          longestStreak: Math.max(streak.longestStreak, newStreak),
          streakExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          lastStreakIncrementDate: today,
        });
      }
    } else if (bothUploadedToday(streak) && alreadyIncrementedToday) {
      // Both uploaded but already counted today - just extend the expiry
      await streak.update({
        streakExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
    } else if (!streak.isActive && (streak.lastFrankUpload || streak.lastKeilyUpload)) {
      // One person uploaded, set expiry for when they need the other to upload
      const lastUpload = streak.lastFrankUpload || streak.lastKeilyUpload;
      await streak.update({
        streakExpiresAt: new Date(new Date(lastUpload).getTime() + 24 * 60 * 60 * 1000),
      });
    }
    
    await streak.reload();
    
    // Send notification to the other user
    const otherUser = normalizedUserId === "frank" ? "keily" : "frank";
    const displayName = normalizedUserId === "frank" ? "Frank" : "Keily";
    
    try {
      await sendPushNotification(
        otherUser,
        "📸 New Photo!",
        `${displayName} just uploaded a photo for you! 💕`
      );
    } catch (notifError) {
      console.error("Failed to send notification:", notifError);
    }
    
    res.json({
      success: true,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      streakExpiresAt: streak.streakExpiresAt,
      isActive: streak.isActive,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/streak/register-device - Register device for push notifications
router.post("/register-device", async (req, res, next) => {
  try {
    const { userId, token, platform = "ios" } = req.body;
    
    if (!userId || !token) {
      return res.status(400).json({ error: "userId and token are required" });
    }
    
    // The app re-registers its token on every launch, so treat each call as
    // an "app opened" event and stamp the time + approximate location.
    const header = (name) => {
      const value = req.headers[name];
      return value ? decodeURIComponent(value) : null;
    };
    const forwarded = req.headers["x-forwarded-for"];
    const openInfo = {
      lastOpenedAt: new Date(),
      lastCity: header("x-vercel-ip-city"),
      lastRegion: header("x-vercel-ip-country-region"),
      lastCountry: header("x-vercel-ip-country"),
      lastIp: forwarded ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress || null,
    };

    // Upsert the device token
    const [deviceToken, created] = await DeviceToken.findOrCreate({
      where: { userId: userId.toLowerCase(), token },
      defaults: { platform, isActive: true, ...openInfo, openCount: 1 },
    });

    if (!created) {
      await deviceToken.update({
        isActive: true,
        platform,
        ...openInfo,
        openCount: (deviceToken.openCount || 0) + 1,
      });
    }

    res.json({ success: true, message: "Device registered for notifications" });
  } catch (error) {
    next(error);
  }
});

// POST /api/streak/unregister-device - Unregister device from push notifications
router.post("/unregister-device", async (req, res, next) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }
    
    await DeviceToken.update(
      { isActive: false },
      { where: { token } }
    );
    
    res.json({ success: true, message: "Device unregistered from notifications" });
  } catch (error) {
    next(error);
  }
});

// GET /api/streak/devices - Debug: List registered devices
router.get("/devices", async (req, res, next) => {
  try {
    const devices = await DeviceToken.findAll({
      attributes: ['userId', 'platform', 'isActive', 'createdAt'],
    });
    
    res.json({
      count: devices.length,
      devices: devices.map(d => ({
        userId: d.userId,
        platform: d.platform,
        isActive: d.isActive,
        createdAt: d.createdAt,
        tokenPreview: '(hidden for security)'
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Format a date as readable Eastern time, e.g. "Oct 8, 2026 at 3:45 PM EDT"
function easternTime(date) {
  if (!date) return "never";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(date));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.month} ${p.day}, ${p.year} at ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`;
}

// Short "how long ago" string, e.g. "3 hours ago"
function timeAgo(date) {
  if (!date) return "never";
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, size] of units) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return `${value} ${name}${value === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

// GET /api/streak/opens - When did each user last open the app?
// Derived from device-token re-registration, which fires on every launch.
router.get("/opens", async (req, res, next) => {
  try {
    const devices = await DeviceToken.findAll({
      where: { isActive: true },
      order: [["lastOpenedAt", "DESC"]],
    });

    const place = (d) =>
      [d.lastCity, d.lastRegion, d.lastCountry].filter(Boolean).join(", ") || "unknown";

    // Most recent open per user
    const byUser = {};
    for (const d of devices) {
      const user = d.userId;
      if (!d.lastOpenedAt) continue;
      if (!byUser[user] || d.lastOpenedAt > new Date(byUser[user]._raw)) {
        byUser[user] = {
          lastOpened: easternTime(d.lastOpenedAt),
          when: timeAgo(d.lastOpenedAt),
          location: place(d),
          totalOpens: d.openCount,
          _raw: d.lastOpenedAt,
        };
      }
    }

    // Build a clean per-user summary
    const summary = {};
    for (const user of Object.keys(byUser)) {
      const { _raw, ...rest } = byUser[user];
      summary[user] = rest;
    }
    for (const user of ["frank", "keily"]) {
      if (!summary[user]) {
        summary[user] = { lastOpened: "never", when: "never", location: "unknown", totalOpens: 0 };
      }
    }

    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// POST /api/streak/test-notification - Debug: Send a test notification
router.post("/test-notification", async (req, res, next) => {
  try {
    const { userId, title, body } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }
    
    const result = await sendPushNotification(
      userId,
      title || "🧪 Test Notification",
      body || "If you see this, push notifications are working!",
      { type: "custom" }
    );
    
    res.json({ success: true, result });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
