
import time
import socket
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

import httpx
from sqlalchemy import select

from opswatch_worker.db import SessionLocal
from opswatch_worker.models import Monitor, CheckRun, MonitorType
from opswatch_worker.incidents import evaluate_incident

SYSTEM_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt"
MAX_BODY_BYTES = 16384


def _parse_host_port(value: str):
    s = value.strip()
    if not s:
        raise ValueError("target is empty")

    if s.startswith("["):
        if "]" not in s:
            raise ValueError("invalid IPv6 bracket format, expected [addr]:port")
        host = s[1 : s.index("]")]
        rest = s[s.index("]") + 1 :]
        if not rest.startswith(":"):
            raise ValueError("invalid IPv6 bracket format, expected [addr]:port")
        port_str = rest[1:]
    else:
        if ":" not in s:
            raise ValueError("expected host:port")
        host, port_str = s.rsplit(":", 1)

    host = host.strip()
    port_str = port_str.strip()

    if not host:
        raise ValueError("host is empty")

    port = int(port_str)
    if not (1 <= port <= 65535):
        raise ValueError("port must be 1..65535")

    return host, port


def _check_http(url: str, timeout_seconds: int, keyword: str | None):
    with httpx.Client(
        timeout=timeout_seconds,
        follow_redirects=True,
        verify=SYSTEM_CA_BUNDLE,
    ) as client:

        if not keyword:
            r = client.get(url)
            ok = 200 <= r.status_code < 400
            return ok, r.status_code, None

        buf = bytearray()
        with client.stream("GET", url) as r:
            status = r.status_code
            for chunk in r.iter_bytes():
                if not chunk:
                    continue
                take = min(len(chunk), MAX_BODY_BYTES - len(buf))
                if take > 0:
                    buf.extend(chunk[:take])
                if len(buf) >= MAX_BODY_BYTES:
                    break

        ok_status = 200 <= status < 400
        text = buf.decode("utf-8", errors="ignore")
        matched = keyword in text
        ok = ok_status and matched

        if not ok_status:
            return False, status, f"http status {status}"
        if not matched:
            return False, status, "keyword not found"

        return True, status, None


def _check_tcp(target: str, timeout_seconds: int):
    host, port = _parse_host_port(target)
    with socket.create_connection((host, port), timeout=timeout_seconds):
        return True, None, None


def _check_dns(hostname: str, timeout_seconds: int):
    host = hostname.strip()
    if not host:
        raise ValueError("dns target is empty")
    if "://" in host or "/" in host:
        raise ValueError("dns target must be hostname only")

    def _resolve():
        return socket.getaddrinfo(host, None)

    with ThreadPoolExecutor(max_workers=1) as ex:
        fut = ex.submit(_resolve)
        try:
            res = fut.result(timeout=timeout_seconds)
        except FuturesTimeoutError:
            raise TimeoutError(f"dns resolve timeout after {timeout_seconds}s")

    if not res:
        raise RuntimeError("dns resolved empty result")

    return True, None, None


def run_check(monitor_id: int) -> None:
    started = datetime.now(timezone.utc)
    t0 = time.perf_counter()

    with SessionLocal() as db:
        m = db.scalar(select(Monitor).where(Monitor.id == monitor_id))
        if not m:
            return

        attempts = 0
        success = False
        status_code = None
        error = None

        retries = int(getattr(m, "retries", 0) or 0)
        keyword = getattr(m, "http_keyword", None)

        for i in range(retries + 1):
            attempts += 1
            try:
                if m.type == MonitorType.http:
                    success, status_code, error = _check_http(
                        m.target, m.timeout_seconds, keyword
                    )
                elif m.type == MonitorType.tcp:
                    success, status_code, error = _check_tcp(
                        m.target, m.timeout_seconds
                    )
                elif m.type == MonitorType.dns:
                    success, status_code, error = _check_dns(
                        m.target, m.timeout_seconds
                    )
                else:
                    error = f"check type not implemented: {m.type}"
                    success = False
            except Exception as e:
                error = f"{type(e).__name__}: {e}"
                success = False

            if success:
                break

            if i < retries:
                time.sleep(min(1.0, 0.2 * (2 ** i)))

        dur_ms = int((time.perf_counter() - t0) * 1000)

        db.add(
            CheckRun(
                monitor_id=m.id,
                started_at=started,
                duration_ms=dur_ms,
                attempts=attempts,
                success=success,
                status_code=status_code,
                error=error,
            )
        )
        db.commit()
        evaluate_incident(db, m.id)
        db.commit()
