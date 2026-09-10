import { fetchCpppTenders } from "./cppp.js";
import { upsertTenders } from "../db/tenders.js";

export async function runIngestion() {
  const startedAt = new Date().toISOString();
  const tenders = await fetchCpppTenders();
  const upserted = await upsertTenders(tenders);
  return { source: "CPPP ePublishing", fetched: tenders.length, upserted, startedAt, finishedAt: new Date().toISOString() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIngestion().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
