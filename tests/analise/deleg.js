// resumo de harness-delegations.jsonl — uso: node deleg.js <jsonl> [desde AAAA-MM-DD]
const fs=require('fs');const f=process.argv[2];const since=process.argv[3]||'2026-09-03';
const g={};let n=0;for(const l of fs.readFileSync(f,'utf8').split('\n').filter(Boolean)){let o;try{o=JSON.parse(l)}catch{continue}if((o.ts||'')<since)continue;n++;const k=[o.label||'',o.role,o.executor,o.status].join(' | ');g[k]=g[k]||{n:0,dur:0,cost:0};g[k].n++;g[k].dur+=+o.duration_s||0;g[k].cost+=parseFloat(o.cost_usd)||0}
console.log('total desde',since,'=',n);for(const k of Object.keys(g).sort())console.log(String(g[k].n).padStart(3),'x',(g[k].dur+'s').padStart(6),'US$'+g[k].cost.toFixed(2),'|',k);
