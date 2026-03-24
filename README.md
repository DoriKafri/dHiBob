# DHiBob - Modern HR Platform

Full-featured HiBob HR platform clone built with Next.js 14, TypeScript, and Tailwind CSS.

## Features

- 15 modules: People, Onboarding, Time Off, Payroll, Performance, Compensation, Hiring, Learning, Surveys, Analytics, Workforce Planning, Documents, Settings
- 12 Radix UI components with Recharts analytics dashboards
- tRPC routers with business logic services
- Prisma schema with 23+ models and SQLite
- 9 Vitest test files with 100+ test cases
- CI/CD workflows and Docker config

## Tech Stack

- Frontend: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS
- State: Zustand, React Query, React Hook Form
- API: tRPC with Zod validation
- Database: Prisma ORM with SQLite
- Auth: NextAuth.js
- UI: Radix UI primitives, Lucide icons, Recharts
- Testing: Vitest, Testing Library

## Getting Started

npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev

Open http://localhost:3000
