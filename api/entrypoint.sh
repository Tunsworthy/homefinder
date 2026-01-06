#!/bin/sh
# Entrypoint script for API container

set -e

echo "Waiting for Postgres..."
until pg_isready -h postgres -p 5432 -U housefinder; do
  echo "Postgres is unavailable - sleeping"
  sleep 1
done

echo "Postgres is up - executing command"

# Run the provided command
exec "$@"
