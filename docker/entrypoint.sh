#!/bin/sh
set -e

echo "Starting container with NODE_ENV=${NODE_ENV:-development} on port ${PORT:-3004}"

if [ -z "$DATABASE_URL" ]; then
  echo "WARNING: DATABASE_URL is not set. Prisma commands may fail."
fi

echo "Applying database schema..."
if npx prisma migrate deploy; then
  echo "Migrations applied."
else
  echo "No migrations to apply or migrate failed; attempting db push..."
  npx prisma db push
fi

echo "Launching Next.js..."
exec npm run start -- -p "${PORT:-3004}"


