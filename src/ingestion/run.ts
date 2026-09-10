import { fetchCpppTenders } from "./cppp.js";
import { fetchGemTenders } from "./gem.js";
import { upsertTenders } from "../db/tenders.js";

export async function runIngestion() {
  const startedAt = new Date().toISOString();
  const [cpppResult, gemResult] = await Promise.allSettled([fetchCpppTenders(), fetchGemTenders()]);
  const cppp = cpppResult.status === "fulfilled" ? cpppResult.value : [];
  const gem = gemResult.status === "fulfilled" ? gemResult.value : [];
  const errors = [
    cpppResult.status === "rejected" ? `CPPP: ${String(cpppResult.reason)}` : undefined,
    gemResult.status === "rejected" ? `GeM: ${String(gemResult.reason)}` : undefined,
  ].filter(Boolean) as string[];
  const tenders = [...cppp, ...gem];
  if (tenders.length === 0) throw new Error(`No tenders fetched. ${errors.join(" | ")}`);
  const upserted = await upsertTenders(tenders);
  return { sources: ["CPPP ePublishing", "GeM"], fetched: tenders.length, cppp: cppp.length, gem: gem.length, upserted, errors, startedAt, finishedAt: new Date().toISOString() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestion().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
