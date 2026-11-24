#!/usr/bin/env bash
# Runs migrations exactly as production does, then the database checks.
# Usage: DATABASE_URL=postgres://... scripts/test-db.sh [--shim]
#   --shim  set up a plain Postgres to look like Supabase first (local use)
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL}"
if [[ "${1:-}" == "--shim" ]]; then
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f db/tests/supabase-shim.sql
fi
# A user who signed up before migrations ran, like production.
psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c \
  "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a0','early@test') on conflict do nothing" \
  2>/dev/null || psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c \
  "insert into auth.users (id, email, aud, role, instance_id) values ('00000000-0000-0000-0000-0000000000a0','early@test','authenticated','authenticated','00000000-0000-0000-0000-000000000000') on conflict do nothing"
node scripts/migrate.mjs
node scripts/migrate.mjs   # second run must be a no-op
psql "$DATABASE_URL" -q -f db/tests/rls.sql
