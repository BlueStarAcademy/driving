#!/bin/sh
set -e
npx prisma migrate deploy
npx tsx prisma/seed.ts || true
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
