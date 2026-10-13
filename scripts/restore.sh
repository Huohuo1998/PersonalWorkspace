#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
backup_path="${1:?Usage: scripts/restore.sh backups/file.dump.gpg}"
restore_target="${RESTORE_DATABASE:-workspace_restore}"
if [[ "$restore_target" != workspace_restore ]]; then
  printf 'Only workspace_restore is allowed. Validate restoration before a manual production cutover.\n' >&2
  exit 1
fi
test -f "$backup_path"
docker compose --env-file "${COMPOSE_ENV_FILE:-.env}" exec -T db createdb -U workspace "$restore_target"
gpg --decrypt "$backup_path" |
  docker compose --env-file "${COMPOSE_ENV_FILE:-.env}" exec -T db pg_restore -U workspace -d "$restore_target" --no-owner --no-acl --exit-on-error
docker compose --env-file "${COMPOSE_ENV_FILE:-.env}" exec -T db psql -U workspace -d "$restore_target" -c 'SELECT version_num FROM alembic_version; SELECT count(*) AS users FROM users; SELECT count(*) AS transactions FROM financial_transactions;'
printf 'Restored into workspace_restore. Production has not been overwritten.\n'
