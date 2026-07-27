#!/bin/sh
set -eu

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$TEST2_POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE talaria_test2_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
  PASSWORD :'app_password';
ALTER DATABASE talaria_test2 OWNER TO talaria_test2_app;
REVOKE ALL ON DATABASE talaria_test2 FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE talaria_test2 TO talaria_test2_app;
SQL
