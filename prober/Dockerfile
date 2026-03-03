FROM python:3.12-slim

WORKDIR /prober
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY . /prober
CMD ["python", "prober.py"]
