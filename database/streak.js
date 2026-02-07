const { DataTypes } = require("sequelize");
const db = require("./db");

// Streak model - tracks the couple's streak
const Streak = db.define("streak", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  currentStreak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  longestStreak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  lastFrankUpload: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lastKeilyUpload: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  streakStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  streakExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lastStreakIncrementDate: {
    type: DataTypes.DATEONLY, // Just the date, no time - e.g. "2026-02-07"
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
});

module.exports = Streak;
