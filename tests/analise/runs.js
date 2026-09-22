// tabula runs (harness >= 3.4.18 ou ts >= 02/09) — uso: node runs.js <harness-runs.jsonl|runs/*.jsonl>...
const fs=require('fs');const files=process.argv.slice(2);
const fmt=t=>{if(!t)return'';const d=new Date(t*1000);return d.toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo'}).slice(5,16)};
for(const f of files){if(!fs.existsSync(f))continue;const lines=fs.readFileSync(f,'utf8').split('\n').filter(Boolean);
for(const l of lines){let o;try{o=JSON.parse(l)}catch{continue}
const h=o.harness||'';if(!(h>='3.4.18'||(o.ts_start||0)>=1788400000))continue;
console.log([ (o.projeto||'').replace('dra-mariana-duarte','MAR').replace('--wt-','~'), h, o.label, fmt(o.ts_start), 'dur='+Math.round((o.elapsed_s||0)/60)+'m', 'act='+Math.round((+o.elapsed_active_s||0)/60)+'m','tasks='+o.tasks,'cic='+o.ciclos,'sub='+o.subagents,'par='+o.parallel_factor,'out='+Math.round((+o.tokens_output||0)/1000)+'k','tot='+Math.round((+o.tokens_total||0)/1e6)+'M','subtot='+Math.round((+o.tokens_total_subagents||0)/1e6)+'M','busy='+o.subagent_busy_min,'gates='+o.min_gates,'hermE='+o.min_hermes_e,'hermC='+o.min_hermes_c,'turnH='+o.turnos_hermes,'lpt='+o.linhas_por_task,'ach='+o.achados_por_ciclo,'waitH='+o.wait_human_min,'gap='+o.wait_gap_min,'perm='+o.permission_prompts].join(' | '));
console.log('    extra: '+(o.extra||'').slice(0,400));}}
