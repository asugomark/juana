#!/bin/sh
set -e

echo "[Juana Backend] Starting container entrypoint..."

# Wait for database if DATABASE_URL is configured
if [ -n "$DATABASE_URL" ]; then
  echo "[Juana Backend] Checking database connectivity..."
  python3 - << 'EOF'
import os
import sys
import time
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    sys.exit(0)

max_retries = 30
retry_interval = 2

for attempt in range(1, max_retries + 1):
    try:
        engine = create_engine(db_url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print(f"[Juana Backend] Database connection successful.")
        sys.exit(0)
    except Exception as exc:
        print(f"[Juana Backend] Waiting for database (attempt {attempt}/{max_retries}): {exc}")
        time.sleep(retry_interval)

print("[Juana Backend] ERROR: Could not connect to database after maximum retries.")
sys.exit(1)
EOF
fi

# Run database migrations
echo "[Juana Backend] Running database migrations (flask db upgrade)..."
flask db upgrade || {
    echo "[Juana Backend] Warning: Migration command returned non-zero. Continuing startup..."
}

echo "[Juana Backend] Executing application command: $@"
exec "$@"
