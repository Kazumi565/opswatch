from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_repo_has_expected_top_level_files():
    assert (ROOT / "docker-compose.yml").exists(), "docker-compose.yml missing"
    assert (ROOT / "docker-compose.observability.yml").exists(), (
        "docker-compose.observability.yml missing"
    )
    assert (ROOT / "docker-compose.observability.dev-fast.yml").exists(), (
        "docker-compose.observability.dev-fast.yml missing"
    )
    assert (ROOT / "docker-compose.deploy.yml").exists(), "docker-compose.deploy.yml missing"
    assert (ROOT / "docker-compose.deploy.observability.yml").exists(), (
        "docker-compose.deploy.observability.yml missing"
    )
    assert (ROOT / "README.md").exists(), "README.md missing"
    assert (ROOT / ".env.example").exists(), ".env.example missing"
    assert (ROOT / ".github" / "workflows" / "ci.yml").exists(), "ci workflow missing"


def test_expected_service_dirs_exist():
    assert (ROOT / "app").exists(), "app/ directory missing"
    assert (ROOT / "worker").exists(), "worker/ directory missing"
    assert (ROOT / "frontend").exists(), "frontend/ directory missing"


def test_worker_entrypoints_exist():
    assert (ROOT / "worker" / "opswatch_worker").exists(), "worker/opswatch_worker missing"
    assert (ROOT / "worker" / "opswatch_worker" / "jobs.py").exists(), "jobs.py missing"
    assert (ROOT / "worker" / "opswatch_worker" / "scheduler.py").exists(), "scheduler.py missing"


def test_compose_mentions_core_services():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8", errors="ignore").lower()
    for name in ["postgres", "redis", "migrate", "api", "worker", "scheduler", "frontend"]:
        assert name in compose, f"'{name}' not found in docker-compose.yml text"


def test_deploy_assets_exist():
    assert (ROOT / "deploy" / "README.md").exists(), "deploy/README.md missing"
    assert (ROOT / "deploy" / ".env.vm.example").exists(), "deploy/.env.vm.example missing"
    assert (ROOT / "deploy" / "caddy" / "Caddyfile").exists(), "deploy/caddy/Caddyfile missing"
    assert (ROOT / "deploy" / "systemd" / "opswatch.service").exists(), (
        "deploy/systemd/opswatch.service missing"
    )
    assert (ROOT / "deploy" / "systemd" / "opswatch.systemd.env.example").exists(), (
        "deploy/systemd/opswatch.systemd.env.example missing"
    )
    assert (ROOT / "deploy" / "scripts" / "backup_postgres.sh").exists(), (
        "deploy/scripts/backup_postgres.sh missing"
    )
    assert (ROOT / "deploy" / "scripts" / "restore_postgres.sh").exists(), (
        "deploy/scripts/restore_postgres.sh missing"
    )
    assert (ROOT / "deploy" / "scripts" / "validate_deploy.sh").exists(), (
        "deploy/scripts/validate_deploy.sh missing"
    )


def test_deploy_compose_keeps_internal_services_non_public_by_default():
    deploy_compose = (
        (ROOT / "docker-compose.deploy.yml").read_text(encoding="utf-8", errors="ignore").lower()
    )
    for internal_port in ["5432:", "6379:", "9090:", "9093:", "3000:3000", "8000:"]:
        assert internal_port not in deploy_compose, (
            f"internal port mapping '{internal_port}' should not be public in deploy compose"
        )


def test_deploy_observability_ports_are_localhost_bound():
    obs_compose = (
        (ROOT / "docker-compose.deploy.observability.yml")
        .read_text(encoding="utf-8", errors="ignore")
        .lower()
    )
    for localhost_port in [
        "127.0.0.1:9090:9090",
        "127.0.0.1:9093:9093",
        "127.0.0.1:3000:3000",
    ]:
        assert localhost_port in obs_compose, (
            f"observability port mapping '{localhost_port}' should be localhost-bound"
        )


def test_makefile_mentions_demo_seed():
    makefile = (ROOT / "scripts" / "makefile").read_text(encoding="utf-8", errors="ignore").lower()
    assert "demo-seed" in makefile, "'demo-seed' target missing from scripts/makefile"


def test_ci_mentions_frontend_and_compose_smoke():
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8", errors="ignore"
    )
    assert "npm --prefix frontend run build" in workflow
    assert "docker compose up -d --build postgres redis migrate api worker scheduler" in workflow
