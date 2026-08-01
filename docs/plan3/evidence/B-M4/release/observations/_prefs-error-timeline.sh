#!/bin/sh
# Repair landed 2026-07-29T23:59:05Z. Any occurrence AFTER that is a live defect.
echo "=== last 5 occurrences with docker timestamps ==="
docker logs talaria-journal-backend-1 --since 12h -t 2>&1 \
  | grep 'indicator_settings_templates does not exist' | tail -5
echo "=== occurrences strictly after the repair ==="
docker logs talaria-journal-backend-1 --since 2026-07-30T00:00:00Z -t 2>&1 \
  | grep -c 'indicator_settings_templates does not exist'
echo "=== any 500 on the preferences route since the repair ==="
docker logs talaria-journal-backend-1 --since 2026-07-30T00:00:00Z 2>&1 \
  | grep -E 'chart/preferences' | grep -c ' 500 '
echo "=== status code census on that route since the repair ==="
docker logs talaria-journal-backend-1 --since 2026-07-30T00:00:00Z 2>&1 \
  | grep -oE 'GET /api/chart/preferences HTTP/1.[01]" [0-9]{3}|POST /api/chart/preferences HTTP/1.[01]" [0-9]{3}' \
  | awk '{print $1, $3}' | sort | uniq -c
echo "=== does the column exist right now, asked of the DB ==="
docker exec talaria-journal-backend-1 python -c "
from app import app
from models import db
with app.app_context():
    r = db.session.execute(db.text(\"SELECT count(*) FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='indicator_settings_templates'\")).scalar()
    print('COLUMN_PRESENT=%s' % r)
" 2>&1 | grep COLUMN_PRESENT
