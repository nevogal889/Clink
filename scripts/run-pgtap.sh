#!/usr/bin/env bash
# Runs the pgTAP suite in supabase/tests against a fresh database on any Postgres 16 server
# that has the pgtap extension installed. Used by CI (.github/workflows/ci.yml, job "pgtap")
# and locally. Connection comes from the standard libpq variables: PGHOST, PGPORT, PGUSER,
# PGPASSWORD. SUPABASE_DIR overrides the folder (default: the repo's supabase/).
# Needs psql, createdb, dropdb and pg_prove on PATH.
#
# Order:
#   1. drop and create the database $PGTAP_DB (default clink_pgtap)
#   2. create extension pgtap
#   3. supabase/tests/setup/*.sql   optional, sorted: Supabase roles and auth shim for plain
#                                   Postgres. Must be idempotent (roles are cluster-wide).
#   4. supabase/migrations/*.sql    sorted, each in one transaction, stop on first error
#   5. pg_prove on supabase/tests/**/*.test.sql (Supabase's naming). No tests: exit 0.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPA="${SUPABASE_DIR:-$ROOT/supabase}"
DB="${PGTAP_DB:-clink_pgtap}"

for bin in psql createdb dropdb pg_prove; do
  command -v "$bin" >/dev/null || { echo "run-pgtap: $bin not found on PATH" >&2; exit 2; }
done

run_sql_file() {
  echo "  $1"
  psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$DB" -f "$1" >/dev/null
}

echo "run-pgtap: fresh database $DB"
dropdb --if-exists "$DB"
createdb "$DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgtap;'

shopt -s nullglob
setup=("$SUPA"/tests/setup/*.sql)
if ((${#setup[@]})); then
  echo "run-pgtap: setup"
  for f in "${setup[@]}"; do run_sql_file "$f"; done
fi

migrations=("$SUPA"/migrations/*.sql)
echo "run-pgtap: ${#migrations[@]} migration(s)"
for f in "${migrations[@]}"; do run_sql_file "$f"; done

mapfile -t tests < <(find "$SUPA/tests" -type f -name '*.test.sql' -not -path '*/setup/*' | sort)
if ((${#tests[@]} == 0)); then
  echo "run-pgtap: no tests yet in supabase/tests (*.test.sql). Nothing to run."
  exit 0
fi

echo "run-pgtap: ${#tests[@]} test file(s)"
pg_prove --dbname "$DB" --verbose --failures "${tests[@]}"
