#!/usr/bin/env bash
# Takes a real backup of one database, restores it into a scratch database, and proves the copy is identical.
#
#   scripts/ops/backup-restore-check.sh [source-database] [--keep]
#
# The source is only READ (pg_dump). The restore goes to "<source>_restore_check", which the script creates and
# drops itself and refuses to use for anything else. Run it against a disposable database (default: sidewalk_e2e)
# to rehearse, and against a copy of production data to prove your real backups restore. With APP_ENV_FILE set
# to a .env file, it also runs `prisma migrate status` and `ops:check` against the restored copy.
#
# It talks to the Postgres container from docker-compose.yml. For a managed or host-installed Postgres, run the
# same pg_dump / pg_restore / psql commands from docs/operations.md#backup-and-restore directly.
set -euo pipefail

SRC="sidewalk_e2e"
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP=1 ;;
    *) SRC="$arg" ;;
  esac
done
PGUSER="${PGUSER:-sidewalk}"
SCRATCH="${SRC}_restore_check"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/${SRC}-${STAMP}.dump"
WORK="$(mktemp -d)"
COMPOSE="docker compose"

case "$SRC" in
  *_restore_check) echo "Refusing: the source looks like a scratch database." >&2; exit 2 ;;
esac

# stdin is closed on purpose: `docker compose exec -T` would otherwise swallow the input of an enclosing `while read`
# loop, and silently check only the first table.
sql() { local db="$1"; shift; $COMPOSE exec -T postgres psql -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 -At "$@" < /dev/null; }
step() { printf '\n== %s\n' "$*"; }
cleanup() {
  rm -rf "$WORK"
  if [ "$KEEP" -eq 0 ]; then sql postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH\" WITH (FORCE)" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

step "Backup: pg_dump (custom format) of $SRC"
mkdir -p "$BACKUP_DIR"
$COMPOSE exec -T postgres pg_dump -U "$PGUSER" --format=custom --compress=6 --no-owner --no-acl "$SRC" > "$FILE"
SIZE="$(wc -c < "$FILE" | tr -d ' ')"
if command -v sha256sum >/dev/null 2>&1; then SUM="$(sha256sum "$FILE" | cut -d' ' -f1)"; else SUM="$(shasum -a 256 "$FILE" | cut -d' ' -f1)"; fi
echo "wrote $FILE ($SIZE bytes, sha256 $SUM)"
[ "$SIZE" -gt 1000 ] || { echo "The backup is suspiciously small." >&2; exit 1; }

step "Restore: pg_restore into a fresh scratch database $SCRATCH"
sql postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH\" WITH (FORCE)" >/dev/null
sql postgres -c "CREATE DATABASE \"$SCRATCH\"" >/dev/null
$COMPOSE exec -T postgres pg_restore -U "$PGUSER" --no-owner --no-acl --exit-on-error -d "$SCRATCH" < "$FILE"
echo "restored without errors"

# Everything except the rate-limit counters, which are live, disposable and unlogged.
TABLES="$(sql "$SRC" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'RateLimitBucket' ORDER BY 1")"
[ -n "$TABLES" ] || { echo "The source has no tables." >&2; exit 1; }

fingerprint() {
  local db="$1" t
  while IFS= read -r t; do
    sql "$db" -c "SELECT '$t', count(*), coalesce(md5(string_agg(x::text, E'\n' ORDER BY x::text)), 'empty') FROM \"$t\" x"
  done <<< "$TABLES"
}
structure() {
  sql "$1" -c "
    SELECT 'index ' || indexname FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'constraint ' || conname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
    UNION ALL SELECT 'trigger ' || tgname FROM pg_trigger WHERE NOT tgisinternal
    UNION ALL SELECT 'function ' || proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION ALL SELECT 'enum ' || typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e'
    ORDER BY 1"
}

step "Compare: row counts and content hash of every table"
fingerprint "$SRC" > "$WORK/source.tables"
fingerprint "$SCRATCH" > "$WORK/restored.tables"
EXPECTED_COUNT="$(printf '%s\n' "$TABLES" | wc -l | tr -d ' ')"
[ "$(wc -l < "$WORK/source.tables" | tr -d ' ')" = "$EXPECTED_COUNT" ] || { echo "Compared fewer tables than exist; the check is not trustworthy." >&2; exit 1; }
if diff "$WORK/source.tables" "$WORK/restored.tables" > "$WORK/tables.diff"; then
  echo "$(wc -l < "$WORK/source.tables" | tr -d ' ') of $(printf '%s\n' "$TABLES" | wc -l | tr -d ' ') tables identical (rows and content):"
  awk -F'|' '{ printf "  %-28s %s rows\n", $1, $2 }' "$WORK/source.tables"
else
  echo "MISMATCH between source and restored data:" >&2; cat "$WORK/tables.diff" >&2; exit 1
fi

step "Compare: schema objects (indexes, constraints, triggers, functions, enums)"
structure "$SRC" > "$WORK/source.structure"
structure "$SCRATCH" > "$WORK/restored.structure"
if diff "$WORK/source.structure" "$WORK/restored.structure" > "$WORK/structure.diff"; then
  echo "$(wc -l < "$WORK/source.structure" | tr -d ' ') objects identical"
  grep -c '^trigger ' "$WORK/restored.structure" | xargs echo "append-only/integrity triggers restored:"
else
  echo "MISMATCH in schema objects:" >&2; cat "$WORK/structure.diff" >&2; exit 1
fi

step "Guards still work in the restored copy"
AUDIT_ROWS="$(sql "$SCRATCH" -c 'SELECT count(*) FROM "AuditLog"')"
if [ "$AUDIT_ROWS" -gt 0 ]; then
  if sql "$SCRATCH" -c 'UPDATE "AuditLog" SET action = action' >/dev/null 2>&1; then
    echo "The audit log is NOT append-only in the restored database." >&2; exit 1
  fi
  echo "UPDATE on AuditLog is rejected (append-only trigger restored)"
else
  echo "no audit rows to test against; triggers were compared above"
fi

if [ -n "${APP_ENV_FILE:-}" ]; then
  step "Application checks against the restored copy"
  ORIGINAL_URL="$(grep -E '^DATABASE_URL=' "$APP_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')"
  RESTORED_URL="$(printf '%s' "$ORIGINAL_URL" | sed -E "s#/[^/?]+(\\?|\$)#/${SCRATCH}\\1#")"
  ( cd apps/api
    echo "prisma migrate status:"
    DATABASE_URL="$RESTORED_URL" DOTENV_CONFIG_PATH="$APP_ENV_FILE" npx prisma migrate status 2>&1 | grep -v '^$' | tail -6 || true
    echo; echo "ops:check:"
    DATABASE_URL="$RESTORED_URL" DOTENV_CONFIG_PATH="$APP_ENV_FILE" npx tsx scripts/ops-check.ts || true ) || true
fi

printf '\nRESTORE VERIFIED: %s -> %s\n' "$SRC" "$SCRATCH"
echo "Backup file: $FILE (sha256 $SUM)"
