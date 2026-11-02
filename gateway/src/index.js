require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/ask", async (req, res) => {
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
      return res.status(502).json({ error: "AI service error", detail: data.detail });
    }
    res.json(data);
  } catch (err) {
    res.status(503).json({ error: "AI service unreachable" });
  }
});

app.listen(PORT, () => {
  console.log(`Gateway running on http://localhost:${PORT}`);
});