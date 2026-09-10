import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { BusinessProfileInputSchema, BusinessProfileSchema, TenderSchema, type BusinessProfile, type Tender } from "../domain/tender.js";
import { matchTender } from "../core/matcher.js";
import { analyzeEligibility } from "../core/eligibility.js";
import { fetchConfiguredFeed } from "../ingestion/generic-json.js";
import { fetchCpppTenders } from "../ingestion/cppp.js";
import { getSupabase, hasDatabase } from "../db/supabase.js";
import { upsertTenders } from "../db/tenders.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "../../public");
const memory: { tenders: Tender[]; profiles: BusinessProfile[] } = { tenders: [], profiles: [] };
function json(res: ServerResponse, status: number, body: unknown) { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); }
async function body(req: IncomingMessage): Promise<unknown> { const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); if (!chunks.length) return {}; return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
function bearer(req: IncomingMessage) { const value = req.headers.authorization; return value?.startsWith("Bearer ") ? value.slice(7) : null; }
async function currentUser(req: IncomingMessage) { const token = bearer(req); const db = getSupabase(); if (!token || !db) return null; const { data, error } = await db.auth.getUser(token); return error || !data.user ? null : data.user; }
async function listTenders(): Promise<Tender[]> { const db = getSupabase(); if (!db) return memory.tenders; const { data, error } = await db.from("tenders").select("*").order("closing_at", { ascending: true }).limit(100); if (error) throw error; return (data ?? []).map((row: any) => TenderSchema.parse({ ...row, referenceNumber: row.reference_number, estimatedValue: row.estimated_value == null ? undefined : Number(row.estimated_value), emdAmount: row.emd_amount == null ? undefined : Number(row.emd_amount), publishedAt: row.published_at ?? undefined, closingAt: row.closing_at ?? undefined, sourceUrl: row.source_url, documentUrl: row.document_url ?? undefined })); }
async function createProfile(input: unknown, userId?: string): Promise<BusinessProfile> { const parsed = BusinessProfileInputSchema.parse(input); const profile = BusinessProfileSchema.parse({ ...parsed, id: randomUUID() }); const db = getSupabase(); if (!db) { memory.profiles.push(profile); return profile; } if (!userId) throw new Error("Authentication required"); const { error } = await db.from("business_profiles").insert({ id: profile.id, user_id: userId, business_name: profile.businessName, categories: profile.categories, locations: profile.locations, keywords: profile.keywords, min_tender_value: profile.minTenderValue, max_tender_value: profile.maxTenderValue, annual_turnover: profile.annualTurnover, certifications: profile.certifications, experience_keywords: profile.experienceKeywords }); if (error) throw error; return profile; }
async function getProfile(profileId: string, userId?: string): Promise<BusinessProfile | null> { const db = getSupabase(); if (!db) return memory.profiles.find((p) => p.id === profileId) ?? null; if (!userId) return null; const { data, error } = await db.from("business_profiles").select("*").eq("id", profileId).eq("user_id", userId).maybeSingle(); if (error) throw error; if (!data) return null; return BusinessProfileSchema.parse({ id: data.id, businessName: data.business_name, categories: data.categories, locations: data.locations, keywords: data.keywords, minTenderValue: data.min_tender_value == null ? undefined : Number(data.min_tender_value), maxTenderValue: data.max_tender_value == null ? undefined : Number(data.max_tender_value), annualTurnover: data.annual_turnover == null ? undefined : Number(data.annual_turnover), certifications: data.certifications, experienceKeywords: data.experience_keywords }); }
function authClient() { const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_ANON_KEY; return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null; }

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, database: hasDatabase(), auth: Boolean(process.env.SUPABASE_ANON_KEY), service: "tender-intelligence-saas" });
      if (req.method === "POST" && url.pathname === "/api/auth/signup") { const auth = authClient(); if (!auth) return json(res, 503, { error: "Supabase Auth is not configured" }); const input = await body(req) as { email?: string; password?: string }; const { data, error } = await auth.auth.signUp({ email: input.email ?? "", password: input.password ?? "" }); if (error) return json(res, 400, { error: error.message }); return json(res, 201, { user: data.user, session: data.session }); }
      if (req.method === "POST" && url.pathname === "/api/auth/signin") { const auth = authClient(); if (!auth) return json(res, 503, { error: "Supabase Auth is not configured" }); const input = await body(req) as { email?: string; password?: string }; const { data, error } = await auth.auth.signInWithPassword({ email: input.email ?? "", password: input.password ?? "" }); if (error) return json(res, 401, { error: error.message }); return json(res, 200, { user: data.user, session: data.session }); }
      if (req.method === "GET" && url.pathname === "/api/auth/me") { const user = await currentUser(req); return user ? json(res, 200, { user: { id: user.id, email: user.email } }) : json(res, 401, { error: "Unauthorized" }); }
      if (req.method === "GET" && url.pathname === "/api/tenders") { const tenders = await listTenders(); return json(res, 200, { count: tenders.length, tenders }); }
      if (req.method === "POST" && url.pathname === "/api/profiles") { const user = hasDatabase() ? await currentUser(req) : null; if (hasDatabase() && !user) return json(res, 401, { error: "Login required" }); return json(res, 201, await createProfile(await body(req), user?.id)); }
      if (req.method === "POST" && url.pathname === "/api/fetch") { const tenders = await fetchConfiguredFeed(); const upserted = await upsertTenders(tenders); return json(res, 200, { source: "configured-json", fetched: tenders.length, upserted, database: hasDatabase() }); }
      if (req.method === "POST" && url.pathname === "/api/fetch/cppp") { const tenders = await fetchCpppTenders(); const upserted = await upsertTenders(tenders); return json(res, 200, { source: "CPPP ePublishing", fetched: tenders.length, upserted, database: hasDatabase() }); }
      if (req.method === "GET" && url.pathname === "/api/matches") { const profileId = url.searchParams.get("profileId"); if (!profileId) return json(res, 400, { error: "profileId is required" }); const user = hasDatabase() ? await currentUser(req) : null; if (hasDatabase() && !user) return json(res, 401, { error: "Login required" }); const profile = await getProfile(profileId, user?.id); if (!profile) return json(res, 404, { error: "Profile not found" }); const tenders = await listTenders(); return json(res, 200, { matches: tenders.map((t) => ({ tender: t, match: matchTender(t, profile), eligibility: analyzeEligibility(t, profile) })).sort((a, b) => b.match.score - a.match.score) }); }
      if (req.method === "GET" && url.pathname === "/") { const html = await readFile(join(publicDir, "index.html"), "utf8"); res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(html); }
      return json(res, 404, { error: "Not found" });
    } catch (error) { console.error(error); return json(res, 500, { error: error instanceof Error ? error.message : "Internal server error" }); }
  });
  server.listen(port, () => console.log(`Tender Intelligence SaaS running on http://localhost:${port}`));
  return server;
}
