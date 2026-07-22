#!/bin/sh
set -e
npx prisma migrate deploy
npx tsx prisma/seed.ts || true
exec npx next start -p "${PORT:-3000}"
