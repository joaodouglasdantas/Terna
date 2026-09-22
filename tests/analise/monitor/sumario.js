// sumario.js <jsonl> [maxLinhas] — linha do tempo compacta de um transcript do Claude Code
const fs=require('fs');const f=process.argv[2];const MAX=+process.argv[3]||400;
const lines=fs.readFileSync(f,'utf8').split('\n').filter(Boolean);
const ev=[];let st={msgs:0,asst:0,user:0,tool:{},agents:0,out:0,think:0,text:0,models:{},first:null,last:null,sidechain:0};
const hora=t=>{if(!t)return'??:??';const d=new Date(t);return d.toLocaleTimeString('pt-BR',{hour12:false,timeZone:'America/Fortaleza'}).slice(0,8)};
const cut=(s,n)=>String(s??'').replace(/\s+/g,' ').slice(0,n);
for(const l of lines){let j;try{j=JSON.parse(l)}catch{continue}
 const t=j.timestamp;if(t){st.first??=t;st.last=t}
 if(j.isSidechain){st.sidechain++;}
 st.msgs++;
 if(j.type==='system'){ev.push([t,'SYS',cut(j.content||j.message?.content||JSON.stringify(j).slice(0,200),260)]);continue}
 const m=j.message;if(!m)continue;
 if(j.type==='user'){st.user++;const c=m.content;
  if(typeof c==='string'){ev.push([t,'USER',cut(c,600)]);continue}
  for(const b of c||[]){ if(b.type==='text')ev.push([t,'USER',cut(b.text,600)]);
   if(b.type==='tool_result'){const txt=Array.isArray(b.content)?b.content.map(x=>x.text||'').join(' '):String(b.content??'');
    const interesting=b.is_error||/hook error|hook.*(negad|bloque|deny)|\[guard|CARGA\||ESFORCO\||SEMAFORO|frentes|denied|Permission|timed out|cancel|rate.?limit|429|overloaded|erro|Error/i.test(txt);
    if(interesting)ev.push([t,b.is_error?'ERR':'RES',cut(txt,320)]);}}
  continue}
 if(j.type==='assistant'){st.asst++;const u=m.usage||{};st.out+=u.output_tokens||0;const mo=m.model||'?';st.models[mo]=(st.models[mo]||0)+1;
  for(const b of m.content||[]){
   if(b.type==='thinking'){st.think+=(b.thinking||'').length}
   if(b.type==='text'){st.text+=(b.text||'').length;ev.push([t,'ASST',cut(b.text,400)])}
   if(b.type==='tool_use'){const n=b.name;st.tool[n]=(st.tool[n]||0)+1;const i=b.input||{};let d='';
    if(n==='Agent'){st.agents++;d=`${i.subagent_type||'?'} · ${cut(i.description,80)} · model=${i.model||'-'} bg=${i.run_in_background??'-'}`}
    else if(n==='Bash'||n==='PowerShell')d=cut(i.command,200);
    else if(n==='Skill')d=`${i.skill} ${cut(i.args,100)}`;
    else if(n==='AskUserQuestion')d=cut((i.questions||[]).map(q=>q.question).join(' | '),300);
    else if(n==='Read')d=cut(i.file_path,140);
    else if(n==='Write'||n==='Edit')d=cut(i.file_path,140);
    else if(n==='Grep')d=cut(i.pattern+' '+(i.path||''),120);
    else if(n==='Glob')d=cut(i.pattern,120);
    else if(/get_session|set_session|list_sessions/.test(n))d=cut(JSON.stringify(i),120);
    else d=cut(JSON.stringify(i),120);
    ev.push([t,'TOOL',`${n}: ${d}`])}}}
}
const thinkPct=st.think+st.text?Math.round(100*st.think/(st.think+st.text)):0;
console.log(`# ${f.split('/').pop()}  msgs=${st.msgs} asst=${st.asst} user=${st.user} sidechain=${st.sidechain} agents=${st.agents} out_tokens=${st.out} thinking≈${thinkPct}% first=${hora(st.first)} last=${hora(st.last)} models=${JSON.stringify(st.models)}`);
console.log(`# tools: ${Object.entries(st.tool).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+'='+v).join(' ')}`);
const keep=ev.filter(e=>e[1]!=='TOOL'||/^(Agent|Skill|AskUserQuestion|Task|mcp__|Write|Edit)/.test(e[2])||/hooks\/|harness|esforco|frentes|worktree|task-packet|reservar|start |stop /.test(e[2]));
const sel=keep.length>MAX?keep.slice(0,Math.floor(MAX*0.4)).concat([[null,'...',`(${keep.length-MAX} eventos omitidos)`]],keep.slice(-Math.ceil(MAX*0.6))):keep;
for(const [t,k,d] of sel)console.log(`${hora(t)} ${k.padEnd(4)} ${d}`);
