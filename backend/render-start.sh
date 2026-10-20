#!/bin/sh
# Render start command: keep a single worker unless WEB_CONCURRENCY is set.
cd "$(dirname "$0")"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-1}"
