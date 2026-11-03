import io

import psycopg
from google import genai
from google.genai import types
from pypdf import PdfReader

from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)

EMBED_DIM = 768
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


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


def embed_texts(texts, task_type):
    vectors = []
    for i in range(0, len(texts), 50):
        batch = texts[i : i + 50]
        result = client.models.embed_content(
            model=settings.embed_model,
            contents=batch,
            config=types.EmbedContentConfig(
                task_type=task_type, output_dimensionality=EMBED_DIM
            ),
        )
        vectors.extend([e.values for e in result.embeddings])
    return vectors


def ingest_pdf(filename, data):
    reader = PdfReader(io.BytesIO(data))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("No readable text found in this PDF")

    vectors = embed_texts(chunks, "RETRIEVAL_DOCUMENT")

    with psycopg.connect(settings.database_url) as conn:
        doc_id = conn.execute(
            "INSERT INTO documents (filename) VALUES (%s) RETURNING id",
            (filename,),
        ).fetchone()[0]
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO chunks (document_id, content, embedding) "
                "VALUES (%s, %s, %s::vector)",
                [(doc_id, c, to_vec(v)) for c, v in zip(chunks, vectors)],
            )
    return {"document_id": doc_id, "filename": filename, "chunks": len(chunks)}


def search_chunks(question, k=4):
    vec = embed_texts([question], "RETRIEVAL_QUERY")[0]
    with psycopg.connect(settings.database_url) as conn:
        rows = conn.execute(
            "SELECT c.content, d.filename, c.embedding <=> %s::vector AS distance "
            "FROM chunks c JOIN documents d ON d.id = c.document_id "
            "ORDER BY distance LIMIT %s",
            (to_vec(vec), k),
        ).fetchall()
    print("Note distances:", [round(r[2], 3) for r in rows])
    return [
        {"content": r[0], "filename": r[1]}
        for r in rows
        if r[2] <= settings.max_distance
    ]


def list_documents():
    with psycopg.connect(settings.database_url) as conn:
        rows = conn.execute(
            "SELECT id, filename FROM documents ORDER BY id DESC"
        ).fetchall()
    return [{"id": r[0], "filename": r[1]} for r in rows]