#!/bin/sh
set -e

echo "[Entrypoint] StoryForge Interactive Narrative starting..."

if [ "$ENABLE_IMAGE_GENERATION" = "true" ]; then
  echo "[Entrypoint] Image generation: ENABLED (provider: ${IMAGE_PROVIDER:-mock})"
else
  echo "[Entrypoint] Image generation: DISABLED (text-only mode)"
fi

if [ -n "$DATABASE_URL" ]; then
  echo "[Entrypoint] Database URL configured. Migration will run on first API request."
else
  echo "[Entrypoint] No DATABASE_URL set, using in-memory database"
fi

echo "[Entrypoint] Starting server on port ${PORT:-3000}..."
exec "$@"
