#!/bin/sh
set -eu

ARCHIVE="${1:?Usage: restore.sh /data/backups/archive.tar.gz}"
DATA_ROOT="${DATA_ROOT:-/data}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

case "$ARCHIVE" in /data/backups/*.tar.gz) ;; *) echo "Archive path not allowed" >&2; exit 2;; esac
MEMBERS="$(tar -tzf "$ARCHIVE")"
test "$MEMBERS" = "database.dump
storage.tar.gz
manifest.json" || { echo "Contenuto archivio non valido" >&2; exit 2; }
tar -xzf "$ARCHIVE" -C "$WORK"
test -s "$WORK/database.dump"
test -s "$WORK/storage.tar.gz"
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error --dbname "$DATABASE_URL" "$WORK/database.dump"
if tar -tzf "$WORK/storage.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Percorso non sicuro nell'archivio storage" >&2; exit 2
fi
tar -xzf "$WORK/storage.tar.gz" -C "$DATA_ROOT"
printf 'Ripristino completato da %s\n' "$ARCHIVE"
