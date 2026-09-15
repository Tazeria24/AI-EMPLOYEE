#!/usr/bin/env bash
#
# Apply every migration to a throwaway database, then run every isolation
# suite against it.
#
# The same script runs in CI and locally, so "it passes on my machine" and
# "it passes in CI" mean the same thing.
#
# Migrations and suites are discovered by glob, never listed here. That is the
# point: adding supabase/tests/foo_isolation.sql is enough to make CI run it,
# so a new suite cannot be forgotten, and a new migration cannot be left
# unapplied.
#
# Connection: standard libpq environment variables (PGHOST, PGUSER, PGPASSWORD,
# PGPORT). The databases named below are DROPPED and recreated.
#
#   locally:   su postgres -c "PGDATABASE=app bash scripts/db-test.sh"
#   with seed: SEED=1 ...  (checks the demo seed in a separate database)
#
set -euo pipefail

cd "$(dirname "$0")/.."

DB="${PGDATABASE:-app}"
SEED="${SEED:-0}"

# "extension already exists, skipping" on every run is noise that hides the
# one notice that would matter.
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

# Administrative commands connect to the maintenance database, not the one
# being dropped.
export PGDATABASE=postgres
PSQL_ADMIN=(psql -v ON_ERROR_STOP=1 -q -X)

psql_on() { psql -v ON_ERROR_STOP=1 -q -X -d "$1" "${@:2}"; }

migrations=(supabase/migrations/*.sql)
suites=(supabase/tests/*_isolation.sql)

if [ ${#migrations[@]} -eq 0 ] || [ ${#suites[@]} -eq 0 ]; then
  echo "No migrations or no isolation suites found — refusing to report success." >&2
  exit 1
fi

# Drop, create, and bring a database up to the current schema.
apply_schema() {
  local db="$1"
  "${PSQL_ADMIN[@]}" -c "drop database if exists \"$db\" with (force);"
  "${PSQL_ADMIN[@]}" -c "create database \"$db\";"
  psql_on "$db" -c "create extension if not exists vector;"
  # Local only: emulates auth.users, auth.uid() and the anon/authenticated
  # roles. A real Supabase project already provides these, which is why this
  # lives in tests/ rather than migrations/.
  psql_on "$db" -f supabase/tests/00_supabase_shim.sql
  for file in "${migrations[@]}"; do
    psql_on "$db" -f "$file"
  done
}

echo "==> Building '$DB' from ${#migrations[@]} migrations"
apply_schema "$DB"
for file in "${migrations[@]}"; do echo "    $(basename "$file")"; done

echo "==> Running ${#suites[@]} isolation suites"
failed=()
for file in "${suites[@]}"; do
  name="$(basename "$file" .sql)"
  # Each suite wraps itself in a transaction and rolls back, so they are
  # independent and order does not matter.
  if output="$(psql_on "$DB" -f "$file" 2>&1)"; then
    printf '    PASS  %s\n' "$name"
  else
    printf '    FAIL  %s\n' "$name"
    printf '%s\n' "$output" | sed 's/^/          /'
    failed+=("$name")
  fi
done

if [ "$SEED" = "1" ]; then
  # In its OWN database: the seed leaves a demo organization behind, and the
  # suites above assert absolute counts on an empty schema. Running both
  # against one database makes the seed look like a broken test.
  echo "==> Checking the demo seed (separate database, applied twice)"
  seed_db="${DB}_seed"
  apply_schema "$seed_db"
  if psql_on "$seed_db" -f supabase/seed/demo_business.sql >/dev/null 2>&1 &&
     psql_on "$seed_db" -f supabase/seed/demo_business.sql >/dev/null 2>&1; then
    orgs="$(psql_on "$seed_db" -tAc 'select count(*) from public.organizations')"
    if [ "$orgs" = "1" ]; then
      printf '    PASS  demo_seed (idempotent)\n'
    else
      printf '    FAIL  demo_seed — expected 1 organization after two runs, found %s\n' "$orgs"
      failed+=("demo_seed")
    fi
  else
    printf '    FAIL  demo_seed — could not apply\n'
    failed+=("demo_seed")
  fi
  "${PSQL_ADMIN[@]}" -c "drop database if exists \"$seed_db\" with (force);"
fi

echo
if [ ${#failed[@]} -gt 0 ]; then
  echo "${#failed[@]} check(s) failed: ${failed[*]}"
  exit 1
fi
echo "All ${#suites[@]} isolation suites passed."
