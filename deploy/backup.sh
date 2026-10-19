#!/usr/bin/env bash
# Nightly backup: runs the CE backup (Postgres + Reticulum storage), encrypts it, copies it off-site, prunes old copies.
# Install on the server:  sudo crontab -e  →  30 2 * * * /opt/classroom-platform/deploy/backup.sh >> /var/log/classroom-backup.log 2>&1
# Needs in deploy/.env:
#   BACKUP_PASSPHRASE=<long random string, also stored in the team password manager>
#   BACKUP_REMOTE=<rclone remote:path, e.g. hetzner-s3:classroom-backups>   (configure with `rclone config`)
#   BACKUP_KEEP_DAYS=14
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
set -a; . "$HERE/.env"; set +a
CE="$HERE/work/hubs-cloud/community-edition"
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in deploy/.env}"
: "${BACKUP_REMOTE:?set BACKUP_REMOTE in deploy/.env}"
KEEP="${BACKUP_KEEP_DAYS:-14}"

echo "== $(date -Is) backup start"
cd "$CE"
npm run --silent backup
LATEST="$(ls -1dt data_backups/data_backup_* | head -1)"
ARCHIVE="/tmp/$(basename "$LATEST").tar.gz.gpg"

tar -czf - -C "$(dirname "$LATEST")" "$(basename "$LATEST")" \
  | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$ARCHIVE"

rclone copy "$ARCHIVE" "$BACKUP_REMOTE/"
rm -f "$ARCHIVE"

# Retention: local plaintext backups 2 days; off-site encrypted copies $KEEP days (RA 10173: no indefinite retention).
find data_backups -maxdepth 1 -name 'data_backup_*' -mtime +2 -exec rm -rf {} +
rclone delete --min-age "${KEEP}d" "$BACKUP_REMOTE/"
echo "== $(date -Is) backup done: $(basename "$ARCHIVE")"
