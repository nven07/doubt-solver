import time

from google import genai

from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)

SYSTEM_PROMPT = (
    "You are a helpful study assistant. Explain things simply and clearly "
    "for school and college students."
)

TRIES_PER_MODEL = 2
WAIT_SECONDS = 2


def is_busy(err):
    text = str(err)
    return any(
        word in text
        for word in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED")
    )


def generate(model, contents):
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config={"system_instruction": SYSTEM_PROMPT},
    )
    return response.text or "Sorry, I could not generate an answer."


def generate_with_fallback(contents):
    models = [settings.llm_model]
    if settings.fallback_model and settings.fallback_model != settings.llm_model:
        models.append(settings.fallback_model)

    last_error = None
    for model in models:
        for attempt in range(TRIES_PER_MODEL):
            try:
                return generate(model, contents)
            except Exception as e:
                last_error = e
                if not is_busy(e):
                    break
                print(f"{model} is busy (try {attempt + 1}), retrying...")
                time.sleep(WAIT_SECONDS * (attempt + 1))
        print(f"Switching away from {model}")
    raise last_error


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

    return generate_with_fallback(contents)