import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

const BASE_URL = "http://localhost:3000/api";

const EXAMPLES = [
  "What is photosynthesis?",
  "Explain Newton's laws simply",
  "Summarize my uploaded notes",
];

function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ text: "", error: false });
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  async function loadDocuments() {
    try {
      const res = await fetch(`${BASE_URL}/documents`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.log("Could not load documents");
    }
  }

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`${BASE_URL}/history`);
        const data = await res.json();
        setMessages(
          data.messages.map((m) => ({ role: m.role, text: m.content }))
        );
      } catch (err) {
        console.log("Could not load history");
      }
    }
    loadHistory();
    loadDocuments();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setStatus({ text: "Please choose a PDF file.", error: true });
      return;
    }

    setUploading(true);
    setStatus({ text: `Reading ${file.name}...`, error: false });

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE_URL}/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (res.ok) {
        setStatus({
          text: `Added ${data.filename} (${data.chunks} pieces)`,
          error: false,
        });
        loadDocuments();
      } else {
        const reason = data.detail || data.error || "Upload failed";
        setStatus({ text: reason, error: true });
      }
    } catch (err) {
      setStatus({ text: "Could not reach the server.", error: true });
    }
    setUploading(false);
  }

  async function sendQuestion(text) {
    const q = text.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await fetch(`${BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      const reply = res.ok
        ? data.answer
        : "Sorry, the AI is busy right now. Please try again.";
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: reply, sources: res.ok ? data.sources : [] },
      ]);
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
        <p>Ask any study doubt, or upload your notes and ask about them</p>
      </header>

      <div className="notes">
        <span className="notes-label">
          {documents.length === 0 ? "No notes yet" : "Your notes:"}
        </span>
        {documents.slice(0, 3).map((d) => (
          <span key={d.id} className="note-tag" title={d.filename}>
            {d.filename}
          </span>
        ))}
        {documents.length > 3 && (
          <span className="notes-label">+{documents.length - 3} more</span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <button
          className="upload-btn"
          onClick={() => fileRef.current.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Upload PDF"}
        </button>
      </div>
      {status.text && (
        <div className={`upload-status ${status.error ? "error" : ""}`}>
          {status.text}
        </div>
      )}

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
            {m.sources && m.sources.length > 0 && (
              <div className="sources">Notes searched: {m.sources.join(", ")}</div>
            )}
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