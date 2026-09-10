import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCpppTenders } from "./cppp.js";
import { upsertTenders } from "../db/tenders.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputDir = join(root, "public", "data");

const tenders = await fetchCpppTenders();
await upsertTenders(tenders);
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "tenders.json"), JSON.stringify({
  source: "CPPP ePublishing",
  fetchedAt: new Date().toISOString(),
  count: tenders.length,
  tenders,
}, null, 2));
console.log(JSON.stringify({ fetched: tenders.length, output: "public/data/tenders.json" }, null, 2));
