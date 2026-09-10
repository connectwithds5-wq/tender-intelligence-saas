import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BusinessProfileSchema, TenderSchema, type BusinessProfile, type Tender } from "../domain/tender.js";
import { matchTender } from "../core/matcher.js";
import { fetchConfiguredFeed } from "../ingestion/generic-json.js";
import { getSupabase, hasDatabase } from "../db/supabase.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "../../public");
const memory: { tenders: Tender[]; profiles: BusinessProfile[] } = { tenders: [], profiles: [] };

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function listTenders(): Promise<Tender[]> {
  const db = getSupabase();
  if (!db) return memory.tenders;
  const { data, error } = await db.from("tenders").select("*").order("closing_at", { ascending: true }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => TenderSchema.parse({
    ...row,
    referenceNumber: row.reference_number,
    estimatedValue: row.estimated_value == null ? undefined : Number(row.estimated_value),
    emdAmount: row.emd_amount == null ? undefined : Number(row.emd_amount),
    publishedAt: row.published_at ?? undefined,
    closingAt: row.closing_at ?? undefined,
    sourceUrl: row.source_url,
    documentUrl: row.document_url ?? undefined,
  }));
}

async function upsertTenders(tenders: Tender[]) {
  const db = getSupabase();
  if (!db) {
    const byId = new Map(memory.tenders.map((t) => [t.id, t]));
    for (const tender of tenders) byId.set(tender.id, tender);
    memory.tenders = [...byId.values()];
    return tenders.length;
  }
  const rows = tenders.map((t) => ({
    id: t.id, reference_number: t.referenceNumber, title: t.title, buyer: t.buyer,
    category: t.category, location: t.location, estimated_value: t.estimatedValue,
    emd_amount: t.emdAmount, published_at: t.publishedAt, closing_at: t.closingAt,
    source: t.source, source_url: t.sourceUrl, document_url: t.documentUrl,
    keywords: t.keywords, description: t.description, raw: t.raw, last_seen_at: new Date().toISOString()
  }));
  const { error } = await db.from("tenders").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return rows.length;
}

async function createProfile(input: unknown): Promise<BusinessProfile> {
  const profile = BusinessProfileSchema.parse(input);
  const db = getSupabase();
  if (!db) { memory.profiles.push(profile); return profile; }
  const { data, error } = await db.from("business_profiles").insert({
    id: profile.id, business_name: profile.businessName, categories: profile.categories,
    locations: profile.locations, keywords: profile.keywords, min_tender_value: profile.minTenderValue,
    max_tender_value: profile.maxTenderValue, annual_turnover: profile.annualTurnover,
    certifications: profile.certifications, experience_keywords: profile.experienceKeywords
  }).select().single();
  if (error) throw error;
  return profile;
}

export function startServer(port = Number(process.env.PORT ?? 3000)) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/api/health") {
        return json(res, 200, { ok: true, database: hasDatabase(), service: "tender-intelligence-saas" });
      }
      if (req.method === "GET" && url.pathname === "/api/tenders") {
        const tenders = await listTenders();
        return json(res, 200, { count: tenders.length, tenders });
      }
      if (req.method === "POST" && url.pathname === "/api/profiles") {
        return json(res, 201, await createProfile(await body(req)));
      }
      if (req.method === "POST" && url.pathname === "/api/fetch") {
        const tenders = await fetchConfiguredFeed();
        const upserted = await upsertTenders(tenders);
        return json(res, 200, { fetched: tenders.length, upserted, database: hasDatabase() });
      }
      if (req.method === "GET" && url.pathname === "/api/matches") {
        const profileId = url.searchParams.get("profileId");
        const profile = memory.profiles.find((p) => p.id === profileId);
        if (!profile) return json(res, 404, { error: "Profile not found in demo memory. Use POST /api/profiles first." });
        const tenders = await listTenders();
        return json(res, 200, { matches: tenders.map((t) => ({ tender: t, match: matchTender(t, profile) })).sort((a, b) => b.match.score - a.match.score) });
      }
      if (req.method === "GET" && url.pathname === "/") {
        const html = await readFile(join(publicDir, "index.html"), "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(html);
      }
      return json(res, 404, { error: "Not found" });
    } catch (error) {
      console.error(error);
      return json(res, 500, { error: error instanceof Error ? error.message : "Internal server error" });
    }
  });
  server.listen(port, () => console.log(`Tender Intelligence SaaS running on http://localhost:${port}`));
  return server;
}
