from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.llm import ask_llm

app = FastAPI(title="Doubt Solver AI Service")


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest):
    try:
        return AskResponse(answer=ask_llm(req.question))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")