#!/bin/sh
# PREFS write-path proof, over HTTP, on the browser's own path (:3000/api).
# Blast radius: one throwaway probe user created and deleted inside this script.
# No existing user's preferences are read, written, or touched.
set -u
STAMPTS=$(date -u +%Y%m%dT%H%M%SZ)
PROBE_EMAIL="b-prefs-probe-$STAMPTS@talaria-log.com"

echo "=== 0. create throwaway probe user (journal-entitled) ==="
docker exec talaria-journal-backend-1 python -c "
import traceback
from werkzeug.security import generate_password_hash
from app import app
from models import db, User
with app.app_context():
    try:
        u = User(
            name='B prefs probe',
            email='$PROBE_EMAIL',
            password_hash=generate_password_hash('probe-only-$STAMPTS'),
            role='user',
            is_active=True,
            has_journal_access=True,   # the product's own manual-grant path
        )
        db.session.add(u)
        db.session.commit()
        print('PROBE_USER_ID=%d' % u.id)
    except Exception:
        db.session.rollback()
        print('PROBE_CREATE_FAILED')
        traceback.print_exc()
" 2>&1 | grep -E '^PROBE_USER_ID=' > /tmp/probeid.txt
. /tmp/probeid.txt
echo "probe_user=$PROBE_USER_ID"
[ -n "${PROBE_USER_ID:-}" ] || { echo "VERDICT=ABORT_NO_PROBE_USER"; exit 1; }

echo "=== 0b. entitlement check through the product's own predicate ==="
docker exec talaria-journal-backend-1 python -c "
from app import app
from models import User
from routes.chart_routes import user_entitles_journal
with app.app_context():
    u = User.query.get($PROBE_USER_ID)
    print('ENTITLED=%s' % user_entitles_journal(u))
" 2>&1 | grep -E '^ENTITLED='

echo "=== 1. mint token (sentinel-delimited so startup chatter cannot pollute it) ==="
TOKEN=$(docker exec talaria-journal-backend-1 python -c "
import datetime
from app import app
from flask_jwt_extended import create_access_token
with app.app_context():
    print('TOKENSTART' + create_access_token(identity='$PROBE_USER_ID', expires_delta=datetime.timedelta(minutes=10)) + 'TOKENEND')
" 2>/dev/null | tr -d '\r' | sed -n 's/.*TOKENSTART\(.*\)TOKENEND.*/\1/p')
echo "token_len=${#TOKEN}"
[ ${#TOKEN} -gt 40 ] || { echo "VERDICT=ABORT_NO_TOKEN"; exit 1; }

BASE=http://127.0.0.1:3000/api/chart/preferences
AUTH="Authorization: Bearer $TOKEN"

echo "=== 2. GET before write (the call that used to 500) ==="
G1=$(curl -s -o /tmp/g1.json -w '%{http_code}' -H "$AUTH" "$BASE")
echo "GET1_status=$G1"
head -c 220 /tmp/g1.json; echo

echo "=== 3. POST a marked write — symbol + timezone, the two symptom fields ==="
MARK="PROBE-$STAMPTS"
cat > /tmp/w.json <<EOF
{"market_config":{"lastSymbol":"$MARK","selectedSymbol":"$MARK"},
 "general_settings":{"timezone":"Asia/Tokyo","probe":"$MARK"},
 "timeframe_favorites":["1H","4H"]}
EOF
P1=$(curl -s -o /tmp/p1.json -w '%{http_code}' -X POST -H "$AUTH" -H 'Content-Type: application/json' --data-binary @/tmp/w.json "$BASE")
echo "POST_status=$P1"
head -c 220 /tmp/p1.json; echo

echo "=== 4. GET after write, fresh connection (what a reload sees) ==="
sleep 1
G2=$(curl -s -o /tmp/g2.json -w '%{http_code}' -H 'Connection: close' -H "$AUTH" "$BASE")
echo "GET2_status=$G2"
head -c 400 /tmp/g2.json; echo

echo "=== 5. did the DB actually take it (independent of the API) ==="
docker exec talaria-journal-backend-1 python -c "
from app import app
from models import db
with app.app_context():
    r = db.session.execute(db.text('SELECT market_config, general_settings, timeframe_favorites, updated_at FROM user_preferences WHERE user_id=:u'), {'u': $PROBE_USER_ID}).fetchone()
    print('DB_ROW=%s' % ('present' if r else 'MISSING'))
    if r: print('DB_MARKET=%s' % (r[0],)); print('DB_GENERAL=%s' % (r[1],)); print('DB_FAVS=%s' % (r[2],)); print('DB_UPDATED=%s' % (r[3],))
" 2>&1 | grep -E '^DB_'

echo "=== 6. verdict ==="
if [ "$G1" = "200" ] && [ "$P1" = "200" ] && grep -q "$MARK" /tmp/g2.json; then
  echo "VERDICT=WRITE_PATH_PROVEN_OVER_HTTP"
else
  echo "VERDICT=WRITE_PATH_STILL_BROKEN g1=$G1 post=$P1"
fi

echo "=== 7. clean up the probe user, leave the DB as found ==="
docker exec talaria-journal-backend-1 python -c "
from app import app
from models import db, User
with app.app_context():
    db.session.execute(db.text('DELETE FROM user_preferences WHERE user_id=:u'), {'u': $PROBE_USER_ID})
    u = User.query.get($PROBE_USER_ID)
    if u: db.session.delete(u)
    db.session.commit()
    left = db.session.execute(db.text('SELECT count(*) FROM users WHERE id=:u'), {'u': $PROBE_USER_ID}).scalar()
    lp = db.session.execute(db.text('SELECT count(*) FROM user_preferences WHERE user_id=:u'), {'u': $PROBE_USER_ID}).scalar()
    print('CLEANUP users_left=%s prefs_left=%s' % (left, lp))
" 2>&1 | grep -E '^CLEANUP'
