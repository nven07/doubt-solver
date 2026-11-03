from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.llm import ask_llm
from app.rag import ingest_pdf, init_db, list_documents, search_chunks

MAX_PDF_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
        print("Database ready")
    except Exception as e:
        print("Could not set up database:", e)
    yield


app = FastAPI(title="Doubt Solver AI Service", lifespan=lifespan)


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[str] = []


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/documents")
def documents():
    try:
        return {"documents": list_documents()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.post("/upload")
def upload(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file")

    data = file.file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF is larger than 10 MB")

    try:
        return ingest_pdf(file.filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    context = []
    try:
        context = search_chunks(req.question)
    except Exception as e:
        print("Note search skipped:", e)

    try:
        answer = ask_llm(req.question, context)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    sources = sorted({c["filename"] for c in context})
    return AskResponse(answer=answer, sources=sources)