#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .runtime
if ! docker inspect personal-workspace-dev-db >/dev/null 2>&1; then
  docker run -d --name personal-workspace-dev-db -e POSTGRES_USER=workspace -e POSTGRES_DB=workspace -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:5432:5432 postgres:16-alpine >/dev/null
else
  docker start personal-workspace-dev-db >/dev/null
fi
for attempt in {1..30}; do
  if docker exec personal-workspace-dev-db pg_isready -U workspace -d workspace >/dev/null; then break; fi
  sleep 1
done
(cd backend && ../.venv/bin/alembic upgrade head)
if ! curl -fsS http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
  (cd backend && nohup ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 > ../.runtime/api.log 2>&1 &)
fi
if ! curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
  (cd web && nohup npm run dev > ../.runtime/web.log 2>&1 &)
fi
for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
    printf 'Development API and web are responding on loopback ports 8000 and 5173.\n'
    exit 0
  fi
  sleep 1
done
printf 'Startup failed; inspect .runtime/api.log and .runtime/web.log.\n' >&2
exit 1
