require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const apiRouter = require("./api");
const { router: authRouter } = require("./auth");
const { db } = require("./database");
const cors = require("cors");
const initSocketServer = require("./socket-server");
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// body parser middleware - increase limit for image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS configuration - allow all origins for mobile app
app.use(
  cors({
    origin: true, // Allow all origins (for mobile app)
    credentials: true,
  })
);

// cookie parser middleware
app.use(cookieParser());

app.use(morgan("dev")); // logging middleware

// Ensure tables exist before handling requests. On Vercel's serverless
// runtime the top-level db.sync() in runApp() isn't reliably awaited before
// requests arrive, so new tables (e.g. appSessions, widgetPings) may be
// missing. Sync once per cold start and cache the promise.
let dbReady = null;
async function ensureSchema() {
  // Creates any missing tables (appSessions, widgetPings, ...).
  await db.sync();

  // db.sync() does NOT add new columns to tables that already exist, so add
  // the device-open tracking columns explicitly. ADD COLUMN IF NOT EXISTS is
  // idempotent, so this is safe to run on every cold start.
  const columns = [
    '"lastOpenedAt" TIMESTAMP WITH TIME ZONE',
    '"openCount" INTEGER DEFAULT 0',
    '"lastCity" VARCHAR(255)',
    '"lastRegion" VARCHAR(255)',
    '"lastCountry" VARCHAR(255)',
    '"lastIp" VARCHAR(255)',
  ];
  for (const col of columns) {
    await db.query(`ALTER TABLE "deviceTokens" ADD COLUMN IF NOT EXISTS ${col};`);
  }
}
app.use(async (req, res, next) => {
  try {
    if (!dbReady) dbReady = ensureSchema();
    await dbReady;
    next();
  } catch (err) {
    dbReady = null; // allow a retry on the next request
    next(err);
  }
});

app.use(express.static(path.join(__dirname, "public"))); // serve static files from public folder
app.use("/api", apiRouter); // mount api router
app.use("/auth", authRouter); // mount auth router

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const runApp = async () => {
  try {
    await db.sync();
    console.log("✅ Connected to the database");
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

    initSocketServer(server);
    console.log("🧦 Socket server initialized");
  } catch (err) {
    console.error("❌ Unable to connect to the database:", err);
  }
};

runApp();

module.exports = app;
