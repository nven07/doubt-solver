from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key: str = ""
    llm_model: str = "gemini-3.8-flash"
    fallback_model: str = "gemini-3.1-flash-lite"
    embed_model: str = "gemini-embedding-001"
    database_url: str = "postgresql://doubt:doubt_pass@127.0.0.1:5432/doubtsolver"
    max_distance: float = 0.55
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()