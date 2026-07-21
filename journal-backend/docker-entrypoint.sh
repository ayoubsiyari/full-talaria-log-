#!/bin/sh
# Ensure upload dirs exist and are writable by the non-root `app` user.
# Named volumes mount as root:root; without this, screenshot uploads get Errno 13.
set -e
UPLOAD_ROOT="${UPLOAD_FOLDER:-/app/uploads}"
mkdir -p "$UPLOAD_ROOT/screenshots" "$UPLOAD_ROOT/strategy-images"
if [ "$(id -u)" = "0" ]; then
  chown -R app:app "$UPLOAD_ROOT" || true
  exec gosu app "$@"
fi
exec "$@"
