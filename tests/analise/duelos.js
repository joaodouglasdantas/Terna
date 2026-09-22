// resumo de harness-duelos.jsonl — uso: node duelos.js <jsonl> [desde AAAA-MM-DD]
const fs=require('fs');const f=process.argv[2];const since=process.argv[3]||'2026-09-01';
const g={};let n=0;for(const l of fs.readFileSync(f,'utf8').split('\n').filter(Boolean)){let o;try{o=JSON.parse(l)}catch{continue}if((o.ts||'')<since)continue;n++;const k=[o.ev,o.vencedor||'',(o.motivo||o.tag||'').slice(0,70)].join(' | ');g[k]=(g[k]||0)+1}
console.log('total desde',since,'=',n);for(const k of Object.keys(g).sort())console.log(String(g[k]).padStart(3),'|',k);
