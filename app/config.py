from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    jwt_secret: str
    opswatch_api_key: str = "dev-only-change-me"

    app_version: str = "0.2.0"
    app_commit: str = "dev"
    app_built_at: str = "local"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
