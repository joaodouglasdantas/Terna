// classifica os comandos Bash dos subagentes (leitura pura x execucao) — uso: node bash-cmds.js
const fs=require('fs'),path=require('path');
const base=path.join(process.env.USERPROFILE||process.env.HOME,'.claude','projects');
const DE=Date.parse('2026-09-03T03:00:00Z'),ATE=Date.parse('2026-09-05T03:00:00Z');
const READLIKE=/^(cat|ls|grep|rg|head|tail|sed -n|find|wc|stat|tree|echo|pwd|type|file|dir)\b/;
const byTipo={};
for(const proj of fs.readdirSync(base)){if(!/mariana|caronte/i.test(proj))continue;const pd=path.join(base,proj);
 for(const s of fs.readdirSync(pd)){const sd=path.join(pd,s,'subagents');if(!fs.existsSync(sd))continue;
  for(const f of fs.readdirSync(sd)){if(!f.endsWith('.jsonl'))continue;const fp=path.join(sd,f);const st=fs.statSync(fp);if(st.mtimeMs<DE||st.mtimeMs>ATE)continue;
   let meta={};try{meta=JSON.parse(fs.readFileSync(fp.replace(/\.jsonl$/,'.meta.json'),'utf8'))}catch{}
   const tipo=meta.agentType||'?';const t=byTipo[tipo]=byTipo[tipo]||{bash:0,readlike:0,first:{},multi:0};
   for(const l of fs.readFileSync(fp,'utf8').split('\n')){if(!l)continue;let o;try{o=JSON.parse(l)}catch{continue}const m=o.message;if(!m||!Array.isArray(m.content))continue;
    for(const c of m.content){if(c.type!=='tool_use'||c.name!=='Bash')continue;t.bash++;const cmd=String((c.input||{}).command||'').trim();const norm=cmd.replace(/^cd\s+\S+\s*(&&|;)\s*/,'');
     if(READLIKE.test(norm))t.readlike++;if(/&&|;\s*\S/.test(cmd))t.multi++;const w=norm.split(/\s+/)[0].replace(/^.*\//,'').slice(0,18);t.first[w]=(t.first[w]||0)+1}}}}}
for(const tipo of Object.keys(byTipo).sort((a,b)=>byTipo[b].bash-byTipo[a].bash)){const t=byTipo[tipo];const top=Object.entries(t.first).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>k+'='+v).join(' ');console.log(tipo.padEnd(15),'bash='+String(t.bash).padStart(5),'read-like='+String(t.readlike).padStart(4),'('+Math.round(100*t.readlike/Math.max(1,t.bash))+'%)','encadeados='+t.multi,'|',top)}
