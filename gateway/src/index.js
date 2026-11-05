require("dotenv").config();
const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
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
const GRPC_URL = process.env.GRPC_URL || "127.0.0.1:50051";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const JWT_SECRET = process.env.JWT_SECRET;

const RATE_LIMIT = 10;
const AUTH_LIMIT = 10;
const WINDOW_SECONDS = 60;

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const packageDef = protoLoader.loadSync(
  path.join(__dirname, "..", "doubt.proto"),
  { keepCase: true, longs: Number, enums: String, oneofs: true }
);
const doubtProto = grpc.loadPackageDefinition(packageDef).doubt;
const assistant = new doubtProto.Assistant(
  GRPC_URL,
  grpc.credentials.createInsecure()
);

const redis = createClient({ url: REDIS_URL });
redis.on("error", (err) => console.log("Redis error:", err.message));

function makeTitle(question) {
  const clean = question.replace(/^\[Subject: [^\]]+\]\s*/, "").trim();
  return clean.length > 60 ? clean.slice(0, 57) + "..." : clean;
}

async function underLimit(key, limit) {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
    return count <= limit;
  } catch (err) {
    console.log("Rate limit check skipped:", err.message);
    return true;
  }
}

function makeToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: "7d" });
}

function userIdFromToken(token) {
  try {
    const payload = jwt.verify(token || "", JWT_SECRET);
    return Number.isInteger(payload.uid) ? payload.uid : null;
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = userIdFromToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Please log in." });
  }
  req.userId = userId;
  next();
}

async function rateLimit(req, res, next) {
  if (!(await underLimit(`rate:${req.userId}`, RATE_LIMIT))) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please wait a minute." });
  }
  next();
}

async function authLimit(req, res, next) {
  if (!(await underLimit(`auth:${req.ip}`, AUTH_LIMIT))) {
    return res
      .status(429)
      .json({ error: "Too many attempts. Please wait a minute." });
  }
  next();
}

function aiHeaders(userId, extra = {}) {
  return { "X-User-Id": String(userId), ...extra };
}

function askStream(userId, question, handlers) {
  return new Promise((resolve, reject) => {
    const call = assistant.AskStream(
      { question, user_id: userId },
      new grpc.Metadata(),
      { deadline: Date.now() + 120000 }
    );
    call.on("data", (chunk) => {
      if (chunk.start) {
        handlers.onStart(chunk.start);
      } else if (typeof chunk.text === "string") {
        handlers.onText(chunk.text);
      }
    });
    call.on("end", resolve);
    call.on("error", reject);
  });
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/* ---------- Auth ---------- */

app.post("/api/auth/signup", authLimit, async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!name || name.length > 60) {
    return res.status(400).json({ error: "Please enter your name." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return res.status(400).json({ error: "Please enter a valid email." });
  }
  if (password.length < 8 || password.length > 72) {
    return res
      .status(400)
      .json({ error: "Password must be 8 to 72 characters." });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(name, email, hash);
    res.json({ token: makeToken(user), user });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });
    }
    console.log("Signup failed:", err.message);
    res.status(500).json({ error: "Could not create the account." });
  }
});

app.post("/api/auth/login", authLimit, async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  try {
    const user = await db.findUserByEmail(email);
    const ok = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_HASH
    );
    if (!user || !ok) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    res.json({
      token: makeToken(user),
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.log("Login failed:", err.message);
    res.status(500).json({ error: "Could not log in." });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await db.findUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: "Please log in." });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Could not load your account." });
  }
});

/* ---------- Conversations and saved answers ---------- */

app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    res.json({ conversations: await db.listConversations(req.userId, 50) });
  } catch (err) {
    res.status(500).json({ error: "Could not load conversations" });
  }
});

app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Bad conversation id" });
  }
  try {
    res.json({ messages: await db.getConversationMessages(req.userId, id) });
  } catch (err) {
    res.status(500).json({ error: "Could not load messages" });
  }
});

app.post("/api/messages/:id/save", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Bad message id" });
  }
  try {
    const result = await db.toggleSaved(req.userId, id);
    if (!result) {
      return res.status(404).json({ error: "Answer not found" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Could not save answer" });
  }
});

app.get("/api/saved", requireAuth, async (req, res) => {
  try {
    res.json({ saved: await db.listSaved(req.userId) });
  } catch (err) {
    res.status(500).json({ error: "Could not load saved answers" });
  }
});

/* ---------- Notes (PDFs) ---------- */

app.get("/api/documents", requireAuth, async (req, res) => {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/documents`, {
      headers: aiHeaders(req.userId),
    });
    const data = await response.json();
    res.status(response.ok ? 200 : 502).json(data);
  } catch (err) {
    res.status(503).json({ error: "AI service unreachable" });
  }
});

app.post("/api/upload", requireAuth, rateLimit, (req, res) => {
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
        headers: aiHeaders(req.userId),
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

/* ---------- Asking ---------- */

app.post("/api/ask", requireAuth, rateLimit, async (req, res) => {
  const { question } = req.body || {};

  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  try {
    const response = await fetch(`${AI_SERVICE_URL}/ask`, {
      method: "POST",
      headers: aiHeaders(req.userId, { "Content-Type": "application/json" }),
      body: JSON.stringify({ question }),
    });
    const data = await response.json();

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: "AI service error", detail: data.detail });
    }

    try {
      const conv = await db.createConversation(
        req.userId,
        makeTitle(question)
      );
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
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 64 * 1024 });

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws) => {
  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return send(ws, { type: "error", message: "Bad message" });
    }
    if (msg.type !== "ask") return;

    const userId = userIdFromToken(msg.token);
    if (!userId) {
      return send(ws, {
        type: "error",
        code: "auth",
        message: "Please log in again.",
      });
    }

    const question = msg.question;
    if (typeof question !== "string" || !question.trim()) {
      return send(ws, { type: "error", message: "Please type a question." });
    }
    if (!(await underLimit(`rate:${userId}`, RATE_LIMIT))) {
      return send(ws, {
        type: "error",
        message: "Too many questions. Please wait a minute.",
      });
    }

    let full = "";
    try {
      await askStream(userId, question, {
        onStart: (s) => {
          console.log(`gRPC stream opened (tool: ${s.tool})`);
          send(ws, { type: "start", sources: s.sources || [], tool: s.tool });
        },
        onText: (text) => {
          full += text;
          send(ws, { type: "chunk", text });
        },
      });
    } catch (err) {
      console.log("gRPC call failed:", err.code, err.details || err.message);
      return send(ws, {
        type: "error",
        message: "Sorry, the AI is busy right now. Please try again.",
      });
    }

    if (full.trim()) {
      try {
        let convId = null;
        if (
          Number.isInteger(msg.conversationId) &&
          (await db.conversationOwnedBy(userId, msg.conversationId))
        ) {
          convId = msg.conversationId;
        }
        let title = null;
        if (!convId) {
          const conv = await db.createConversation(userId, makeTitle(question));
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
  });
});

async function start() {
  if (!JWT_SECRET) {
    console.log("JWT_SECRET is missing in gateway/.env. Add it and save.");
    process.exit(1);
  }

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