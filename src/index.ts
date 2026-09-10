import { matchTender } from "./core/matcher.js";
import { sampleProfile, sampleTender } from "./core/sample.js";

const result = matchTender(sampleTender, sampleProfile);

console.log("Tender Intelligence SaaS — matcher smoke test");
console.log(JSON.stringify({ tender: sampleTender.title, ...result }, null, 2));
