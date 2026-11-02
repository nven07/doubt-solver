import { useState } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = "http://localhost:3000/api/ask";

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const text = question.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      const reply = res.ok
        ? data.answer
        : "Sorry, the AI is busy right now. Please try again.";
      setMessages((prev) => [...prev, { role: "ai", text: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Could not reach the server." },
      ]);
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 20 }}>
      <h2>Doubt Solver</h2>

      <div style={{ minHeight: 300 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              margin: "10px 0",
              padding: 10,
              borderRadius: 8,
              background: m.role === "user" ? "#2b4acb" : "#333",
              color: "white",
              whiteSpace: "pre-wrap",
            }}
          >
                        <b>{m.role === "user" ? "You" : "AI"}:</b>
            {m.role === "ai" ? <ReactMarkdown>{m.text}</ReactMarkdown> : <span> {m.text}</span>}
          </div>
        ))}
        {loading && <p>Thinking...</p>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, padding: 10 }}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask your doubt..."
        />
        <button onClick={handleSend} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}

export default App;