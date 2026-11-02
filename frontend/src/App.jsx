import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = "http://localhost:3000/api/ask";
const HISTORY_URL = "http://localhost:3000/api/history";

const EXAMPLES = [
  "What is photosynthesis?",
  "Explain Newton's laws simply",
  "How do volcanoes erupt?",
];

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(HISTORY_URL);
        const data = await res.json();
        setMessages(
          data.messages.map((m) => ({ role: m.role, text: m.content }))
        );
      } catch (err) {
        console.log("Could not load history");
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendQuestion(text) {
    const q = text.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
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
    <div className="app">
      <header className="header">
        <h1>Doubt Solver</h1>
        <p>Ask any study doubt and get a clear explanation</p>
      </header>

      <main className="chat">
        {messages.length === 0 && !loading && (
          <div className="empty">
            <h2>What's your doubt today?</h2>
            <p>Type a question below, or try one of these:</p>
            <div className="chips">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className="chip"
                  onClick={() => sendQuestion(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`msg ${m.role === "user" ? "msg-user" : "msg-ai"}`}
          >
            {m.role === "ai" ? <ReactMarkdown>{m.text}</ReactMarkdown> : m.text}
          </div>
        ))}

        {loading && (
          <div className="msg msg-ai">
            <div className="dots">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <div className="input-bar">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendQuestion(question)}
          placeholder="Ask your doubt..."
        />
        <button onClick={() => sendQuestion(question)} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
}

export default App;