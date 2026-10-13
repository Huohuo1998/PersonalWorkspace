#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
: "${BACKUP_RECIPIENT:?Set the fingerprint of a trusted GPG backup public key}"
command -v gpg >/dev/null
mkdir -p backups
backup_path="backups/workspace-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
temporary_path="${backup_path}.partial"
trap 'rm -f "$temporary_path"' EXIT
docker compose --env-file "${COMPOSE_ENV_FILE:-.env}" exec -T db pg_dump -U workspace -d workspace -Fc --no-owner --no-acl |
  gpg --batch --yes --encrypt --recipient "$BACKUP_RECIPIENT" --output "$temporary_path"
test -s "$temporary_path"
mv "$temporary_path" "$backup_path"
printf 'Encrypted backup: %s\n' "$backup_path"
