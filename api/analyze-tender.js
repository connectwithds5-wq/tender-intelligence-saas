import { PDFParse } from "pdf-parse";

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;
const ALLOWED_ORIGIN = process.env.DASHBOARD_ORIGIN || "https://connectwithds5-wq.github.io";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Tender document analysis failed";
}

function extractEvidence(text, label, pattern) {
  const match = text.match(pattern);
  if (!match) return undefined;
  const value = match[0].slice(0, 500).trim();
  return { requirement: label, value, confidence: 0.72 };
}

function analyzeText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const evidence = [];
  const warnings = [];
  const turnoverEvidence = extractEvidence(normalized, "Turnover", /(?:average\s+annual|annual)\s+turnover[^.]{0,250}/i);
  const experienceEvidence = extractEvidence(normalized, "Experience", /(?:similar|relevant)\s+(?:work|experience)[^.]{0,250}/i);
  const emdEvidence = extractEvidence(normalized, "EMD", /(?:earnest\s+money\s+deposit|EMD)[^.]{0,180}/i);
  const deadlineEvidence = extractEvidence(normalized, "Deadline", /(?:bid|tender)\s+(?:submission|closing)[^.]{0,180}/i);
  if (turnoverEvidence) evidence.push(turnoverEvidence);
  if (experienceEvidence) evidence.push(experienceEvidence);
  if (emdEvidence) evidence.push(emdEvidence);
  if (deadlineEvidence) evidence.push(deadlineEvidence);
  const certifications = [...normalized.matchAll(/(?:ISO\s*\d{4,5}|GST|PAN|MSME|NSIC|Udyam)[^,.;]*/gi)].map((m) => m[0].trim()).slice(0, 20);
  for (const certification of certifications) evidence.push({ requirement: "Certification", value: certification, confidence: 0.65 });
  if (!turnoverEvidence && !experienceEvidence && !emdEvidence && !deadlineEvidence && certifications.length === 0) {
    warnings.push("No standard eligibility requirement was confidently extracted from the supplied document text.");
  }
  return {
    eligibility: {
      turnover: turnoverEvidence?.value,
      experience: experienceEvidence?.value,
      certifications,
      emd: emdEvidence?.value,
      deadline: deadlineEvidence?.value,
    },
    evidence,
    warnings,
    disclaimer: "Document analysis is a pre-screening aid, not an official or legal eligibility determination. Verify every requirement against the original tender document.",
  };
}

async function downloadPdf(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Tender document URL is invalid"); }
  if (parsed.protocol !== "https:") throw new Error("Tender document must be served over HTTPS");
  const host = parsed.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) || host.endsWith(".local")) throw new Error("Tender document URL is not allowed");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(parsed, { signal: controller.signal, redirect: "follow", headers: { accept: "application/pdf,application/octet-stream;q=0.8" } });
    if (!response.ok) throw new Error(`Tender document returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_PDF_BYTES) throw new Error("Tender PDF exceeds the 12MB analysis limit");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_PDF_BYTES) throw new Error("Tender PDF exceeds the 12MB analysis limit");
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Tender document is not a valid PDF");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  try {
    const input = req.body || {};
    if (!input.documentUrl) return res.status(400).json({ error: "documentUrl is required" });
    const pdf = await downloadPdf(input.documentUrl);
    const parser = new PDFParse({ data: pdf });
    let parsed;
    try {
      parsed = await parser.getText();
    } finally {
      await parser.destroy();
    }
    const text = String(parsed?.text || "").replace(/\u0000/g, "").trim();
    if (!text) return res.status(422).json({ error: "No selectable text found in this PDF. This appears to be a scanned/image-only document; OCR is required." });
    const extractedText = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
    return res.status(200).json({
      tenderId: input.tenderId || null,
      title: input.title || "Tender",
      analysis: analyzeText(extractedText),
      extractedTextLength: extractedText.length,
      engine: "vercel-pdf-parse",
    });
  } catch (error) {
    const message = errorMessage(error);
    const status = /not a valid PDF|invalid|not allowed|12MB|HTTP 4\d\d/i.test(message) ? 422 : 500;
    return res.status(status).json({ error: message });
  }
}
