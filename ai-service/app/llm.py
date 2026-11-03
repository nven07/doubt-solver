from google import genai

from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)

SYSTEM_PROMPT = (
    "You are a helpful study assistant. Explain things simply and clearly "
    "for school and college students."
)


def ask_llm(question: str, context: list | None = None) -> str:
    if context:
        notes = "\n\n---\n\n".join(
            f"[From {c['filename']}]\n{c['content']}" for c in context
        )
        contents = (
            "Answer the student's question using the study notes below. "
            "If the notes do not cover it, say so briefly, then give a short "
            "general answer.\n\n"
            f"STUDY NOTES:\n{notes}\n\n"
            f"QUESTION: {question}"
        )
    else:
        contents = question

    response = client.models.generate_content(
        model=settings.llm_model,
        contents=contents,
        config={"system_instruction": SYSTEM_PROMPT},
    )
    return response.text