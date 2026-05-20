# Interview Preparation Guide — DHiBob Project

Based on the Develeap Bootcamp workshop "Presenting a Project in an Interview."
Tailored to your DHiBob HR platform built with Next.js + tRPC + Prisma + AWS.

---

## The Three Principles

### 1. Preparation — know DHiBob deeply
### 2. Listening — steer toward your strengths
### 3. Enthusiasm — you built this, own it

---

## The Four Dimensions of DHiBob

### 01 · Value (30-second answer)

> "DHiBob is a full HR management platform I built for Develeap — 132 real employees use it. It replaces six separate tools: BambooHR-style people management, Google Sheets for expenses and licenses, Monday.com for IT asset tracking, manual approval chains, and scattered document storage. One system, one login, real data."

**Go deeper**: time-off approval chain (HR + team leader + group leader all must approve), expense reimbursement with monthly reports, org chart with collapsible D3 tree, IT ticketing system, S3 document storage with per-person folders, deployed on AWS with Terraform.

### 02 · Architecture (30-second answer)

> "Next.js 14 frontend with tRPC for type-safe API calls, Prisma ORM on PostgreSQL. Auth via NextAuth JWT sessions with Redis caching. Files go to S3 via a storage abstraction that swaps between local disk and S3 based on an env var. Deployed on a single EC2 behind Caddy for TLS, managed via Terraform modules."

**Go deeper — know these well:**

| Layer | Technology | Why this choice |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TailwindCSS | SSR, file-based routing, co-located API |
| API | tRPC | End-to-end type safety, no code generation |
| ORM | Prisma | Type-safe queries, schema-first, easy migrations |
| DB | PostgreSQL | Relational data fits HR domain perfectly |
| Auth | NextAuth.js (JWT + Redis) | Credentials provider, session caching |
| Storage | S3 + LocalStorageProvider | Abstraction layer — same interface, swappable backend |
| Infra | Terraform (modular) | VPC, EC2, S3, IAM, Route53 — all codified |
| Notifications | Resend (email) + Slack (bot DM) | Gracefully degrade when keys aren't set |
| Org Chart | D3-hierarchy | Collapsible tidy tree, handles 132 nodes |

**Architecture diagram you should be able to draw:**
```
Browser → Caddy (TLS) → Next.js App (:3000)
                              ├── tRPC routes → Prisma → PostgreSQL
                              ├── /api/files/* → S3 (presigned URLs)
                              ├── NextAuth → JWT + Redis blocklist
                              └── Notification dispatcher → Resend + Slack
```

### 03 · Interface & UX (30-second answer)

> "Dark mode, responsive sidebar, tab-based employee profiles with 8 sections. The org chart uses a collapsible D3 tree — click to expand groups. Time-off has a calendar view, the approval queue shows per-slot status for the 3-approver chain. Expenses have month/year dropdowns and Excel export. Documents support multi-file upload with per-person S3 folders."

**Demos to have ready:**
1. Log in as admin → People page (132 employees)
2. Click an employee → Profile tabs (General, Work, Assets, IT Equipment, Bank, Pension)
3. Org chart → expand Dori Kafri → show the groups
4. Time off → submit a request → show the 3-approver queue
5. IT Tickets → submit one → respond as IT user
6. IT Assets → hardware inventory table
7. IT Licenses → license catalog with per-employee assignments

### 04 · Implementation (30-second answer)

> "26 Prisma models, ~15 tRPC routers, 400+ tests passing. The multi-approver time-off system snapshots the approval chain at submission so manager changes don't break pending requests. The storage layer has a factory pattern — `STORAGE_DRIVER=s3` flips from local disk to S3 with zero code changes. Exchange rates refresh daily from the ECB API."

**Code areas you must know cold:**

| Area | File | Key concept |
|---|---|---|
| Multi-approver flow | `src/server/routers/timeoff.ts` | 3 slots (HR/TL/GL), each PENDING→APPROVED/REJECTED/SKIPPED. Overall status derived from slot statuses. |
| Storage abstraction | `src/lib/storage.ts` | `StorageProvider` interface, `LocalStorageProvider` + `S3StorageProvider`, factory at bottom of file. `sanitizeFolderPath` preserves `/` in paths. |
| Org chart | `src/components/org-chart/tree-view.tsx` | D3 `hierarchy()` + `tree()` layout, `foreignObject` for HTML cards in SVG, pan/zoom via refs. |
| Notifications | `src/lib/notification-dispatcher.ts` | `sendExternal()` fans out to email + Slack. Graceful skip when env vars missing. |
| Per-person S3 folders | `src/lib/people-folder.ts` | `peopleFolder({id, firstName, lastName})` → `people/<slug>-<id-suffix>` |
| Currency conversion | `src/lib/currency.ts` | Live ECB rates cached 24h server-side, `convertCurrency()` with fallback to hardcoded rates. |
| Docker entrypoint | `docker-entrypoint.sh` | `prisma migrate deploy` (not `db push`), seed gated by `RUN_SEED=true`, respects `$@` for one-off commands. |

---

## The Two Self-Tests

### The 9-Year-Old Test
> "It's like a phone book for a company, but instead of just names and numbers, it knows everyone's boss, their vacation days, their laptop, and their software licenses. When someone wants a day off, it asks three people if it's OK before saying yes."

