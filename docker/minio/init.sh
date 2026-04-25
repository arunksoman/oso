#!/bin/sh
set -eu

attempt=0
max_attempts=90

until mc alias set local http://minio:9000 osodev osodevpass >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "MinIO init failed: server not reachable" >&2
    exit 1
  fi
  sleep 2
done

mc mb --ignore-existing local/oso-test >/dev/null
mc anonymous set none local/oso-test >/dev/null

echo "MinIO init complete. Bucket: oso-test"
