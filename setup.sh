#!/bin/bash
set -e
echo "Setting up DHiBob HR Platform..."
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
echo "DHiBob is ready! Run: npm run dev"
