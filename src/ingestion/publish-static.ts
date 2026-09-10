import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCpppTenders } from "./cppp.js";
import { fetchGemTenders } from "./gem.js";
import { fetchAllNicGePTenders } from "./nicgep.js";
import { upsertTenders } from "../db/tenders.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputDir = join(root, "public", "data");

const [cpppResult, gemResult, nicResult] = await Promise.allSettled([
  fetchCpppTenders(),
  fetchGemTenders(),
  fetchAllNicGePTenders(),
]);

const cppp = cpppResult.status === "fulfilled" ? cpppResult.value : [];
const gem = gemResult.status === "fulfilled" ? gemResult.value : [];
const nic = nicResult.status === "fulfilled" ? nicResult.value.tenders : [];
const errors = [
  cpppResult.status === "rejected" ? `CPPP: ${String(cpppResult.reason)}` : undefined,
  gemResult.status === "rejected" ? `GeM: ${String(gemResult.reason)}` : undefined,
  nicResult.status === "rejected" ? `NIC state portals: ${String(nicResult.reason)}` : undefined,
  ...(nicResult.status === "fulfilled" ? nicResult.value.errors : []),
].filter(Boolean) as string[];

if (cppp.length === 0 && gem.length === 0 && nic.length === 0) {
  throw new Error(`No public tenders could be fetched. ${errors.join(" | ")}`);
}

const tenders = [...cppp, ...gem, ...nic];
await upsertTenders(tenders);
await mkdir(outputDir, { recursive: true });

const sourceCounts: Record<string, number> = {};
for (const tender of tenders) sourceCounts[tender.source] = (sourceCounts[tender.source] ?? 0) + 1;

await writeFile(join(outputDir, "tenders.json"), JSON.stringify({
  sources: Object.keys(sourceCounts),
  fetchedAt: new Date().toISOString(),
  count: tenders.length,
  sourceCounts,
  errors,
  tenders,
}, null, 2));

console.log(JSON.stringify({
  fetched: tenders.length,
  sourceCounts,
  errors,
  output: "public/data/tenders.json",
}, null, 2));
