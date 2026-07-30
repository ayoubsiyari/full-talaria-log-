#!/bin/sh
# PREFS-500 / schema drift repair and preflight.
#
# Root cause of "GET /api/chart/preferences 500": the UserPreferences ORM model
# selects every column, and the deployed table is missing one, so psycopg2 raises
# UndefinedColumn and BOTH the read and the write path 500 before touching data.
# alembic_version on canary is `add_strategy_lab`; the revision that adds the
# column (`add_indicator_settings_templates`) was never applied.
#
# This script is additive and idempotent: ADD COLUMN IF NOT EXISTS only. It never
# drops, renames, or rewrites a row, so it cannot lose preferences, and it does
# not touch any image — the pinned canary build stays exactly as measured.
#
#   --check   report drift, change nothing (exit 3 if drift found)
#   --apply   add the missing columns, then re-report
set -e
MODE="${1:---check}"

# Columns the model declares (journal-backend/models.py, class UserPreferences).
# JSON for every one of these in the model; keep the two lists in the same order.
COLS="tool_defaults timeframe_favorites chart_templates keyboard_shortcuts drawing_tool_styles drawing_tool_templates indicator_settings_templates v9_chart_templates panel_sync_settings panel_settings market_config protection_settings general_settings"

psql_q() {
  docker exec talaria-db-1 sh -c "psql -tAq -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"$1\""
}

present="$(psql_q "select column_name from information_schema.columns where table_name='user_preferences'")"

missing=""
for c in $COLS; do
  echo "$present" | tr -d '\r' | grep -qx "$c" || missing="$missing $c"
done

echo "alembic_version=$(psql_q 'select version_num from alembic_version' | tr -d '\r')"
echo "table_columns=$(echo "$present" | tr -d '\r' | wc -l | tr -d ' ')"
echo "missing_columns=${missing:-none}"

if [ -z "$missing" ]; then
  echo "PREFS_SCHEMA_OK"
  exit 0
fi

if [ "$MODE" != "--apply" ]; then
  echo "PREFS_SCHEMA_DRIFT"
  exit 3
fi

for c in $missing; do
  echo "adding $c"
  psql_q "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS $c JSON"
done

# Prove the exact SELECT the ORM issues now succeeds, rather than assuming it.
psql_q "select count(*) from (select $(echo $COLS | tr ' ' ',') , keep_drawing_enabled, created_at, updated_at from user_preferences limit 1) t" \
  && echo "ORM_SHAPED_SELECT_OK"

present2="$(psql_q "select column_name from information_schema.columns where table_name='user_preferences'")"
still=""
for c in $COLS; do
  echo "$present2" | tr -d '\r' | grep -qx "$c" || still="$still $c"
done
echo "missing_after=${still:-none}"
[ -z "$still" ] && echo "PREFS_SCHEMA_REPAIRED"
