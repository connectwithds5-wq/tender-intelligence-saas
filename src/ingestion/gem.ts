import type { Tender } from "../domain/tender.js";

const GEM_BASE_URL = "https://bidplus.gem.gov.in";
const GEM_LIST_URL = `${GEM_BASE_URL}/all-bids`;
const GEM_DATA_URL = `${GEM_BASE_URL}/all-bids-data`;
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 10;
const MAX_PAGES = 10;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrap(value: unknown): unknown {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : value[0] ?? "";
  return value;
}

function stringValue(value: unknown): string {
  const unwrapped = unwrap(value);
  return unwrapped == null ? "" : String(unwrapped).trim();
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined;
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  const match = value.match(/(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (!match) return undefined;
  const [, dd, mm, yyyy, hh = "00", min = "00", sec = "00", meridiem] = match;
  let hour = Number(hh);
  if (meridiem?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min), Number(sec)));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function absoluteUrl(value: string): string {
  if (value.startsWith("http")) return value;
  return new URL(value, GEM_BASE_URL).toString();
}

function extractBidNumber(text: string): string | undefined {
  return text.match(/GEM\/\d{4}\/[A-Z]\/\d+/i)?.[0].toUpperCase();
}

function parseSolrDoc(doc: Record<string, unknown>): Tender | undefined {
  const referenceNumber = stringValue(doc.b_bid_number);
  if (!referenceNumber) return undefined;

  const bidId = stringValue(doc.b_id || doc.id);
  const title = stringValue(doc.b_category_name || doc.bd_category_name || doc.b_bid_title || doc.b_name);
  const ministry = stringValue(doc.ba_official_details_minName);
  const buyer = stringValue(doc.ba_official_details_deptName);
  const start = stringValue(doc.b_start_date_sort);
  const closing = stringValue(doc.final_end_date_sort);
  const quantity = stringValue(doc.b_total_quantity);

  const bidTypeCode = Number(stringValue(doc.b_bid_type));
  const bidType = bidTypeCode === 2 ? "RA" : bidTypeCode === 3 ? "Service BID" : "BID";
  const statusCode = Number(stringValue(doc.b_status));
  const status = statusCode === 0 ? "open" : statusCode === 1 ? "closed" : "awarded";

  const keywords = `${title} ${ministry} ${buyer}`
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2)
    .slice(0, 50);

  return {
    id: `gem:${referenceNumber}`,
    referenceNumber,
    title: title || referenceNumber,
    buyer: buyer || ministry || undefined,
    category: title || undefined,
    publishedAt: toIso(start),
    closingAt: toIso(closing),
    source: "GeM",
    sourceUrl: bidId ? `${GEM_BASE_URL}/showbidDocument/${bidId}` : GEM_LIST_URL,
    keywords,
    description: [title, ministry, buyer, quantity ? `Quantity: ${quantity}` : "", `Bid Type: ${bidType}`, `Status: ${status}`]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 2000),
    raw: { portal: "GeM", listingUrl: GEM_LIST_URL, bidId, bidType, status, quantity },
  };
}

function parseCookieHeader(setCookie: string | null): string {
  if (!setCookie) return "";
  return setCookie
    .split(/,(?=[^;]+=[^;]+)/)
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function extractCookieValue(cookieHeader: string, name: string): string {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? "";
}

async function getCsrfCookie(): Promise<{ cookie: string; token: string }> {
  const response = await fetch(GEM_LIST_URL, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "TenderIntelligenceSaaS/0.1 (+public-tender-indexer)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GeM listing returned HTTP ${response.status}`);
  const cookie = parseCookieHeader(response.headers.get("set-cookie"));
  const token = extractCookieValue(cookie, "csrf_gem_cookie");
  if (!token) throw new Error("GeM listing did not provide csrf_gem_cookie");
  return { cookie, token };
}

async function fetchGemPage(cookie: string, csrf: string, page: number): Promise<Record<string, unknown>[]> {
  const postdata = {
    ...(page > 1 ? { page } : {}),
    param: { searchBid: "", searchType: "fullText" },
    filter: { sort: "Bid-End-Date-Latest", bidStatusType: "all_bids", byType: "all_type" },
  };

  const body = new URLSearchParams({
    payload: JSON.stringify(postdata),
    csrf_bd_gem_nk: csrf,
  });

  const response = await fetch(GEM_DATA_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "TenderIntelligenceSaaS/0.1 (+public-tender-indexer)",
      "x-requested-with": "XMLHttpRequest",
      referer: GEM_LIST_URL,
      cookie,
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`GeM AJAX returned HTTP ${response.status}`);
  const data = await response.json() as Record<string, any>;
  if (Number(data.code) !== 200) throw new Error(`GeM AJAX returned code ${String(data.code)}`);

  const docs = data.response?.response?.docs;
  return Array.isArray(docs) ? docs as Record<string, unknown>[] : [];
}

function extractLegacyRows(html: string): Tender[] {
  const tenders: Tender[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const text = decodeHtml(row);
    const referenceNumber = extractBidNumber(text);
    if (!referenceNumber) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decodeHtml(m[1]));
    const dates = [...text.matchAll(/\d{2}[-/]\d{2}[-/]\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?/gi)].map((m) => m[0]);
    const links = [...row.matchAll(/href=["']([^"']*(?:showbidDocument|bidding)[^"']*)["']/gi)].map((m) => absoluteUrl(m[1]));
    const title = cells.find((cell) => !/GEM\/\d{4}\/[A-Z]\/\d+/i.test(cell) && cell.length > 15) ?? text;
    tenders.push({
      id: `gem:${referenceNumber}`,
      referenceNumber,
      title: title.slice(0, 500),
      publishedAt: toIso(dates[0]),
      closingAt: toIso(dates[1] ?? dates[0]),
      source: "GeM",
      sourceUrl: links[0] ?? GEM_LIST_URL,
      keywords: title.toLowerCase().split(/[^a-z0-9]+/i).filter((x) => x.length > 2).slice(0, 40),
      description: title.slice(0, 2000),
      raw: { portal: "GeM", listingUrl: GEM_LIST_URL, parser: "legacy-html" },
    });
  }
  return tenders;
}

export async function fetchGemTenders(): Promise<Tender[]> {
  const errors: string[] = [];

  try {
    const { cookie, token } = await getCsrfCookie();
    const tenders: Tender[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const docs = await fetchGemPage(cookie, token, page);
      if (docs.length === 0) break;
      for (const doc of docs) {
        const tender = parseSolrDoc(doc);
        if (tender) tenders.push(tender);
      }
      if (docs.length < PAGE_SIZE) break;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    const unique = [...new Map(tenders.map((tender) => [tender.id, tender])).values()];
    if (unique.length > 0) return unique;
    errors.push("GeM AJAX feed returned no bids");
  } catch (error) {
    errors.push(`AJAX: ${String(error)}`);
  }

  // Keep a conservative HTML fallback in case GeM temporarily serves the
  // listing data directly instead of through the AJAX endpoint.
  try {
    const response = await fetch(GEM_LIST_URL, {
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "TenderIntelligenceSaaS/0.1 (+public-tender-indexer)" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GeM returned HTTP ${response.status}`);
    const tenders = extractLegacyRows(await response.text());
    if (tenders.length > 0) return [...new Map(tenders.map((tender) => [tender.id, tender])).values()];
    errors.push("HTML fallback returned no parseable bids");
  } catch (error) {
    errors.push(`HTML: ${String(error)}`);
  }

  throw new Error(`GeM public feed unavailable: ${errors.join(" | ")}`);
}
