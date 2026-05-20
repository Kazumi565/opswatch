import os

from config import settings
from fastapi import APIRouter, Depends
from schemas import RuntimeInfoOut
from security import require_authenticated_context

router = APIRouter(
    prefix="/api",
    tags=["runtime"],
    dependencies=[Depends(require_authenticated_context)],
)


def optional_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


@router.get("/runtime", response_model=RuntimeInfoOut)
def runtime_info():
    deployment_mode = os.getenv("OPSWATCH_DEPLOYMENT_MODE", "compose").strip() or "compose"
    orchestrator = os.getenv("OPSWATCH_ORCHESTRATOR", "docker-compose").strip() or "docker-compose"
    cloud_provider = os.getenv("OPSWATCH_CLOUD_PROVIDER", "local").strip() or "local"
    image_tag = (
        os.getenv("OPSWATCH_IMAGE_TAG", settings.app_version).strip() or settings.app_version
    )

    return RuntimeInfoOut(
        deployment_mode=deployment_mode,
        orchestrator=orchestrator,
        cloud_provider=cloud_provider,
        namespace=optional_env("OPSWATCH_K8S_NAMESPACE"),
        pod_name=optional_env("OPSWATCH_K8S_POD_NAME"),
        node_name=optional_env("OPSWATCH_K8S_NODE_NAME"),
        image_tag=image_tag,
        version=settings.app_version,
        commit=settings.app_commit,
        built_at=settings.app_built_at,
        health_status="ok",
    )
