import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `${command} exited with code ${code}`)));
  });
}

export async function extractPdfText(pdf: Buffer): Promise<string> {
  if (pdf.length === 0) throw new Error("PDF is empty");
  if (pdf.length > MAX_PDF_BYTES) throw new Error("PDF exceeds the 12MB analysis limit");
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Uploaded document is not a valid PDF");

  const dir = await mkdtemp(join(tmpdir(), "tender-pdf-"));
  const input = join(dir, "document.pdf");
  const output = join(dir, "document.txt");
  try {
    await writeFile(input, pdf, { mode: 0o600 });
    try {
      await run("pdftotext", ["-layout", "-enc", "UTF-8", input, output], dir);
    } catch (error) {
      const message = error instanceof Error ? error.message : "pdftotext failed";
      if (message.includes("ENOENT")) throw new Error("PDF extraction service is not installed on this server (pdftotext missing)");
      throw new Error(`PDF text extraction failed: ${message}`);
    }
    const text = (await readFile(output, "utf8")).replace(/\u0000/g, "").trim();
    if (!text) throw new Error("No selectable text found in this PDF. This appears to be a scanned/image-only document; OCR is required.");
    if (text.length > MAX_TEXT_CHARS) return text.slice(0, MAX_TEXT_CHARS);
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
