from prometheus_client import Counter, Histogram

CHECK_RUNS_TOTAL = Counter(
    "opswatch_checks_total",
    "Total monitor checks executed",
    ["type", "service", "environment", "severity", "success"],
)

CHECK_DURATION_SECONDS = Histogram(
    "opswatch_check_duration_seconds",
    "Total time spent running a monitor check (seconds)",
    ["type", "service", "environment", "severity"],
)

CHECK_ATTEMPTS = Histogram(
    "opswatch_check_attempts",
    "Number of attempts used for a monitor run (retries + 1)",
    ["type", "service", "environment", "severity"],
    buckets=(1, 2, 3, 4, 5, 6, 8, 10),
)

CHECK_EXCEPTIONS_TOTAL = Counter(
    "opswatch_check_exceptions_total",
    "Exceptions raised while running checks",
    ["type", "service", "environment", "severity", "exception"],
)
