#!/usr/bin/env bash
# Concurrency checks that a single-transaction pgTAP file can't express (QA_PLAN L4):
#   1. the 20-friend cap holds when two accepts race
#   2. one live flare per sender holds when two sends race
# Runs against the database scripts/run-pgtap.sh just built ($PGTAP_DB, default clink_pgtap), which
# still has the schema, the shim and the tests helpers. Each check cleans up after itself.
# Usage: PGHOST=... PGPORT=... PGUSER=... bash supabase/tests/concurrency/races.sh
set -euo pipefail
DB="${PGTAP_DB:-clink_pgtap}"
psql_q() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
fail=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# --- 1. friend cap -------------------------------------------------------------------
psql_q <<'SQL' >/dev/null
select tests.create_user('race_a');
select tests.create_user('race_x');
select tests.create_user('race_y');
do $$ declare i int; begin
  for i in 1..19 loop perform tests.create_user('race_f' || i); perform tests.befriend('race_a', 'race_f' || i); end loop;
end $$;
insert into public.friend_requests (from_id, to_id, source) values
  (tests.id('race_x'), tests.id('race_a'), 'contacts'), (tests.id('race_y'), tests.id('race_a'), 'contacts');
SQL

accept_sql() {
  cat <<SQL
begin;
select private.accept_friend_request(tests.id('race_a'),
  (select id from public.friend_requests where from_id = tests.id('$1') and status = 'pending'));
select pg_sleep($2);
commit;
SQL
}
accept_sql race_x 1.5 | psql -X -q -At -d "$DB" >"$tmp/1.out" 2>&1 &
p1=$!
sleep 0.3
accept_sql race_y 0 | psql -X -q -At -d "$DB" >"$tmp/2.out" 2>&1 || true
wait "$p1" || true
count=$(psql_q -c "select private.friend_count(tests.id('race_a'))")
if [[ "$count" == "20" ]] && grep -q friend_cap "$tmp/2.out"; then
  echo "ok 1 - two racing accepts at 19 friends make exactly one friendship (count $count)"
else
  echo "not ok 1 - friend cap race: count $count"; cat "$tmp/1.out" "$tmp/2.out"; fail=1
fi

# --- 2. one live flare ---------------------------------------------------------------------
flare_sql() {
  cat <<SQL
begin;
select private.create_flare(tests.id('race_a'), 'coffee', null, 'Latte', null, 15, now(), 'everyone', null, 'UTC', 'widget', false);
select pg_sleep($1);
commit;
SQL
}
flare_sql 1.5 | psql -X -q -At -d "$DB" >"$tmp/3.out" 2>&1 &
p1=$!
sleep 0.3
flare_sql 0 | psql -X -q -At -d "$DB" >"$tmp/4.out" 2>&1 || true
wait "$p1" || true
live=$(psql_q -c "select count(*) from public.flares where sender_id = tests.id('race_a') and status = 'live'")
if [[ "$live" == "1" ]] && grep -q live_flare_exists "$tmp/4.out"; then
  echo "ok 2 - two racing sends leave exactly one live flare"
else
  echo "not ok 2 - live flare race: $live live"; cat "$tmp/3.out" "$tmp/4.out"; fail=1
fi

# --- cleanup ---------------------------------------------------------------------------------
psql_q <<'SQL' >/dev/null
delete from auth.users where id in (select id from tests.users where name like 'race\_%');
delete from tests.users where name like 'race\_%';
delete from private.rate_counters;
SQL
exit "$fail"
