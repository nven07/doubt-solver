import json
from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent import run_agent
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

    grpc_server = None
    try:
        from app.grpc_server import start_grpc

        grpc_server = start_grpc()
    except Exception as e:
        print("gRPC server not started:", e)

    yield

    if grpc_server:
        grpc_server.stop(0)


app = FastAPI(title="Doubt Solver AI Service", lifespan=lifespan)


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[str] = []


def get_user_id(x_user_id):
    try:
        return int(x_user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Missing user")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/documents")
def documents(x_user_id: str | None = Header(default=None)):
    user_id = get_user_id(x_user_id)
    try:
        return {"documents": list_documents(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.post("/upload")
def upload(
    file: UploadFile = File(...),
    x_user_id: str | None = Header(default=None),
):
    user_id = get_user_id(x_user_id)

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file")

    data = file.file.read()
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF is larger than 10 MB")

    try:
        return ingest_pdf(file.filename, data, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")


def find_context(question, user_id):
    try:
        return search_chunks(question, user_id)
    except Exception as e:
        print("Note search skipped:", e)
        return []


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest, x_user_id: str | None = Header(default=None)):
    user_id = get_user_id(x_user_id)
    context = find_context(req.question, user_id)

    try:
        answer = ask_llm(req.question, context)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    sources = sorted({c["filename"] for c in context})
    return AskResponse(answer=answer, sources=sources)


@app.post("/ask-stream")
def ask_stream(req: AskRequest, x_user_id: str | None = Header(default=None)):
    user_id = get_user_id(x_user_id)
    tool, pieces, sources = run_agent(req.question, user_id)

    try:
        first = next(pieces)
    except StopIteration:
        first = ""
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    def body():
        if first:
            yield first
        try:
            for piece in pieces:
                yield piece
        except Exception as e:
            print("Stream stopped early:", e)

    return StreamingResponse(
        body(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Sources": quote(json.dumps(sources)), "X-Tool": tool},
    )