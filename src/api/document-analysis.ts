import { IncomingMessage } from "node:http";
import { analyzeTenderText } from "../core/document-analysis.js";

export async function readTextBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/** POST /api/analyze-document expects extracted tender text as text/plain. */
export async function analyzeDocumentRequest(req: IncomingMessage) {
  const text = await readTextBody(req);
  if (!text.trim()) throw new Error("Document text is required");
  if (text.length > 2_000_000) throw new Error("Document text exceeds the 2MB analysis limit");
  return analyzeTenderText(text);
}
