from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key: str = ""
    llm_model: str =  "gemini-3.8-flash"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()