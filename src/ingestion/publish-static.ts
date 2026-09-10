import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCpppTenders } from "./cppp.js";
import { fetchGemTenders } from "./gem.js";
import { upsertTenders } from "../db/tenders.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputDir = join(root, "public", "data");

const [cpppResult, gemResult] = await Promise.allSettled([fetchCpppTenders(), fetchGemTenders()]);
const cppp = cpppResult.status === "fulfilled" ? cpppResult.value : [];
const gem = gemResult.status === "fulfilled" ? gemResult.value : [];
const errors = [
  cpppResult.status === "rejected" ? `CPPP: ${String(cpppResult.reason)}` : undefined,
  gemResult.status === "rejected" ? `GeM: ${String(gemResult.reason)}` : undefined,
].filter(Boolean) as string[];

if (cppp.length === 0 && gem.length === 0) {
  throw new Error(`No public tenders could be fetched. ${errors.join(" | ")}`);
}

const tenders = [...cppp, ...gem];
await upsertTenders(tenders);
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "tenders.json"), JSON.stringify({
  sources: ["CPPP ePublishing", "GeM"],
  fetchedAt: new Date().toISOString(),
  count: tenders.length,
  sourceCounts: { cppp: cppp.length, gem: gem.length },
  errors,
  tenders,
}, null, 2));
console.log(JSON.stringify({ fetched: tenders.length, cppp: cppp.length, gem: gem.length, errors, output: "public/data/tenders.json" }, null, 2));
