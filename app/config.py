from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    opswatch_auth_secret: str | None = None
    legacy_jwt_secret: str | None = Field(default=None, validation_alias="JWT_SECRET")
    opswatch_api_key: str | None = None
    opswatch_session_ttl_hours: int = 12
    opswatch_auth_cookie_secure: bool = False

    app_version: str = "0.3.0"
    app_commit: str = "dev"
    app_built_at: str = "local"

    @model_validator(mode="after")
    def validate_auth_settings(self) -> "Settings":
        if not self.auth_secret:
            raise ValueError(
                "OPSWATCH_AUTH_SECRET is required (JWT_SECRET is supported only as a deprecated fallback)"
            )
        return self

    @property
    def auth_secret(self) -> str:
        return self.opswatch_auth_secret or self.legacy_jwt_secret or ""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
