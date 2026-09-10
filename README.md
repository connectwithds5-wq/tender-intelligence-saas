# Tender Intelligence SaaS

AI-powered tender discovery and bid-decision platform for Indian businesses.

## Product direction

The product is intentionally focused on **decision intelligence**, not another generic tender-alert feed:

1. Build a company/business profile.
2. Ingest and normalize permitted public tender data.
3. Match tenders against category, geography, value range and experience.
4. Produce a transparent 0–100 fit score with reasons.
5. Add AI-assisted eligibility, risk and bid/no-bid analysis.
6. Deliver useful alerts through channels customers already use.

## Current MVP

- TypeScript + Node 20
- Zod domain validation
- Deterministic matching engine
- Tender HTTP API
- Lightweight browser dashboard
- Optional Supabase/Postgres persistence
- Generic JSON feed ingestion adapter
- Production-oriented database schema for profiles, tenders, matches and fetch runs
- Demo/in-memory mode when Supabase is not configured

## Run locally

```bash
npm install
npm run typecheck
npm run dev
```

Open `http://localhost:3000`.

### Configure a real feed

Copy `.env.example` to `.env`, then set `TENDER_FEED_URL` to a permitted JSON feed. The feed may return either an array or `{ "tenders": [...] }`.

Trigger ingestion:

```bash
curl -X POST http://localhost:3000/api/fetch
```

Check the dashboard or:

```bash
curl http://localhost:3000/api/tenders
```

### Supabase

Create a Supabase project, run `supabase/schema.sql` in its SQL editor, and set:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The server uses the service-role key only on the server. Never expose it in browser code.

## API

- `GET /api/health` — service/database status
- `GET /api/tenders` — latest tenders
- `POST /api/fetch` — ingest the configured feed
- `POST /api/profiles` — create a business profile
- `GET /api/matches?profileId=...` — score tenders against a demo-memory profile

## Architecture

```text
Dashboard
   ↓
HTTP API
   ├── Business profiles
   ├── Tender ingestion
   ├── Normalization / validation
   ├── Matching engine
   └── Persistence
          ↓
       Supabase/Postgres
```

### Next production modules

- Authentication and tenant isolation
- Scheduled hourly ingestion workers
- Multiple portal-specific adapters
- AI PDF/document eligibility analysis
- Evidence-backed eligibility checklist
- Saved searches and alerts
- Email + Telegram first; WhatsApp later
- Subscription/billing
- Admin/source-health monitoring
- Audit logs and observability

## Data-source principle

Only use tender data from sources and access patterns permitted by the relevant portal terms, robots/access controls and applicable law. Do not bypass CAPTCHA, authentication, paywalls or technical restrictions.

## Hard project boundary

This repository is a **separate product**. The existing `tendres` dashboard/repository is not modified as part of this project.
