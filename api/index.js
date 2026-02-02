const express = require("express");
const router = express.Router();
const testDbRouter = require("./test-db");
const photosRouter = require("./photos");
const usersRouter = require("./users");

router.use("/test-db", testDbRouter);
router.use("/photos", photosRouter);
router.use("/users", usersRouter);

module.exports = router;
