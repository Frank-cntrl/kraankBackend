const apn = require("apn");
const { DeviceToken } = require("../database");

// APNs provider configuration
let apnProvider = null;

function getApnProvider() {
  if (!apnProvider && process.env.APN_KEY_ID && process.env.APN_TEAM_ID) {
    try {
      // Support both file path and base64-encoded key
      let keyConfig;
      
      if (process.env.APN_KEY_BASE64) {
        // Decode base64 key
        const keyBuffer = Buffer.from(process.env.APN_KEY_BASE64, 'base64');
        keyConfig = {
          key: keyBuffer.toString('utf8'),
          keyId: process.env.APN_KEY_ID,
          teamId: process.env.APN_TEAM_ID,
        };
      } else if (process.env.APN_KEY_PATH) {
        keyConfig = {
          key: process.env.APN_KEY_PATH,
          keyId: process.env.APN_KEY_ID,
          teamId: process.env.APN_TEAM_ID,
        };
      } else {
        console.log("No APNs key configured - notifications will be mocked");
        return null;
      }
      
      apnProvider = new apn.Provider({
        token: keyConfig,
        production: process.env.NODE_ENV === "production",
      });
    } catch (error) {
      console.error("Failed to initialize APNs provider:", error);
    }
  }
  return apnProvider;
}

/**
 * Send a push notification to a user
 * @param {string} userId - The user to send to ('frank' or 'keily')
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional additional data
 */
async function sendPushNotification(userId, title, body, data = {}) {
  const provider = getApnProvider();
  
  if (!provider) {
    console.log(`[Mock Notification] To: ${userId}, Title: ${title}, Body: ${body}`);
    return { sent: 0, failed: 0, mock: true };
  }
  
  // Get active device tokens for the user
  const deviceTokens = await DeviceToken.findAll({
    where: { userId: userId.toLowerCase(), isActive: true },
  });
  
  if (deviceTokens.length === 0) {
    console.log(`No device tokens found for user: ${userId}`);
    return { sent: 0, failed: 0 };
  }
  
  // Create the notification
  const notification = new apn.Notification();
  notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  notification.badge = 1;
  notification.sound = "default";
  notification.alert = { title, body };
  notification.payload = { ...data, userId };
  notification.topic = process.env.APN_BUNDLE_ID || "com.krannk.app";
  
  // Send to all device tokens
  const tokens = deviceTokens.map((dt) => dt.token);
  const result = await provider.send(notification, tokens);
  
  // Handle failed tokens (remove invalid ones)
  if (result.failed && result.failed.length > 0) {
    for (const failure of result.failed) {
      if (failure.status === "410" || failure.response?.reason === "BadDeviceToken") {
        await DeviceToken.update(
          { isActive: false },
          { where: { token: failure.device } }
        );
      }
    }
  }
  
  return {
    sent: result.sent ? result.sent.length : 0,
    failed: result.failed ? result.failed.length : 0,
  };
}

/**
 * Send streak warning notifications
 * @param {number} hoursRemaining - Hours until streak expires
 */
async function sendStreakWarning(hoursRemaining) {
  let title, body;
  
  if (hoursRemaining <= 0.5) {
    title = "⚠️ Streak Expiring in 30 Minutes!";
    body = "Quick! Upload a photo to keep your streak alive! 🔥";
  } else if (hoursRemaining <= 1) {
    title = "⏰ 1 Hour Left!";
    body = "Your streak is about to expire! Don't forget to upload! 💕";
  } else if (hoursRemaining <= 2) {
    title = "📸 2 Hours Left";
    body = "Reminder: Upload a photo to maintain your streak! 🔥";
  } else {
    return; // No warning needed
  }
  
  // Send to both users
  await sendPushNotification("frank", title, body, { type: "streak_warning" });
  await sendPushNotification("keily", title, body, { type: "streak_warning" });
}

module.exports = {
  sendPushNotification,
  sendStreakWarning,
};
