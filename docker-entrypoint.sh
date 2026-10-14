#!/bin/sh
set -eu

# Render Postgres provides a postgresql:// URL. JDBC requires jdbc:postgresql://.
if [ "${DB_URL:-}" != "" ] && [ "${DB_URL#postgresql://}" != "$DB_URL" ]; then
  export DB_URL="jdbc:$DB_URL"
fi

exec java ${JAVA_OPTS:-} -jar /app/app.jar
