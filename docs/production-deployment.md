# Production deployment and source audit

## Dashboard + analysis API

The dashboard is hosted on GitHub Pages and remains static. The document-analysis API is implemented as a separate Vercel Node.js Function so the Supabase service-role key never reaches the browser.

Configure the Vercel project with these **server-side** environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — sensitive; never put this in GitHub Pages or frontend code.
- `SUPABASE_ANON_KEY`
- `DASHBOARD_ORIGIN` — normally `https://connectwithds5-wq.github.io`

Configure these GitHub repository secrets for deployment:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `TENDER_API_BASE_URL` — the Vercel production URL, for example `https://<project>.vercel.app`

The Pages workflow writes only `TENDER_API_BASE_URL` into a small runtime config file. No Supabase service-role secret is published.

The Vercel deployment workflow is intentionally a no-op when the Vercel deployment secrets are absent; it reports the missing configuration rather than pretending the backend is live.

### Analyze Tender flow

1. User clicks **Analyze Tender** on a tender card.
2. Static frontend obtains the selected tender from the current public snapshot.
3. User signs in or creates an account through the Vercel auth endpoint.
4. Frontend sends only `tenderId` and optional `profileId` with the Supabase access token.
5. Backend loads the tender and user-owned profile from Supabase, validates the document URL, downloads an HTTPS PDF with size/time limits, and extracts text with `pdf-parse`.
6. Backend returns evidence, extracted eligibility fields, match score and pre-screen recommendation.
7. Missing documents, invalid PDFs, scanned/image-only PDFs, expired sessions, HTTP errors and network failures are rendered as dashboard messages instead of browser alerts.

## Public-source audit

Only public pages/endpoints that can be fetched without bypassing CAPTCHA, authentication, paywalls or technical restrictions are eligible.

Verified current public sources include:

- CPPP — current public active-tender listing is integrated.
- GeM — public All Bids/AJAX feed is integrated, but GitHub Actions connectivity remains environment-dependent and is reported as a source failure when unreachable.
- Maharashtra, Madhya Pradesh, West Bengal, Kerala and Uttarakhand NIC eProcurement portals are integrated with per-source failure isolation.
- Rajasthan and Tamil Nadu NIC eProcurement portals are now included using their public latest-tender pages; they are only counted as live when a real ingestion run returns parseable rows.
- Gujarat nProcure remains integrated.

Not marked live:

- IREPS: the public railway procurement site was reviewed, but a stable, current public tender listing endpoint that is safe to consume from GitHub Actions was not verified during this audit. No bypass is used.
- MSTC: the public portal is accessible, but current participation flows require bidder authentication/DSC in relevant areas; no authenticated or restricted endpoint is consumed. Public announcements alone are not treated as a tender feed.

The static snapshot includes per-source status and counts so a portal is never presented as live merely because its domain exists.
