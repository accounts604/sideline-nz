#!/usr/bin/env bash
# Apply the two pending migrations (size-name-placement + ezra-tables) to
# the live Neon DB. Idempotent — both migrations use ADD COLUMN IF NOT
# EXISTS / CREATE TABLE IF NOT EXISTS. Safe to re-run.
#
# Usage: bash scripts/apply-pending-migrations.sh
set -euo pipefail

DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/^"//;s/"$//')
if [ -z "$DATABASE_URL" ]; then
  echo "Could not read DATABASE_URL from .env" >&2
  exit 1
fi

echo "→ Waking Neon..."
psql "$DATABASE_URL" -c "SELECT 1 AS ok"

echo "→ Applying size-name-placement.sql..."
psql "$DATABASE_URL" -f migrations/size-name-placement.sql

echo "→ Applying ezra-tables.sql..."
psql "$DATABASE_URL" -f migrations/ezra-tables.sql

echo
echo "→ Verifying:"
echo "  order_size_breakdowns:"
psql "$DATABASE_URL" -c "\d order_size_breakdowns" | grep name_placement || echo "  (name_placement column NOT found)"

echo "  ezra tables:"
psql "$DATABASE_URL" -c "\dt ezra_*"

echo
echo "Done."
