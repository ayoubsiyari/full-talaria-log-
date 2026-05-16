#!/bin/sh
set -e
exec gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 --access-logfile - --error-logfile - "app:app"
