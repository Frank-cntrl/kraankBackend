const express = require("express");
const router = express.Router();
const { AppSession, WidgetPing } = require("../database");

// Helper: pull IP + approximate location from request headers (Vercel adds geo headers)
function requestInfo(req) {
  const header = (name) => {
    const value = req.headers[name];
    return value ? decodeURIComponent(value) : null;
  };
  const toFloat = (value) => (value != null && !isNaN(parseFloat(value)) ? parseFloat(value) : null);

  const forwarded = req.headers["x-forwarded-for"];
  return {
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : req.socket?.remoteAddress || null,
    city: header("x-vercel-ip-city"),
    region: header("x-vercel-ip-country-region"),
    country: header("x-vercel-ip-country"),
    latitude: toFloat(header("x-vercel-ip-latitude")),
    longitude: toFloat(header("x-vercel-ip-longitude")),
  };
}

// POST /api/sessions/start - Record that a user opened the app
router.post("/start", async (req, res, next) => {
  try {
    const { clientSessionId, startedAt, extra, ...fields } = req.body;

    if (!clientSessionId) {
      return res.status(400).json({ message: "clientSessionId is required" });
    }

    const allowed = Object.keys(AppSession.getAttributes());
    const deviceFields = Object.fromEntries(
      Object.entries(fields).filter(([key]) => allowed.includes(key))
    );

    const values = {
      ...deviceFields,
      ...requestInfo(req),
      clientSessionId,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      extra: extra || null,
    };

    // Retries from the device reuse the same clientSessionId, so don't duplicate
    let session = await AppSession.findOne({ where: { clientSessionId } });
    if (session) {
      // Don't wipe a user that /identify already attached
      if (!values.userId) delete values.userId;
      await session.update(values);
    } else {
      session = await AppSession.create(values);
    }

    res.status(201).json({ success: true, id: session.id });
  } catch (error) {
    next(error);
  }
});

// POST /api/sessions/identify - Attach the user who logged in mid-session
router.post("/identify", async (req, res, next) => {
  try {
    const { clientSessionId, userId, startedAt } = req.body;

    if (!clientSessionId || !userId) {
      return res.status(400).json({ message: "clientSessionId and userId are required" });
    }

    // If this lands before /start, create the row; /start fills in the rest
    const [session, created] = await AppSession.findOrCreate({
      where: { clientSessionId },
      defaults: { userId, startedAt: startedAt ? new Date(startedAt) : new Date() },
    });
    if (!created) await session.update({ userId });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/sessions/end - Record that the user left the app
router.post("/end", async (req, res, next) => {
  try {
    const { clientSessionId, endedAt, batteryLevelEnd, extra } = req.body;

    const session = await AppSession.findOne({ where: { clientSessionId } });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const end = endedAt ? new Date(endedAt) : new Date();
    await session.update({
      endedAt: end,
      durationSeconds: Math.max(0, Math.round((end - session.startedAt) / 1000)),
      batteryLevelEnd: batteryLevelEnd ?? null,
      endExtra: extra || null,
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/sessions?userId=frank&limit=100 - List sessions, newest first
router.get("/", async (req, res, next) => {
  try {
    const { userId } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

    const sessions = await AppSession.findAll({
      where: userId ? { userId } : {},
      order: [["startedAt", "DESC"]],
      limit,
    });

    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

// GET /api/sessions/pings - When was each person's device last seen fetching?
// likelyDevice = whose app made the call. Recent rows for a person mean their
// app is still installed and reaching the server (if their widget is active).
router.get("/pings", async (req, res, next) => {
  try {
    const recent = await WidgetPing.findAll({
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    // Summarize the most recent ping per likely device
    const lastSeen = {};
    for (const ping of recent) {
      const device = ping.likelyDevice;
      if (device && !lastSeen[device]) {
        lastSeen[device] = {
          lastSeen: ping.createdAt,
          city: ping.city,
          region: ping.region,
          country: ping.country,
        };
      }
    }

    res.json({ lastSeen, recent });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
