import time

from google import genai
from google.genai import types
from openai import OpenAI

from app.config import settings

gemini = genai.Client(
    api_key=settings.gemini_api_key,
    http_options=types.HttpOptions(timeout=15000),
)

groq = None
if settings.groq_api_key:
    groq = OpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
        timeout=20,
    )

SYSTEM_PROMPT = (
    "You are a helpful study assistant. Explain things simply and clearly "
    "for school and college students. If a question starts with a tag like "
    "[Subject: Science], answer as an expert tutor of that subject and do "
    "not repeat the tag."
)

TRIES_PER_MODEL = 2
WAIT_SECONDS = 1


def is_timeout(err):
    text = str(err).lower()
    return any(word in text for word in ("timed out", "timeout", "deadline"))


def is_busy(err):
    text = str(err).lower()
    return any(
        word in text
        for word in (
            "503",
            "unavailable",
            "429",
            "resource_exhausted",
            "rate limit",
            "overloaded",
        )
    )


def provider_list():
    items = []
    if groq and settings.groq_model:
        items.append(("groq", settings.groq_model))
    items.append(("gemini", settings.llm_model))
    if settings.fallback_model and settings.fallback_model != settings.llm_model:
        items.append(("gemini", settings.fallback_model))
    return items


def build_contents(question, context):
    if not context:
        return question
    notes = "\n\n---\n\n".join(
        f"[From {c['filename']}]\n{c['content']}" for c in context
    )
    return (
        "Answer the student's question using the study notes below. "
        "Only use the notes if they are clearly relevant to the question. "
        "If they are not relevant, ignore them completely and answer from "
        "your own knowledge. Never mention the notes in that case.\n\n"
        f"STUDY NOTES:\n{notes}\n\n"
        f"QUESTION: {question}"
    )


def groq_messages(contents):
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": contents},
    ]


def run_once(provider, model, contents):
    if provider == "groq":
        response = groq.chat.completions.create(
            model=model, messages=groq_messages(contents)
        )
        return response.choices[0].message.content or ""
    response = gemini.models.generate_content(
        model=model,
        contents=contents,
        config={"system_instruction": SYSTEM_PROMPT},
    )
    return response.text or ""


def stream_once(provider, model, contents):
    if provider == "groq":
        stream = groq.chat.completions.create(
            model=model, messages=groq_messages(contents), stream=True
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    else:
        stream = gemini.models.generate_content_stream(
            model=model,
            contents=contents,
            config={"system_instruction": SYSTEM_PROMPT},
        )
        for chunk in stream:
            if chunk.text:
                yield chunk.text


def generate_with_fallback(contents):
    last_error = None
    for provider, model in provider_list():
        for attempt in range(TRIES_PER_MODEL):
            try:
                text = run_once(provider, model, contents)
                if text:
                    print(f"Answered by {provider}: {model}")
                    return text
                break
            except Exception as e:
                last_error = e
                print(f"{model} failed (try {attempt + 1}): {str(e)[:120]}")
                if is_timeout(e) or not is_busy(e):
                    break
                time.sleep(WAIT_SECONDS * (attempt + 1))
        print(f"Switching away from {model}")
    if last_error is None:
        last_error = RuntimeError("No answer was produced")
    raise last_error


def stream_with_fallback(contents):
    last_error = None
    for provider, model in provider_list():
        for attempt in range(TRIES_PER_MODEL):
            started = False
            try:
                for piece in stream_once(provider, model, contents):
                    if not started:
                        print(f"Answering with {provider}: {model}")
                    started = True
                    yield piece
                if started:
                    return
                break
            except Exception as e:
                if started:
                    raise
                last_error = e
                print(f"{model} failed (try {attempt + 1}): {str(e)[:120]}")
                if is_timeout(e) or not is_busy(e):
                    break
                time.sleep(WAIT_SECONDS * (attempt + 1))
        print(f"Switching away from {model}")
    if last_error is None:
        last_error = RuntimeError("No answer was produced")
    raise last_error


def ask_llm(question: str, context: list | None = None) -> str:
    return generate_with_fallback(build_contents(question, context))


def stream_llm(question: str, context: list | None = None):
    return stream_with_fallback(build_contents(question, context))