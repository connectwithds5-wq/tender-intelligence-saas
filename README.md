# Tender Intelligence SaaS

AI-powered tender discovery and bid-decision platform for Indian businesses.

## Product direction

The product is intentionally focused on **decision intelligence**, not another generic tender-alert feed:

1. Build a company/business profile.
2. Ingest and normalize public tender data from permitted sources.
3. Match every tender against the company's categories, geography, value range and experience.
4. Produce a transparent 0–100 fit score with reasons.
5. Add AI-assisted eligibility, risk and bid/no-bid analysis.
6. Deliver useful alerts through the channels customers already use.

Current competitors show strong demand for AI matching, eligibility scoring and smart alerts, so the MVP is being built around those high-value workflows rather than a large portal-count claim. citeturn0search0turn0search3turn0search7

## Current MVP foundation

- TypeScript + Node 20
- Zod domain validation
- Deterministic tender/profile matching engine
- Transparent match reasons and BID / REVIEW / SKIP recommendation
- Safe demo fixtures for local smoke testing

Run locally:

```bash
npm install
npm run typecheck
npm run dev
```

## Architecture roadmap

```text
Web dashboard
    ↓
Business profile
    ↓
Tender ingestion → normalization → deduplication
    ↓
Matching engine → eligibility/risk AI
    ↓
Tender score + evidence
    ↓
Alerts / pipeline / bid workspace
```

### Planned production modules

- Authentication and tenant isolation
- PostgreSQL persistence
- Tender source adapters
- Scheduled ingestion workers
- AI document/PDF analysis
- Eligibility checklist with evidence
- Saved searches and alerts
- Email + Telegram first; WhatsApp later
- Subscription/billing
- Admin and source-health monitoring
- Audit logs and observability

## Data-source principle

Only use tender data from sources and access patterns that are permitted by the relevant portal terms, robots/access controls and applicable law. Do not bypass CAPTCHA, authentication, paywalls or technical restrictions.

## Hard project boundary

This repository is a **separate product**. The existing `tendres` dashboard/repository is not modified as part of this project.
