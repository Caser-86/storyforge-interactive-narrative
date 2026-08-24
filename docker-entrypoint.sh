#!/bin/sh
set -e

echo "[Entrypoint] StoryForge private text authoring starting..."
echo "[Entrypoint] SQLite path: ${SQLITE_DB_PATH:-/app/data/storyforge.sqlite}"
echo "[Entrypoint] No Redis, image worker, public sharing, or PostgreSQL service is required."
echo "[Entrypoint] Starting server on port ${PORT:-3000}..."
exec "$@"
