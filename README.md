# DoubtZen: AI Study Companion

DoubtZen is a full-stack web app where students upload their own PDF notes and ask study doubts. An AI agent answers from those notes, writes quizzes, and makes revision summaries, streaming the answer word by word.

## Features

- **Accounts:** sign up and log in (JWT tokens, bcrypt-hashed passwords). Each person's chats, saved answers, and notes are private.
- **Chat with your notes (RAG):** PDFs are split into pieces, embedded, and stored in PostgreSQL with pgvector. Questions search only your own notes, and unrelated notes are ignored using a relevance cutoff.
- **AI agent with tools:** the AI reads each message and picks a tool: explain (answer), quiz (5-question multiple choice with answer key), or summary (key points, terms, recap).
- **Live streaming:** answers arrive word by word over a WebSocket.
- **Conversations and saved answers:** separate chats, a Recent Doubts list, and bookmarked answers.
- **Reliability:** answers fail over automatically from Groq to Gemini to a backup Gemini model, with time limits and retries. Redis rate-limits requests.

## Architecture

```
Browser (React)
    |  REST + WebSocket
Gateway (Node.js / Express)  ---  Redis (rate limiting)
    |  HTTP                        PostgreSQL + pgvector
AI service (Python / FastAPI) ---- (users, chats, notes, embeddings)
    |
Groq / Gemini (LLMs and embeddings)
```

| Part | Technology |
| --- | --- |
| Frontend | React (Vite), served by nginx in Docker |
| Gateway | Node.js, Express, ws, JWT, bcryptjs |
| AI service | Python, FastAPI, pypdf, psycopg |
| Database | PostgreSQL with pgvector |
| Cache and limits | Redis |
| AI providers | Groq (openai/gpt-oss-120b), Google Gemini, Gemini embeddings |
| Packaging | Docker and Docker Compose |

## Run it (about 5 minutes)

You need **Docker Desktop** (open and running) and two **free** API keys:

- Gemini: https://aistudio.google.com (Get API key)
- Groq: https://console.groq.com (API Keys). This one is optional, but it makes answers faster and more reliable.

1. Clone the repo:
   ```
   git clone https://github.com/nven07/doubt-solver.git
   cd doubt-solver
   ```
2. Create your secrets file from the template:
   - Windows (PowerShell): `copy .env.example .env`
   - Mac/Linux: `cp .env.example .env`
3. Open `.env` and fill in `GEMINI_API_KEY`, `GROQ_API_KEY`, and `JWT_SECRET` (any long random string, 32+ characters).
4. Start everything:
   ```
   docker compose up -d --build
   ```
5. Open **http://localhost:8080**, create an account, upload a PDF with **Attach**, and ask about it.

Stop the app with `docker compose down`. Your data is kept in a Docker volume, and `docker compose down -v` also deletes it.

## Troubleshooting

- **"AI is busy" or slow answers:** free AI tiers get overloaded at times. The app retries and switches providers automatically; wait a minute and try again.
- **Containers won't start:** make sure Docker Desktop is open, then run `docker compose logs gateway` or `docker compose logs ai-service` to see the error.
- **A key was rejected:** check `.env` for stray spaces or quotes, then run `docker compose up -d --build` again.

## Roadmap

- Google sign-in and password reset
- Study History and statistics
- gRPC between the gateway and AI service, and MongoDB for agent logs
- CI/CD with GitHub Actions, and an online deployment

## Notes

Free AI tiers may use prompts to improve their products, so don't upload private or confidential documents.