import { spawn } from "node:child_process";
import { once } from "node:events";

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;

export async function extractPdfText(pdf: Buffer): Promise<string> {
  if (!pdf.length) throw new Error("PDF is empty");
  if (pdf.length > MAX_PDF_BYTES) throw new Error("PDF exceeds the 12MB limit");
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Uploaded file is not a valid PDF");

  const child = spawn("pdftotext", ["-layout", "-", "-"], { stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin.end(pdf);
  const [code] = (await once(child, "close")) as [number | null];
  if (code !== 0) {
    const message = Buffer.concat(stderr).toString("utf8").trim();
    throw new Error(message || "Unable to extract text from PDF");
  }
  const text = Buffer.concat(stdout).toString("utf8").replace(/\u0000/g, "").trim();
  if (!text) throw new Error("PDF contains no extractable text. Scanned PDFs need OCR before analysis.");
  if (text.length > MAX_TEXT_CHARS) throw new Error("Extracted document text exceeds the 2MB analysis limit");
  return text;
}
