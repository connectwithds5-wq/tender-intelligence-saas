import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCpppTenders } from "./cppp.js";
import { fetchGemTenders } from "./gem.js";
import { fetchAllNicGePTenders } from "./nicgep.js";
import { fetchNprocureTenders } from "./nprocure.js";
import { upsertTenders } from "../db/tenders.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputDir = join(root, "public", "data");
const [cpppResult, gemResult, nicResult, nprocureResult] = await Promise.allSettled([
  fetchCpppTenders(), fetchGemTenders(), fetchAllNicGePTenders(), fetchNprocureTenders(),
]);
const cppp = cpppResult.status === "fulfilled" ? cpppResult.value : [];
const gem = gemResult.status === "fulfilled" ? gemResult.value : [];
const nic = nicResult.status === "fulfilled" ? nicResult.value.tenders : [];
const nprocure = nprocureResult.status === "fulfilled" ? nprocureResult.value : [];
const errors = [
  cpppResult.status === "rejected" ? `CPPP: ${String(cpppResult.reason)}` : undefined,
  gemResult.status === "rejected" ? `GeM: ${String(gemResult.reason)}` : undefined,
  nicResult.status === "rejected" ? `NIC state portals: ${String(nicResult.reason)}` : undefined,
  ...(nicResult.status === "fulfilled" ? nicResult.value.errors : []),
  nprocureResult.status === "rejected" ? `nProcure: ${String(nprocureResult.reason)}` : undefined,
].filter(Boolean) as string[];
const tenders = [...cppp, ...gem, ...nic, ...nprocure];

await mkdir(outputDir, { recursive: true });

// Never block the dashboard deployment just because a public portal is temporarily
// unavailable. If this run returns no fresh records, publish an empty snapshot with
// source errors so the UI remains usable and the failure is observable.
if (tenders.length > 0) {
  await upsertTenders(tenders);
}

const sourceCounts: Record<string, number> = {};
for (const tender of tenders) sourceCounts[tender.source] = (sourceCounts[tender.source] ?? 0) + 1;

const snapshot = {
  sources: Object.keys(sourceCounts),
  fetchedAt: new Date().toISOString(),
  count: tenders.length,
  sourceCounts,
  errors,
  status: tenders.length > 0 ? "partial_or_complete" : "no_fresh_data",
  tenders,
};
await writeFile(join(outputDir, "tenders.json"), JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify({ fetched: tenders.length, sourceCounts, errors, output: "public/data/tenders.json" }, null, 2));
