import { useState } from "react";

const BASE_URL = "http://localhost:3000/api";

function Logo({ size = 44 }) {
  return (
    <svg
      width={size}
      height={size}
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
  );
}

function BigKid() {
  return (
    <svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="236" width="196" height="36" rx="4" fill="#7d2e3f" />
      <rect x="150" y="242" width="46" height="24" fill="#f1dccb" />
      <rect x="0" y="272" width="216" height="38" rx="4" fill="#8f3a4b" />
      <rect x="168" y="278" width="48" height="26" fill="#f1dccb" />
      <rect x="0" y="310" width="204" height="40" rx="4" fill="#6f2a38" />
      <rect x="158" y="316" width="46" height="28" fill="#f1dccb" />
      <rect x="70" y="272" width="12" height="52" fill="#b0465a" />

      <ellipse cx="365" cy="258" rx="122" ry="118" fill="#3a2922" />
      <ellipse cx="365" cy="292" rx="100" ry="98" fill="#f6dcc6" />
      <path
        d="M255 262 C265 195 330 170 375 188 C425 175 480 215 478 270 C455 232 425 228 400 246 C385 222 330 224 306 252 C290 246 270 250 255 262 Z"
        fill="#3a2922"
      />
      <path
        d="M352 180 C336 140 384 128 378 166"
        fill="none"
        stroke="#3a2922"
        strokeWidth="9"
        strokeLinecap="round"
      />

      <ellipse cx="300" cy="314" rx="16" ry="8" fill="#f2b5a3" opacity="0.6" />
      <ellipse cx="432" cy="304" rx="16" ry="8" fill="#f2b5a3" opacity="0.6" />

      <ellipse cx="325" cy="292" rx="21" ry="25" fill="#4a3128" />
      <ellipse cx="325" cy="296" rx="15" ry="19" fill="#2a1a15" />
      <circle cx="318" cy="285" r="7" fill="#fff" />
      <circle cx="332" cy="304" r="3" fill="#fff" />
      <ellipse cx="408" cy="292" rx="21" ry="25" fill="#4a3128" />
      <ellipse cx="408" cy="296" rx="15" ry="19" fill="#2a1a15" />
      <circle cx="401" cy="285" r="7" fill="#fff" />
      <circle cx="415" cy="304" r="3" fill="#fff" />
      <path d="M300 264 Q322 254 346 264" fill="none" stroke="#3a2922" strokeWidth="5" strokeLinecap="round" />
      <path d="M386 264 Q410 254 432 264" fill="none" stroke="#3a2922" strokeWidth="5" strokeLinecap="round" />

      <path d="M0 362 L600 296 L600 400 L0 400 Z" fill="#c8ae9a" />
      <path d="M0 362 L600 296" stroke="#ddc7b4" strokeWidth="6" />

      <ellipse cx="292" cy="334" rx="28" ry="13" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="274" cy="324" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="288" cy="320" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="302" cy="320" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="315" cy="324" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <ellipse cx="440" cy="318" rx="28" ry="13" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="422" cy="308" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="436" cy="304" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="450" cy="304" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />
      <circle cx="463" cy="308" r="8" fill="#f6dcc6" stroke="#e2b89c" strokeWidth="2" />

      <text
        x="478"
        y="220"
        fontSize="70"
        fontWeight="700"
        fill="#cf8a78"
        transform="rotate(10 478 220)"
      >
        !!
      </text>
    </svg>
  );
}

function MiniKid({ cover }) {
  return (
    <div className={`mini-kid ${cover ? "cover" : ""}`}>
      <svg viewBox="0 0 74 48" xmlns="http://www.w3.org/2000/svg">
        <circle cx="37" cy="40" r="22" fill="#3a2922" />
        <circle cx="37" cy="44" r="17" fill="#f6dcc6" />
        <path
          d="M20 38 C22 24 40 20 54 30 C46 28 36 30 30 36 C26 34 22 36 20 38 Z"
          fill="#3a2922"
        />
        <path
          d="M37 20 C34 10 44 8 42 17"
          fill="none"
          stroke="#3a2922"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g className="eyes">
          <ellipse cx="30" cy="40" rx="3" ry="4" fill="#2a1a15" />
          <ellipse cx="44" cy="40" rx="3" ry="4" fill="#2a1a15" />
        </g>
        <g className="hands">
          <ellipse cx="29" cy="38" rx="9" ry="7" fill="#f6dcc6" stroke="#e2b89c" />
          <ellipse cx="45" cy="38" rx="9" ry="7" fill="#f6dcc6" stroke="#e2b89c" />
        </g>
      </svg>
    </div>
  );
}

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  function switchMode() {
    setMode(isLogin ? "signup" : "login");
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);

    try {
      const res = await fetch(
        `${BASE_URL}/auth/${isLogin ? "login" : "signup"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        onAuth(data.token, data.user, remember);
        return;
      }
      setError(data.error || "Something went wrong. Please try again.");
    } catch (err) {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <div className="auth-page">
      <div className="shape-a" />
      <div className="shape-b" />

      <div className="auth-brand">
        <Logo size={46} />
        DoubtZen
      </div>

      <div className="auth-hero">
        <h1>
          Unlock <em>Clarity.</em>
          <br />
          One Question At A Time.
        </h1>
        <p>Your personal AI study companion</p>
      </div>

      <span className="auth-float f1">∫</span>
      <span className="auth-float f2">π</span>
      <span className="auth-float f3">✦</span>
      <span className="auth-float f4">✦</span>
      <span className="auth-float f5">✦</span>

      <div className="auth-kid">
        <BigKid />
      </div>

      <div className="auth-card">
        <div className="auth-switch">
          {isLogin ? "New here? " : "Already have an account? "}
          <button type="button" className="link-btn" onClick={switchMode}>
            {isLogin ? "Sign Up →" : "Sign In →"}
          </button>
        </div>

        <h2 className="auth-title">
          {isLogin ? "Welcome Back!" : "Create your account"}
        </h2>
        <p className="auth-sub">
          {isLogin ? "Let's get back to learning. ✦" : "Start learning with DoubtZen. ✦"}
        </p>

        <form onSubmit={submit}>
          {!isLogin && (
            <div className="field">
              <span className="field-icon">👤</span>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="field">
            <span className="field-icon">✉</span>
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <span className="field-icon">🔒</span>
            <input
              type={showPw ? "text" : "password"}
              placeholder={isLogin ? "Password" : "Password (8+ characters)"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
            />
            <MiniKid cover={!showPw} />
            <button
              type="button"
              className="eye-btn"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "👁" : "🙈"}
            </button>
          </div>

          {isLogin && (
            <div className="auth-row">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <button
                type="button"
                className="link-btn"
                disabled
                title="Coming soon"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "Please wait..." : isLogin ? "Sign In →" : "Create Account →"}
          </button>
        </form>

        <div className="auth-or">or</div>

        <button type="button" className="google-btn" disabled>
          <b style={{ color: "#4285F4" }}>G</b> Continue with Google (soon)
        </button>

        <p className="auth-terms">
          By continuing, you agree to our Terms &amp; Privacy Policy.
        </p>
      </div>
    </div>
  );
}