### The One-Minute Test
> "DHiBob is an HR platform I built from scratch for Develeap. 132 real employees. It handles people profiles, org charts, time-off with a 3-level approval chain, expense tracking, IT ticketing, hardware inventory, software license management, document storage in S3, and reporting with Excel export. Built with Next.js, tRPC, Prisma, PostgreSQL, deployed on AWS via Terraform. The whole thing runs on a single t3.micro for under $10/month."

---

## Elevator Pitch (30 seconds)

> "I built a full HR management system called DHiBob for Develeap — it's used by 132 real employees today. It replaces BambooHR, Google Sheets, and Monday.com with one platform covering people management, time-off approvals, expenses, IT support, and document storage. I designed the architecture, wrote the infrastructure as code with Terraform, and deployed it to AWS. Want me to walk you through it?"

---

## "Why tRPC and not REST?" (expect this question)

### What is type-safe RPC?

**RPC** (Remote Procedure Call) means the client calls a server function by name — `trpc.tickets.create.useMutation()` — instead of making an HTTP request to a URL like `POST /api/tickets`.

**Type-safe** means TypeScript knows the exact input and output shapes at both ends. If the server's `tickets.create` expects `{ title: string, category: string }`, the client gets a compile error on a typo or missing field. No runtime surprise, no 400 Bad Request you only discover when testing.

No OpenAPI spec, no Swagger doc, no code generation step. Change the server schema → the client breaks at compile time → you fix it before shipping.

### Why not REST?

| | REST | tRPC |
|---|---|---|
| **Type safety** | None by default. Need OpenAPI + codegen for types. | Automatic. Change the Zod schema, TypeScript errors appear in the client instantly. |
| **Boilerplate** | 160 procedures = 160 route files, each with request parsing, validation, error handling. | Each procedure is ~10 lines. Validation, auth, error handling are shared via middleware. |
| **Best for** | Multiple different clients (mobile, third-party, CLI). Public APIs. | Frontend and backend in the **same repo, same language**. Internal tools. |

### The trade-off (know this — interviewers love trade-off awareness)

tRPC is not accessible outside the codebase. No URL a mobile app can hit. If Develeap ever needed a public API or mobile app, we'd add REST endpoints alongside tRPC for external consumers. For an internal HR tool with one client in the same repo, tRPC eliminates an entire class of bugs with zero extra work.

### One-sentence answer

> "tRPC gives me end-to-end type safety between frontend and backend with no code generation — I change a Zod schema on the server and TypeScript catches every broken callsite at build time. I chose it over REST because this is a single-repo full-stack app with one consumer, so the public-API flexibility of REST wasn't needed."

### The numbers

21 routers, ~160 procedures. That's the entire API surface — every backend operation (people, time-off, expenses, IT tickets, org chart, etc.) goes through tRPC.

---

## Preparation Checklist (your task before the interview)

- [ ] **Draw the architecture** — open Excalidraw, sketch the diagram from memory, then verify against the codebase
- [ ] **Stand up the demo** — `docker compose up` locally, or verify the AWS deployment is live at `https://3-221-137-207.nip.io`
- [ ] **High-level code pass** — skim each of the 15 tRPC routers, know what each one does
- [ ] **Deep dive on key areas** — multi-approver flow, storage abstraction, org chart rendering, Terraform modules
- [ ] **Practice the elevator pitch** — say it out loud, time it, keep it under 30 seconds
- [ ] **Mock interview** — have someone (even non-technical) ask you about the project
- [ ] **Prepare an opener** — "Want me to show you a recent project I built?" or "I have a live HR platform I can demo right now"

---

## What If They Ask Something You Don't Know?

1. **"I'm not sure about that specific detail, but here's how I'd approach finding out..."**
2. **"I haven't implemented that yet, but I know it would involve..."**
3. **"That's a great question — would you like to think through it together?"**

---

## Your Strengths to Steer Toward

Based on what you've built, these are your strongest talking points:

1. **Real production deployment** — not a tutorial project; 132 employees use it daily
2. **Full-stack ownership** — frontend, backend, database, infra, CI/CD
3. **Infrastructure as Code** — Terraform modules, S3 storage, EC2 with cloud-init
4. **Multi-approver workflow design** — complex business logic with slot-based approvals
5. **Storage abstraction** — clean provider pattern that swaps local ↔ S3 via env var
6. **Budget constraints** — deployed a real system for under $10/month on AWS
7. **Iterating on user feedback** — you took HR tester feedback and shipped changes same-day

---

## The Sandwich Pattern (for every answer)

1. **Context**: "Let me give you a bit of background..."
2. **The Answer**: direct response to what they asked
3. **Invitation**: "Would you also like to see how the [related feature] works?"

Example:
> **Q**: "How do you handle file uploads?"
>
> **Context**: "We needed to support CVs, contracts, expense receipts, and HR portal documents — some going to S3 in production, some staying on local disk in development."
>
> **Answer**: "I built a StorageProvider abstraction with two implementations: LocalStorageProvider writes to disk, S3StorageProvider uses presigned URLs. A factory at module level checks STORAGE_DRIVER env var. All callers use the same interface — uploadFile, getDownloadUrl, deleteFile."
>
> **Invitation**: "Want me to show you how the per-person folder structure works in S3? Each employee gets their own prefix based on their name."

---

*"You didn't come for an interview. You came to tell the story of your project."*
