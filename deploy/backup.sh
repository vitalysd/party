#!/bin/sh
set -eu
cd /opt/pati
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
destination="/opt/pati/backups/$stamp"
mkdir -p "$destination"
docker compose -f compose.yml exec -T postgres pg_dump -U pati_user -d pati_db -Fc > "$destination/database.dump"
test -s "$destination/database.dump"
tar -czf "$destination/uploads.tar.gz" uploads
cp .env livekit.yaml compose.yml Caddyfile "$destination/"
sha256sum "$destination/database.dump" "$destination/uploads.tar.gz" > "$destination/SHA256SUMS"
echo "Backup saved in $destination"
