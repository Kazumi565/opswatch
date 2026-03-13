from typing import Annotated

from config import settings
from fastapi import Header, HTTPException, status


def require_api_key(
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> str:
    if not x_api_key or x_api_key != settings.opswatch_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing api key",
        )
    return "api_key"
