require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { WebSocketServer } = require("ws");
const { createClient } = require("redis");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PORT = process.env.PORT || 3000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const RATE_LIMIT = 10;
const WINDOW_SECONDS = 60;

const redis = createClient({ url: REDIS_URL });
redis.on("error", (err) => console.log("Redis error:", err.message));

function makeTitle(question) {
  const clean = question.replace(/^\[Subject: [^\]]+\]\s*/, "").trim();
  return clean.length > 60 ? clean.slice(0, 57) + "..." : clean;
}

async function underLimit(ip) {
  try {
    const key = `rate:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    return count <= RATE_LIMIT;
  } catch (err) {
    console.log("Rate limit check skipped:", err.message);
    return true;
  }
}

async function rateLimit(req, res, next) {
  if (!(await underLimit(req.ip))) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please wait a minute." });
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/conversations", async (req, res) => {
  try {
    res.json({ conversations: await db.listConversations(50) });
  } catch (err) {
    res.status(500).json({ error: "Could not load conversations" });
  }
});

app.get("/api/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Bad conversation id" });
  }
  try {
    res.json({ messages: await db.getConversationMessages(id) });
  } catch (err) {
    res.status(500).json({ error: "Could not load messages" });
  }
});

app.post("/api/messages/:id/save", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Bad message id" });
  }
  try {
    const result = await db.toggleSaved(id);
    if (!result) {
      return res.status(404).json({ error: "Answer not found" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Could not save answer" });
  }
});

app.get("/api/saved", async (req, res) => {
  try {
    res.json({ saved: await db.listSaved() });
  } catch (err) {
    res.status(500).json({ error: "Could not load saved answers" });
  }
});

app.get("/api/documents", async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/documents`);
    const data = await response.json();
    res.status(response.ok ? 200 : 502).json(data);
  } catch (err) {
    res.status(503).json({ error: "AI service unreachable" });
  }
});

app.post("/api/upload", rateLimit, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const form = new FormData();
      form.append(
        "file",
        new Blob([req.file.buffer], { type: "application/pdf" }),
        req.file.originalname
      );

      const response = await fetch(`${AI_SERVICE_URL}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await response.json();

      if (!response.ok) {
        return res
          .status(response.status === 400 ? 400 : 502)
          .json({ error: "Upload failed", detail: data.detail });
      }
      res.json(data);
    } catch (e) {
      res.status(503).json({ error: "AI service unreachable" });
    }
  });
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

    try {
      const conv = await db.createConversation(makeTitle(question));
      await db.saveMessage(conv.id, "user", question);
      await db.saveMessage(conv.id, "ai", data.answer);
    } catch (dbErr) {
      console.log("Could not save to database:", dbErr.message);
    }

    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "AI service unreachable" });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return send(ws, { type: "error", message: "Bad message" });
    }
    if (msg.type !== "ask") return;

    const question = msg.question;
    if (typeof question !== "string" || !question.trim()) {
      return send(ws, { type: "error", message: "Please type a question." });
    }
    if (!(await underLimit(ip))) {
      return send(ws, {
        type: "error",
        message: "Too many questions. Please wait a minute.",
      });
    }

    try {
      const response = await fetch(`${AI_SERVICE_URL}/ask-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        return send(ws, {
          type: "error",
          message: "Sorry, the AI is busy right now. Please try again.",
        });
      }

      let sources = [];
      try {
        sources = JSON.parse(
          decodeURIComponent(response.headers.get("x-sources") || "[]")
        );
      } catch (e) {
        sources = [];
      }
      send(ws, { type: "start", sources });

      const decoder = new TextDecoder();
      let full = "";
      for await (const part of response.body) {
        const text = decoder.decode(part, { stream: true });
        if (text) {
          full += text;
          send(ws, { type: "chunk", text });
        }
      }
      const tail = decoder.decode();
      if (tail) {
        full += tail;
        send(ws, { type: "chunk", text: tail });
      }

      if (full.trim()) {
        try {
          let convId = Number.isInteger(msg.conversationId)
            ? msg.conversationId
            : null;
          let title = null;
          if (!convId) {
            const conv = await db.createConversation(makeTitle(question));
            convId = conv.id;
            title = conv.title;
          }
          await db.saveMessage(convId, "user", question);
          const aiId = await db.saveMessage(convId, "ai", full);
          return send(ws, {
            type: "done",
            conversationId: convId,
            messageId: aiId,
            title,
          });
        } catch (dbErr) {
          console.log("Could not save to database:", dbErr.message);
        }
      }
      send(ws, { type: "done" });
    } catch (err) {
      send(ws, { type: "error", message: "Could not reach the AI service." });
    }
  });
});

async function start() {
  try {
    await redis.connect();
    console.log("Connected to Redis");
  } catch (err) {
    console.log("Could not connect to Redis:", err.message);
  }

  try {
    await db.initDb();
    console.log("Connected to PostgreSQL");
  } catch (err) {
    console.log("Could not connect to PostgreSQL:", err.message);
  }

  server.listen(PORT, () => {
    console.log(`Gateway running on http://localhost:${PORT}`);
  });
}

start();