#!/usr/bin/env bash
# Spustí bezpečnostný regresný test databázy na JEDNORAZOVEJ lokálnej Postgres.
# Nikdy sa nepripája na Supabase/produkciu — vytvorí dočasný klaster, načíta všetky
# migrácie zo supabase/migrations/, spustí supabase/tests/security_regression.sql
# a klaster zmaže.
#
# Použitie (z koreňa repa):
#   bash supabase/tests/run-local.sh
# Premenné: PGBIN (adresár s initdb/pg_ctl/psql; predvolene E:/PostgreSQL/bin alebo PATH),
#           PGPORT (predvolene 55499).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-}"
if [ -z "$PGBIN" ]; then
  if [ -d "/e/PostgreSQL/bin" ]; then PGBIN="/e/PostgreSQL/bin"; elif command -v psql >/dev/null; then PGBIN="$(dirname "$(command -v psql)")"; fi
fi
[ -z "$PGBIN" ] && { echo "Nenašiel som PostgreSQL (nastav PGBIN)."; exit 2; }
export PATH="$PGBIN:$PATH"

PORT="${PGPORT:-55499}"
DATA="$(mktemp -d)"
cleanup() { pg_ctl -D "$DATA" stop -m fast >/dev/null 2>&1; rm -rf "$DATA"; }
trap cleanup EXIT

initdb -D "$DATA" -E UTF8 --locale=C -U postgres >/dev/null 2>&1 || { echo "initdb zlyhal"; exit 2; }
pg_ctl -D "$DATA" -o "-p $PORT" -l "$DATA/log" start >/dev/null || { echo "štart Postgres zlyhal"; exit 2; }
sleep 2
H="-h 127.0.0.1 -p $PORT -U postgres"
createdb $H sec
P="psql $H -d sec -q"

# Stuby Supabase: roly, schéma auth (auth.uid() z current_setting), pg_cron, realtime publikácia.
$P >/dev/null 2>&1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema cron; create table cron.job (jobid serial, jobname text);
create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(text) returns boolean language sql as $$ select true $$;
create publication supabase_realtime;
SQL

echo "Načítavam migrácie…"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  # 0018 zlyhá na `create extension pg_cron` (v tomto stube netreba) — ostatné chyby ukáž.
  out=$($P -v ON_ERROR_STOP=0 -f "$f" 2>&1 | grep -E "ERROR" | grep -v "pg_cron")
  [ -n "$out" ] && { echo "CHYBA v $(basename "$f"):"; echo "$out"; exit 3; }
done

echo "Spúšťam bezpečnostný test…"
psql $H -d sec -t -A -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/security_regression.sql" 2>&1 | grep -v '^$'
RC="${PIPESTATUS[0]}"

# Súbehový test: 30 PARALELNÝCH relácií sa naraz snaží rezervovať AI slot s limitom 5/deň.
# Pôvodný limit (count → volanie → zápis) by prepustil všetkých 30; atomická rezervácia presne 5.
echo "Súbehový test rezervácie AI limitov (30 paralelných relácií, limit 5)…"
$P -c "insert into auth.users (id, email, raw_user_meta_data) values ('eeeeeeee-0000-0000-0000-00000000000e','conc@x.sk','{\"role\":\"trainer\"}')" >/dev/null 2>&1
OUT="$DATA/conc"; mkdir -p "$OUT"
for i in $(seq 1 30); do
  psql $H -d sec -t -A -q -c "select coalesce(public.reserve_ai_slot('plan_gen','eeeeeeee-0000-0000-0000-00000000000e',null,'m','trainer',5,5,100000)::text,'-')" > "$OUT/$i" 2>&1 &
done
wait
GRANTED=$(cat "$OUT"/* | grep -vc '^-$\|^$')
if [ "$GRANTED" -eq 5 ]; then echo "PASS|súbeh: presne 5 z 30 paralelných rezervácií prešlo"; else echo "FAIL|súbeh: prešlo $GRANTED z 30 (očakávané 5)"; RC=1; fi
exit "$RC"
