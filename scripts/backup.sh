#!/bin/sh
set -eu

BACKUP_ROOT="${1:-/data/backups}"
DATA_ROOT="${DATA_ROOT:-/data}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
ARCHIVE="$BACKUP_ROOT/candidature-hub-$STAMP.tar.gz"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$BACKUP_ROOT"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file "$WORK/database.dump"
tar --exclude='./backups' --exclude='./.restore-stage' -czf "$WORK/storage.tar.gz" -C "$DATA_ROOT" .
printf '{"format":1,"createdAt":"%s","database":"postgresql","storageRoot":"/data"}\n' "$STAMP" > "$WORK/manifest.json"
tar -czf "$ARCHIVE" -C "$WORK" database.dump storage.tar.gz manifest.json
printf '%s\n' "$ARCHIVE"
