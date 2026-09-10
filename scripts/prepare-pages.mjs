import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

await cp("public", ".pages", { recursive: true, force: true });
const path = ".pages/index.html";
let html = await readFile(path, "utf8");

const replacement = `async function load(){try{const t=await api('./data/tenders.json?ts='+Date.now());tenders=t.tenders||[];try{const p=await api('/api/profiles');profiles=p.profiles||[];const sel=document.querySelector('#profile');profiles.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.businessName;sel.appendChild(o)});if(profiles.length){sel.value=profiles[0].id;await loadMatches();return}}catch(_e){}matches=tenders.map(t=>({tender:t,match:{score:0,recommendation:'REVIEW',reasons:[{factor:'Profile',score:0,detail:'Create a business profile to personalize this tender match.'}]},eligibility:null}));render()}catch(e){document.querySelector('#list').innerHTML='<div class="empty">Tender feed is temporarily unavailable. Please refresh in a moment.</div>'}}
async function loadMatches`;

const updated = html.replace(/async function load\(\)\{[\s\S]*?\}\nasync function loadMatches/, replacement);
if (updated === html) throw new Error("Could not locate dashboard loader for static Pages patch");
await mkdir(".pages/data", { recursive: true });
await writeFile(path, updated);
console.log("Prepared GitHub Pages dashboard with static tender-feed fallback.");
