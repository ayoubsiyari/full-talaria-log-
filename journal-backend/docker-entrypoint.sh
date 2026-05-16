#!/bin/sh
set -e
echo "journal-backend: verifying app import..."
python -c "from app import app; print('journal-backend: app import OK')"
exec gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 --access-logfile - --error-logfile - "app:app"
