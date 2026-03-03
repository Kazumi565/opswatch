import os

from redis import Redis
from rq import Connection, Queue, Worker

redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
conn = Redis.from_url(redis_url)

if __name__ == "__main__":
    with Connection(conn):
        w = Worker([Queue("checks")])
        w.work()
