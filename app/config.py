from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    jwt_secret: str

    app_version: str = "0.1.0"
    app_commit: str = "unknown"
    app_built_at: str = "unknown"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
