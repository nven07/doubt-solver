import io
import re
import time

import psycopg
from google import genai
from google.genai import types
from pypdf import PdfReader

from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)

EMBED_DIM = 768
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150

EMBED_BATCH = 25
EMBED_PER_MINUTE = 80
MAX_CHUNKS = 300


def init_db():
    with psycopg.connect(settings.database_url) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )
        conn.execute(
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id INTEGER"
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS chunks (
                id SERIAL PRIMARY KEY,
                document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                embedding vector({EMBED_DIM})
            )
            """
        )


def to_vec(values):
    return "[" + ",".join(str(x) for x in values) + "]"


def chunk_text(text):
    text = " ".join(text.split())
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + CHUNK_SIZE])
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def is_rate_limited(err):
    text = str(err)
    return "429" in text or "RESOURCE_EXHAUSTED" in text


def retry_wait(err):
    found = re.search(r"retry in ([\d.]+)s", str(err))
    seconds = float(found.group(1)) if found else 15.0
    return min(max(seconds + 1, 5.0), 60.0)


def embed_texts(texts, task_type):
    vectors = []
    window_start = time.monotonic()
    used = 0

    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i : i + EMBED_BATCH]

        elapsed = time.monotonic() - window_start
        if elapsed >= 60:
            window_start = time.monotonic()
            used = 0
        elif used + len(batch) > EMBED_PER_MINUTE:
            time.sleep(60 - elapsed + 1)
            window_start = time.monotonic()
            used = 0

        result = None
        for attempt in range(5):
            try:
                result = client.models.embed_content(
                    model=settings.embed_model,
                    contents=batch,
                    config=types.EmbedContentConfig(
                        task_type=task_type, output_dimensionality=EMBED_DIM
                    ),
                )
                break
            except Exception as e:
                if not is_rate_limited(e):
                    raise
                wait = retry_wait(e)
                print(f"Embedding limit hit, waiting {wait:.0f}s (try {attempt + 1})")
                time.sleep(wait)
                window_start = time.monotonic()
                used = 0

        if result is None:
            raise RuntimeError(
                "Gemini embedding limit reached. Please try again in a minute."
            )

        used += len(batch)
        vectors.extend([e.values for e in result.embeddings])

    return vectors


def ingest_pdf(filename, data, user_id):
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = text.encode("utf-8", "ignore").decode("utf-8")
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("No readable text found in this PDF")
    if len(chunks) > MAX_CHUNKS:
        raise ValueError(
            f"This PDF is too long for the free plan ({len(chunks)} pieces, "
            f"the limit is {MAX_CHUNKS}). Please upload a shorter chapter."
        )

    print(f"Embedding {len(chunks)} pieces from {filename}...")
    vectors = embed_texts(chunks, "RETRIEVAL_DOCUMENT")

    with psycopg.connect(settings.database_url) as conn:
        doc_id = conn.execute(
            "INSERT INTO documents (filename, user_id) VALUES (%s, %s) RETURNING id",
            (filename, user_id),
        ).fetchone()[0]
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO chunks (document_id, content, embedding) "
                "VALUES (%s, %s, %s::vector)",
                [(doc_id, c, to_vec(v)) for c, v in zip(chunks, vectors)],
            )
    return {"document_id": doc_id, "filename": filename, "chunks": len(chunks)}


def search_chunks(question, user_id, k=4):
    with psycopg.connect(settings.database_url) as conn:
        has_notes = conn.execute(
            "SELECT EXISTS (SELECT 1 FROM documents WHERE user_id = %s)",
            (user_id,),
        ).fetchone()[0]
        if not has_notes:
            return []

        vec = embed_texts([question], "RETRIEVAL_QUERY")[0]
        rows = conn.execute(
            "SELECT c.content, d.filename, c.embedding <=> %s::vector AS distance "
            "FROM chunks c JOIN documents d ON d.id = c.document_id "
            "WHERE d.user_id = %s "
            "ORDER BY distance LIMIT %s",
            (to_vec(vec), user_id, k),
        ).fetchall()
    print("Note distances:", [round(r[2], 3) for r in rows])
    return [
        {"content": r[0], "filename": r[1]}
        for r in rows
        if r[2] <= settings.max_distance
    ]


def list_documents(user_id):
    with psycopg.connect(settings.database_url) as conn:
        rows = conn.execute(
            "SELECT id, filename FROM documents WHERE user_id = %s ORDER BY id DESC",
            (user_id,),
        ).fetchall()
    return [{"id": r[0], "filename": r[1]} for r in rows]


def get_recent_chunks(user_id, limit=10):
    with psycopg.connect(settings.database_url) as conn:
        rows = conn.execute(
            "SELECT c.content, d.filename FROM chunks c "
            "JOIN documents d ON d.id = c.document_id "
            "WHERE d.id = (SELECT MAX(id) FROM documents WHERE user_id = %s) "
            "ORDER BY c.id LIMIT %s",
            (user_id, limit),
        ).fetchall()
    return [{"content": r[0], "filename": r[1]} for r in rows]