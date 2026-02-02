const db = require("./db");
const User = require("./user");
const Photo = require("./photo");

// Set up associations if needed in the future
// User.hasMany(Photo, { foreignKey: 'userId' });
// Photo.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  db,
  User,
  Photo,
};
