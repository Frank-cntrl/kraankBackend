const { DataTypes } = require("sequelize");
const db = require("./db");

// DeviceToken model - stores push notification tokens
const DeviceToken = db.define("deviceToken", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  platform: {
    type: DataTypes.STRING,
    defaultValue: "ios",
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  // Updated every time the app re-registers its token, which happens on each
  // app launch — so this is effectively "last time this device opened the app".
  lastOpenedAt: {
    type: DataTypes.DATE,
  },
  openCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Approximate location of the most recent open (from Vercel IP headers)
  lastCity: { type: DataTypes.STRING },
  lastRegion: { type: DataTypes.STRING },
  lastCountry: { type: DataTypes.STRING },
  lastIp: { type: DataTypes.STRING },
});

module.exports = DeviceToken;
