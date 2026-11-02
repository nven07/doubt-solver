from google import genai

from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)

SYSTEM_PROMPT = (
    "You are a helpful study assistant. Explain things simply and clearly "
    "for school and college students."
)


def ask_llm(question: str) -> str:
    response = client.models.generate_content(
        model=settings.llm_model,
        contents=question,
        config={"system_instruction": SYSTEM_PROMPT},
    )
    return response.text