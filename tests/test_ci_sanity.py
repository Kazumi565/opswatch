# tests/test_ci_sanity.py
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_repo_has_expected_top_level_files():
    assert (ROOT / "docker-compose.yml").exists(), "docker-compose.yml missing"
    assert (ROOT / "docker-compose.observability.yml").exists(), "docker-compose.observability.yml missing"
    assert (
        ROOT / "docker-compose.observability.dev-fast.yml"
    ).exists(), "docker-compose.observability.dev-fast.yml missing"
    assert (ROOT / "README.md").exists(), "README.md missing"
    assert (ROOT / ".env.example").exists(), ".env.example missing"


def test_expected_service_dirs_exist():
    assert (ROOT / "app").exists(), "app/ directory missing"
    assert (ROOT / "worker").exists(), "worker/ directory missing"
    assert (ROOT / "frontend").exists(), "frontend/ directory missing"


def test_worker_entrypoints_exist():
    # based on your current gotchas / module paths
    assert (ROOT / "worker" / "opswatch_worker").exists(), "worker/opswatch_worker missing"
    assert (ROOT / "worker" / "opswatch_worker" / "jobs.py").exists(), "jobs.py missing"
    assert (ROOT / "worker" / "opswatch_worker" / "scheduler.py").exists(), "scheduler.py missing"


def test_compose_mentions_core_services():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8", errors="ignore").lower()
    for name in ["postgres", "redis", "api", "worker", "scheduler", "frontend"]:
        assert name in compose, f"'{name}' not found in docker-compose.yml text"
