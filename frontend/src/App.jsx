import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import Auth from "./Auth";

const BASE_URL = "http://localhost:3000/api";
const WS_URL = "ws://localhost:3000/ws";

const SUBJECTS = [
  { name: "Mathematics", desc: "Solve numerical problems", icon: "∑" },
  { name: "Programming", desc: "Debug and understand code", icon: "</>" },
  { name: "Science", desc: "Explore scientific concepts", icon: "⚗" },
  { name: "General Studies", desc: "Understand academic topics", icon: "✎" },
];

const QUOTES = [
  "Small steps lead to big achievements.",
  "Every expert was once a beginner.",
  "Curiosity is the first step to understanding.",
  "Learn a little every day.",
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning!";
  if (h < 17) return "Good afternoon!";
  return "Good evening!";
}

function stripSubject(text) {
  return (text || "").replace(/^\[Subject: [^\]]+\]\s*/, "");
}

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [convId, setConvId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [saved, setSaved] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [view, setView] = useState("home");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ text: "", error: false });
  const [subject, setSubject] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quote] = useState(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)]
  );

  const tokenRef = useRef(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  function clearStoredToken() {
    localStorage.removeItem("dz_token");
    sessionStorage.removeItem("dz_token");
  }

  function logout() {
    clearStoredToken();
    tokenRef.current = null;
    setUser(null);
    setMessages([]);
    setConvId(null);
    setConversations([]);
    setSaved([]);
    setDocuments([]);
    setStatus({ text: "", error: false });
    setQuestion("");
    setView("home");
    setMenuOpen(false);
  }

  function handleAuth(token, newUser, remember) {
    clearStoredToken();
    if (remember) {
      localStorage.setItem("dz_token", token);
    } else {
      sessionStorage.setItem("dz_token", token);
    }
    tokenRef.current = token;
    setUser(newUser);
  }

  async function authFetch(path, options = {}) {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${tokenRef.current}`,
    };
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    if (res.status === 401) logout();
    return res;
  }

  async function loadDocuments() {
    try {
      const res = await authFetch("/documents");
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.log("Could not load documents");
    }
  }

  async function loadConversations() {
    try {
      const res = await authFetch("/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (err) {
      console.log("Could not load conversations");
    }
  }

  async function loadSaved() {
    try {
      const res = await authFetch("/saved");
      const data = await res.json();
      setSaved(data.saved || []);
    } catch (err) {
      console.log("Could not load saved answers");
    }
  }

  useEffect(() => {
    async function checkLogin() {
      const stored =
        localStorage.getItem("dz_token") || sessionStorage.getItem("dz_token");
      if (stored) {
        try {
          const res = await fetch(`${BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${stored}` },
          });
          if (res.ok) {
            const data = await res.json();
            tokenRef.current = stored;
            setUser(data.user);
          } else {
            clearStoredToken();
          }
        } catch (err) {
          console.log("Could not reach the server");
        }
      }
      setAuthChecked(true);
    }
    checkLogin();
  }, []);

  useEffect(() => {
    if (user) {
      loadConversations();
      loadDocuments();
    }
  }, [user]);

  useEffect(() => {
    if (view !== "chat") return;
    bottomRef.current?.scrollIntoView({
      behavior: loading ? "auto" : "smooth",
    });
  }, [messages, loading, view]);

  function newConversation() {
    setMessages([]);
    setConvId(null);
    setQuestion("");
    setView("home");
    setMenuOpen(false);
  }

  function showRecent() {
    setView("recent");
    loadConversations();
    setMenuOpen(false);
  }

  function showSaved() {
    setView("saved");
    loadSaved();
    setMenuOpen(false);
  }

  async function openConversation(id) {
    try {
      const res = await authFetch(`/conversations/${id}/messages`);
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role,
          text: m.role === "user" ? stripSubject(m.content) : m.content,
          saved: m.saved,
          time: m.created_at,
        }))
      );
      setConvId(id);
      setView("chat");
      setMenuOpen(false);
    } catch (err) {
      console.log("Could not open that conversation");
    }
  }

  async function toggleSave(id) {
    try {
      const res = await authFetch(`/messages/${id}/save`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === data.id ? { ...m, saved: data.saved } : m))
      );
      if (!data.saved) {
        setSaved((prev) => prev.filter((s) => s.id !== data.id));
      }
    } catch (err) {
      console.log("Could not save answer");
    }
  }

  function pickSubject(name) {
    setSubject((prev) => (prev === name ? null : name));
    inputRef.current?.focus();
  }

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
      const res = await authFetch("/upload", { method: "POST", body: form });
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

  function sendQuestion(text) {
    const q = text.trim();
    if (!q || loading) return;

    const startingNew = view === "home";
    const useConv = startingNew ? null : convId;
    if (startingNew) setConvId(null);
    setView("chat");

    const apiText = subject ? `[Subject: ${subject}] ${q}` : q;
    const userMsg = { role: "user", text: q, time: new Date().toISOString() };
    setMessages((prev) => [...(startingNew ? [] : prev), userMsg]);
    setQuestion("");
    setLoading(true);

    let started = false;
    let finished = false;
    let sources = [];
    const ws = new WebSocket(WS_URL);

    function addAi(textValue) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: textValue,
          time: new Date().toISOString(),
          sources,
        },
      ]);
    }

    function finish(errorText) {
      if (finished) return;
      finished = true;
      if (errorText) {
        if (started) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = {
              ...last,
              text: last.text + "\n\n*(The answer was interrupted.)*",
            };
            return copy;
          });
        } else {
          addAi(errorText);
        }
      } else if (!started) {
        addAi("Sorry, I could not get an answer. Please try again.");
      }
      setLoading(false);
      ws.close();
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "ask",
          token: tokenRef.current,
          question: apiText,
          conversationId: useConv,
        })
      );
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (msg.type === "start") {
        sources = msg.sources || [];
      } else if (msg.type === "chunk") {
        if (!started) {
          started = true;
          addAi(msg.text);
        } else {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, text: last.text + msg.text };
            return copy;
          });
        }
      } else if (msg.type === "done") {
        if (msg.conversationId) setConvId(msg.conversationId);
        if (msg.messageId) {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "ai") {
              copy[copy.length - 1] = { ...last, id: msg.messageId };
            }
            return copy;
          });
        }
        loadConversations();
        finish();
      } else if (msg.type === "error") {
        finish(msg.message);
        if (msg.code === "auth") logout();
      }
    };

    ws.onerror = () => finish("Could not reach the server.");
    ws.onclose = () => finish("Could not reach the server.");
  }

  if (!authChecked) {
    return <div className="auth-loading">DoubtZen</div>;
  }

  if (!user) {
    return <Auth onAuth={handleAuth} />;
  }

  const lastRole = messages.length ? messages[messages.length - 1].role : null;
  const showDots = loading && lastRole === "user";

  const askCard = (
    <div className="ask-card">
      <button
        className="attach"
        onClick={() => fileRef.current.click()}
        disabled={uploading}
      >
        <span>📎</span> {uploading ? "Uploading..." : "Attach"}
      </button>
      <input
        ref={inputRef}
        className="ask-input"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && sendQuestion(question)}
        placeholder={
          subject
            ? `Ask a ${subject} doubt...`
            : "Ask anything. We're here to help you learn."
        }
      />
      <button
        className="send"
        onClick={() => sendQuestion(question)}
        disabled={loading}
        aria-label="Send"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 20l18-8L3 4v6l12 2-12 2z" />
        </svg>
      </button>
    </div>
  );

  const notesRow = (
    <>
      <div className="notes">
        <span>
          {documents.length === 0
            ? "No notes yet. Use Attach to add a PDF."
            : "Your notes:"}
        </span>
        {documents.slice(0, 3).map((d) => (
          <span key={d.id} className="note-tag" title={d.filename}>
            {d.filename}
          </span>
        ))}
        {documents.length > 3 && <span>+{documents.length - 3} more</span>}
      </div>
      {status.text && (
        <div className={`status ${status.error ? "error" : ""}`}>
          {status.text}
        </div>
      )}
    </>
  );

  return (
    <div className="shell">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      <div className="mobile-bar">
        <button className="menu-btn" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        DoubtZen
      </div>
      {menuOpen && (
        <div className="backdrop" onClick={() => setMenuOpen(false)} />
      )}

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-mark">
            <svg
              width="60"
              height="60"
              viewBox="0 0 64 64"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M32 3L34 8L39 10L34 12L32 17L30 12L25 10L30 8Z" fill="currentColor" strokeWidth="1" />
              <path d="M7 26C16 22 26 22 32 28V54C26 48 16 48 7 52Z" />
              <path d="M57 26C48 22 38 22 32 28V54C38 48 48 48 57 52Z" />
              <path d="M13 33C18 31 23 31 27 33" />
              <path d="M13 40C18 38 23 38 27 40" />
              <path d="M51 33C46 31 41 31 37 33" />
              <path d="M51 40C46 38 41 38 37 40" />
            </svg>
          </div>
          <div className="logo-text">DoubtZen</div>
        </div>

        <button className="new-chat" onClick={newConversation}>
          + New Conversation
        </button>

        <button
          className={`nav-item ${view === "recent" ? "active" : ""}`}
          onClick={showRecent}
        >
          <span>🕒 Recent Doubts</span>
        </button>
        <button
          className={`nav-item ${view === "saved" ? "active" : ""}`}
          onClick={showSaved}
        >
          <span>🔖 Saved Answers</span>
        </button>
        <button className="nav-item" disabled>
          <span>📊 Study History</span>
          <span className="soon">Soon</span>
        </button>

        <div className="sidebar-bottom">
          <button className="nav-item" disabled>
            <span>⚙ Settings</span>
            <span className="soon">Soon</span>
          </button>
          <div className="user-row">
            <div className="avatar">
              {(user.name || "?").charAt(0).toUpperCase()}
            </div>
            <span className="user-name">{user.name}</span>
            <button className="logout-btn" onClick={logout}>
              Log out
            </button>
          </div>
          <p className="tagline">Learn. Ask. Grow.</p>
        </div>
      </aside>

      <main className="main">
        {view === "home" && (
          <div className="home">
            <div className="deco">
              <div className="arch" />
              <div className="books">
                <div className="book b1" />
                <div className="book b2" />
                <div className="book b3" />
              </div>
            </div>

            <h1 className="greeting">
              <span className="spark">✦</span>
              {getGreeting()}
            </h1>
            <p className="subgreeting">What would you like to understand today?</p>

            {askCard}
            {notesRow}

            <div className="subjects">
              {SUBJECTS.map((s) => (
                <button
                  key={s.name}
                  className={`subject ${subject === s.name ? "active" : ""}`}
                  onClick={() => pickSubject(s.name)}
                >
                  <span className="subject-icon">{s.icon}</span>
                  <span>
                    <span className="subject-title">{s.name}</span>
                    <small>{s.desc}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="lower">
              <section className="activity">
                <h3>✦ Your Recent Activity</h3>
                {conversations.length === 0 && (
                  <div className="activity-empty">
                    Your recent questions will show up here.
                  </div>
                )}
                {conversations.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    className="activity-row"
                    onClick={() => openConversation(c.id)}
                  >
                    <span className="activity-text">{c.title}</span>
                    <span className="activity-time">{timeAgo(c.updated_at)}</span>
                  </button>
                ))}
              </section>

              <aside className="quote">
                <span className="quote-mark">“</span>
                {quote}
              </aside>
            </div>
          </div>
        )}

        {view === "recent" && (
          <div className="list-page">
            <h2>Recent Doubts</h2>
            <p className="list-sub">Pick up any earlier conversation.</p>
            {conversations.length === 0 && (
              <div className="list-empty">
                No conversations yet. Ask your first doubt!
              </div>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                className="list-item"
                onClick={() => openConversation(c.id)}
              >
                <span className="list-item-title">{c.title}</span>
                <span className="list-item-time">{timeAgo(c.updated_at)}</span>
              </button>
            ))}
          </div>
        )}

        {view === "saved" && (
          <div className="list-page">
            <h2>Saved Answers</h2>
            <p className="list-sub">Answers you bookmarked to revise later.</p>
            {saved.length === 0 && (
              <div className="list-empty">
                Nothing saved yet. Use "Save answer" under any AI answer.
              </div>
            )}
            {saved.map((s) => (
              <div key={s.id} className="saved-card">
                <p className="saved-q">
                  {stripSubject(s.question) || "Saved answer"}
                </p>
                <div className={`saved-body ${expanded[s.id] ? "open" : ""}`}>
                  <ReactMarkdown>{s.content}</ReactMarkdown>
                </div>
                <div className="saved-actions">
                  <button
                    className="bookmark-btn"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
                    }
                  >
                    {expanded[s.id] ? "Show less" : "Read full answer"}
                  </button>
                  <button
                    className="bookmark-btn"
                    onClick={() => openConversation(s.conversation_id)}
                  >
                    Open chat
                  </button>
                  <button
                    className="bookmark-btn saved"
                    onClick={() => toggleSave(s.id)}
                  >
                    ★ Saved
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "chat" && (
          <div className="chat-view">
            <div className="chat-scroll">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`msg ${m.role === "user" ? "msg-user" : "msg-ai"}`}
                >
                  {m.role === "ai" ? (
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  ) : (
                    m.text
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="sources">
                      Notes searched: {m.sources.join(", ")}
                    </div>
                  )}
                  {m.role === "ai" && m.id && (
                    <div className="msg-actions">
                      <button
                        className={`bookmark-btn ${m.saved ? "saved" : ""}`}
                        onClick={() => toggleSave(m.id)}
                      >
                        {m.saved ? "★ Saved" : "☆ Save answer"}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {showDots && (
                <div className="msg msg-ai">
                  <div className="dots">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input">
              {askCard}
              {notesRow}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;