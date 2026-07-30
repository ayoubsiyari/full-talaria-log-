#!/bin/sh
# The 500 came from SQLAlchemy emitting a SELECT with a column the table lacked.
# Verify through the SAME ORM the endpoint uses, in the running container, rather
# than through raw psql (which would prove the table, not the query the app makes).
echo "=== ORM read path (what get_preferences does) ==="
docker exec talaria-journal-backend-1 python -c "
from app import app
from models import UserPreferences
with app.app_context():
    row = UserPreferences.query.first()
    print('ORM_SELECT_OK rows_exist=%s' % (row is not None))
    if row is not None:
        print('indicator_settings_templates=%r' % (row.indicator_settings_templates,))
" 2>&1 | tail -5

echo "=== ORM write path (what update_preferences does), then rolled back ==="
docker exec talaria-journal-backend-1 python -c "
from app import app, db
from models import UserPreferences
with app.app_context():
    row = UserPreferences.query.first()
    if row is None:
        print('NO_ROW_TO_TEST')
    else:
        before = row.indicator_settings_templates
        row.indicator_settings_templates = {'__b_probe': True}
        db.session.flush()
        print('ORM_WRITE_FLUSH_OK')
        db.session.rollback()
        print('ROLLED_BACK unchanged=%s' % (UserPreferences.query.first().indicator_settings_templates == before))
" 2>&1 | tail -5

echo "=== endpoint statuses since the repair ==="
docker logs --since 10m talaria-journal-backend-1 2>&1 | grep 'api/chart/preferences' \
  | sed -E 's/.*"([A-Z]+) [^"]*" ([0-9]{3}).*/\1 \2/' | sort | uniq -c
echo "loading_errors_since_repair=$(docker logs --since 10m talaria-journal-backend-1 2>&1 | grep -c 'Error loading preferences')"
