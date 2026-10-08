const express = require("express");
const router = express.Router();
const testDbRouter = require("./test-db");
const photosRouter = require("./photos");
const usersRouter = require("./users");
const streakRouter = require("./streak");
const videosRouter = require("./videos");
const sessionsRouter = require("./sessions");

router.use("/test-db", testDbRouter);
router.use("/photos", photosRouter);
router.use("/users", usersRouter);
router.use("/streak", streakRouter);
router.use("/videos", videosRouter);
router.use("/sessions", sessionsRouter);

module.exports = router;
