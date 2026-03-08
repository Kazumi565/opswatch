import os

import opswatch_worker.metrics  # noqa: F401
from prometheus_client import start_http_server
from redis import Redis
from rq import Connection, Queue, SimpleWorker

redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
conn = Redis.from_url(redis_url)

METRICS_PORT = int(os.getenv("WORKER_METRICS_PORT", "9101"))
start_http_server(METRICS_PORT)

if __name__ == "__main__":
    with Connection(conn):
        w = SimpleWorker([Queue("checks")])
        w.work()
