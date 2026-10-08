const { DataTypes } = require("sequelize");
const db = require("./db");

// AppSession model - one row per time a user opens (foregrounds) the app
const AppSession = db.define("appSession", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  // Generated on the device so the "end" call can find the row
  clientSessionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: true, // null if opened before logging in
  },
  launchType: {
    type: DataTypes.STRING, // "cold" or "resume"
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  endedAt: {
    type: DataTypes.DATE,
  },
  durationSeconds: {
    type: DataTypes.INTEGER,
  },

  // Device / app
  deviceModel: { type: DataTypes.STRING },
  systemVersion: { type: DataTypes.STRING },
  appVersion: { type: DataTypes.STRING },
  appBuild: { type: DataTypes.STRING },
  deviceName: { type: DataTypes.STRING },

  // Locale / time
  timezone: { type: DataTypes.STRING },
  locale: { type: DataTypes.STRING },
  localStartTime: { type: DataTypes.STRING }, // e.g. "2026-10-08 23:14:02" in device tz

  // Power
  batteryLevelStart: { type: DataTypes.FLOAT },
  batteryLevelEnd: { type: DataTypes.FLOAT },
  batteryState: { type: DataTypes.STRING },
  lowPowerMode: { type: DataTypes.BOOLEAN },

  // Network
  networkType: { type: DataTypes.STRING }, // wifi / cellular / wired / none
  ipAddress: { type: DataTypes.STRING },

  // Approximate location from Vercel's IP geolocation headers (no permission needed)
  city: { type: DataTypes.STRING },
  region: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING },
  latitude: { type: DataTypes.FLOAT },
  longitude: { type: DataTypes.FLOAT },

  // Everything else the device sends (screen, storage, audio route, etc.)
  extra: { type: DataTypes.JSONB },
  endExtra: { type: DataTypes.JSONB },
});

module.exports = AppSession;
