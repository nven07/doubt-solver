require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("redis");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const RATE_LIMIT = 10;
const WINDOW_SECONDS = 60;

const redis = createClient({ url: REDIS_URL });
redis.on("error", (err) => console.log("Redis error:", err.message));

async function rateLimit(req, res, next) {
  try {
    const key = `rate:${req.ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    if (count > RATE_LIMIT) {
      return res
        .status(429)
        .json({ error: "Too many questions. Please wait a minute." });
    }
  } catch (err) {
    console.log("Rate limit check skipped:", err.message);
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/ask", rateLimit, async (req, res) => {
  const { question } = req.body;

  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  try {
    const response = await fetch(`${AI_SERVICE_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await response.json();

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: "AI service error", detail: data.detail });
    }
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "AI service unreachable" });
  }
});

async function start() {
  try {
    await redis.connect();
    console.log("Connected to Redis");
  } catch (err) {
    console.log("Could not connect to Redis:", err.message);
  }
  app.listen(PORT, () => {
    console.log(`Gateway running on http://localhost:${PORT}`);
  });
}

start();