const fs=require('fs');const f=process.argv[2];
const hora=t=>t?new Date(t).toLocaleTimeString('pt-BR',{hour12:false,timeZone:'America/Fortaleza'}):'??';
for(const l of fs.readFileSync(f,'utf8').split('\n')){if(!l)continue;let j;try{j=JSON.parse(l)}catch{continue}
 if(j.type==='system'){const s=j.subtype||'';const hi=j.hookInfos||[];
  if(hi.length||/hook/i.test(s)){console.log(hora(j.timestamp),s,'n='+(j.hookCount??hi.length),hi.map(h=>`${(h.command||'').replace('bash .claude/hooks/','')}=${h.durationMs??h.duration??'?'}ms${h.status||h.exitCode!=null?'/'+(h.status||h.exitCode):''}${h.timedOut||h.cancelled?'/TIMEOUT':''}`).join(' | '));}
  else if(!/^(turn_duration|api_)/.test(s)) console.log(hora(j.timestamp),'SYS',s,String(j.content||'').replace(/\s+/g,' ').slice(0,200));}
 if(j.type==='user'&&j.message&&Array.isArray(j.message.content)){for(const b of j.message.content){if(b.type==='tool_result'){const t=Array.isArray(b.content)?b.content.map(x=>x.text||'').join(' '):String(b.content??'');const m=t.match(/(ROTA\|[^\n]*|ESFORCO\|[^\n]*|CARGA\|[^\n]*|FRENTES\|[^\n]*|SEQ\|[^\n]*|DELEGATE\|[^\n]*|hook error[^\n]*|cancel[^\n]*|timed?\s?out[^\n]*)/gi);if(m)console.log(hora(j.timestamp),'RES',m.slice(0,8).join(' ¦ ').slice(0,600));}}}
}
