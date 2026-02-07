const express = require("express");
const router = express.Router();
const { User, db } = require("../database");

// You don't actually need this route, it's just a good way to confirm that your database connection is working.
// Feel free to delete this entire file.
router.get("/", async (req, res) => {
  try {
    const users = await User.findAll();
    console.log(`Found ${users.length} users`);
    res.json({
      message: "You successfully connected to the database 🥳",
      usersCount: users.length,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      error: "Failed to fetch users",
      message:
        "Check your database connection, and consider running your seed file: npm run seed",
    });
  }
});

// Sync database schema (adds missing columns)
router.post("/sync", async (req, res) => {
  try {
    await db.sync({ alter: true });
    res.json({ success: true, message: "Database schema synced successfully" });
  } catch (error) {
    console.error("Error syncing database:", error);
    res.status(500).json({ error: "Failed to sync database", message: error.message });
  }
});

module.exports = router;
