import { fetchCpppTenders } from "./cppp.js";
import { fetchGemTenders } from "./gem.js";
import { fetchAllNicGePTenders } from "./nicgep.js";
import { fetchNprocureTenders } from "./nprocure.js";
import { upsertTenders } from "../db/tenders.js";

export async function runIngestion() {
  const startedAt = new Date().toISOString();
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
  if (tenders.length === 0) throw new Error(`No tenders fetched. ${errors.join(" | ")}`);
  const upserted = await upsertTenders(tenders);
  return {
    sources: ["CPPP ePublishing", "GeM", "Gujarat nProcure", "Maharashtra eProcurement", "Madhya Pradesh eProcurement", "West Bengal eTender", "Kerala eTender", "Uttarakhand eTender"],
    fetched: tenders.length, cppp: cppp.length, gem: gem.length, nic: nic.length, nprocure: nprocure.length,
    nicCounts: nicResult.status === "fulfilled" ? nicResult.value.counts : {},
    upserted, errors, startedAt, finishedAt: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestion().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
