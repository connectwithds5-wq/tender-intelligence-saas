import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

await cp("public", ".pages", { recursive: true, force: true });
const path = ".pages/index.html";
let html = await readFile(path, "utf8");

const replacement = `async function load(){try{const t=await api('./data/tenders.json?ts='+Date.now());tenders=t.tenders||[];const source=document.querySelector('#source');const sources=[...new Set(tenders.map(x=>x.source).filter(Boolean))].sort();source.innerHTML='<option value="all">All Sources</option>'+sources.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');try{const p=await api('/api/profiles');profiles=p.profiles||[];const sel=document.querySelector('#profile');profiles.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.businessName;sel.appendChild(o)});if(profiles.length){sel.value=profiles[0].id;await loadMatches();return}}catch(_e){}matches=tenders.map(t=>({tender:t,match:{score:0,recommendation:'REVIEW',reasons:[{factor:'Profile',score:0,detail:'Create a business profile to personalize this tender match.'}]},eligibility:null}));render()}catch(e){document.querySelector('#list').innerHTML='<div class="empty">Tender feed is temporarily unavailable. Please refresh in a moment.</div>'}}
async function loadMatches`;

let updated = html.replace(/async function load\(\)\{[\s\S]*?\}\nasync function loadMatches/, replacement);
if (updated === html) throw new Error("Could not locate dashboard loader for static Pages patch");

updated = updated.replace(
  '<div class="filters"><input id="q2" placeholder="Search tenders…"><select id="rec"><option value="all">All recommendations</option><option value="BID">BID</option><option value="REVIEW">REVIEW</option><option value="SKIP">SKIP</option></select></div>',
  '<div class="filters"><input id="q2" placeholder="Search tenders…"><select id="source"><option value="all">All Sources</option></select><select id="rec"><option value="all">All recommendations</option><option value="BID">BID</option><option value="REVIEW">REVIEW</option><option value="SKIP">SKIP</option></select></div>'
);
if (updated === html) throw new Error("Could not add source filter control");

updated = updated.replace(
  "function render(){const q=(document.querySelector('#q2').value||document.querySelector('#q').value).toLowerCase();const rf=document.querySelector('#rec').value;let rows=matches.filter(x=>",
  "function render(){const q=(document.querySelector('#q2').value||document.querySelector('#q').value).toLowerCase();const sf=document.querySelector('#source').value;const rf=document.querySelector('#rec').value;let rows=matches.filter(x=>(sf==='all'||x.tender.source===sf)&&"
);

updated = updated.replace(
  "document.querySelector('#matched').textContent=matches.length;document.querySelector('#bids').textContent=matches.filter(x=>x.match.recommendation==='BID').length;document.querySelector('#soon').textContent=matches.filter(x=>{if(!x.tender.closingAt)return false;const d=new Date(x.tender.closingAt)-Date.now();return d<72*3600000&&d>0}).length;document.querySelector('#avg').textContent=matches.length?Math.round(matches.reduce((a,x)=>a+x.match.score,0)/matches.length)+'%':'—';",
  "document.querySelector('#matched').textContent=rows.length;document.querySelector('#bids').textContent=rows.filter(x=>x.match.recommendation==='BID').length;document.querySelector('#soon').textContent=rows.filter(x=>{if(!x.tender.closingAt)return false;const d=new Date(x.tender.closingAt)-Date.now();return d<72*3600000&&d>0}).length;document.querySelector('#avg').textContent=rows.length?Math.round(rows.reduce((a,x)=>a+x.match.score,0)/rows.length)+'%':'—';"
);

updated = updated.replace(
  "document.querySelector('#rec').addEventListener('change',render);load();",
  "document.querySelector('#rec').addEventListener('change',render);document.querySelector('#source').addEventListener('change',render);load();"
);

await mkdir(".pages/data", { recursive: true });
await writeFile(path, updated);
console.log("Prepared GitHub Pages dashboard with static tender feed and source filtering.");
