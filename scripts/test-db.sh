#!/usr/bin/env bash
# Builds a throwaway database with every migration applied, runs the SQL tests,
# then re-applies every migration on top of the test data to prove they're safe to re-run.
# Connection comes from the usual Postgres env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD).
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PGOPTIONS='-c client_min_messages=warning'
DB="tsayvish_test_$$"
psql -d postgres -q -c "create database $DB"
trap 'psql -d postgres -q -c "drop database if exists $DB" >/dev/null' EXIT
apply() { psql -d "$DB" -q -v ON_ERROR_STOP=1 -o /dev/null -f "$1" 2> >(grep -v "wal_level\|HINT:" >&2); }
apply supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do apply "$f"; done
echo "Applied $(ls supabase/migrations/*.sql | wc -l) migrations"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
for f in supabase/migrations/*.sql; do apply "$f"; done
echo "Migrations re-applied cleanly on top of test data"
