const { DataTypes } = require("sequelize");
const db = require("./db");

// WidgetPing - one row each time a widget/app fetches a user's latest photo.
// A ping for "frank" comes from Keily's device (she sees Frank's photos), so
// recent pings for frank mean Keily's app is still installed and reaching us.
const WidgetPing = db.define("widgetPing", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  // Whose latest photo was requested (frank/keily)
  requestedUser: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // Best guess at whose device made the call (the partner of requestedUser)
  likelyDevice: {
    type: DataTypes.STRING,
  },
  ipAddress: { type: DataTypes.STRING },
  city: { type: DataTypes.STRING },
  region: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING },
  userAgent: { type: DataTypes.STRING },
});

module.exports = WidgetPing;
