#!/usr/bin/env bash
# Drizzle cannot express partial unique indexes, generated columns, or triggers.
# They are the correctness backbone here, so they live in SQL and are applied after push.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2-)"
psql "$URL" -v ON_ERROR_STOP=1 -q -f src/server/db/constraints.sql
echo "constraints applied"
