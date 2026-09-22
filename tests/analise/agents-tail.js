// subagentes por transcript (~/.claude/projects) na janela DE/ATE (editar no topo) — uso: node agents-tail.js
const fs=require('fs'),path=require('path');
const base=path.join(process.env.USERPROFILE||process.env.HOME,'.claude','projects');
const DE=Date.parse('2026-09-03T03:00:00Z'),ATE=Date.parse('2026-09-05T03:00:00Z');
const rows=[];
for(const proj of fs.readdirSync(base)){if(!/mariana|caronte|universitarias/i.test(proj))continue;const pd=path.join(base,proj);
 let sessions=[];try{sessions=fs.readdirSync(pd).filter(f=>fs.statSync(path.join(pd,f)).isDirectory())}catch{continue}
 for(const s of sessions){const sd=path.join(pd,s,'subagents');if(!fs.existsSync(sd))continue;
  for(const f of fs.readdirSync(sd)){if(!f.endsWith('.jsonl'))continue;const fp=path.join(sd,f);const st=fs.statSync(fp);if(st.mtimeMs<DE||st.mtimeMs>ATE)continue;
   let meta={};try{meta=JSON.parse(fs.readFileSync(fp.replace(/\.jsonl$/,'.meta.json'),'utf8'))}catch{}
   let first=null,last=null,tu=0,out=0,bash=0,read=0,edit=0,write=0;const lines=fs.readFileSync(fp,'utf8').split('\n');
   for(const l of lines){if(!l)continue;let o;try{o=JSON.parse(l)}catch{continue}const t=o.timestamp?Date.parse(o.timestamp):null;if(t){if(first==null||t<first)first=t;if(last==null||t>last)last=t}
    const m=o.message;if(m&&m.usage)out+=m.usage.output_tokens||0;if(m&&Array.isArray(m.content))for(const c of m.content){if(c.type==='tool_use'){tu++;if(c.name==='Bash')bash++;else if(c.name==='Read'||c.name==='Grep'||c.name==='Glob')read++;else if(c.name==='Edit')edit++;else if(c.name==='Write')write++}}}
   rows.push({proj:proj.replace(/^C--laragon-www-/,'').slice(0,28),tipo:meta.agentType||'?',desc:(meta.description||'').slice(0,50),min:first&&last?Math.round((last-first)/60000):null,tu,bash,read,edit,write,out,lines:lines.length});}}}
rows.sort((a,b)=>(b.min||0)-(a.min||0));
console.log('subagentes na janela:',rows.length);
const byTipo={};for(const r of rows){const t=byTipo[r.tipo]=byTipo[r.tipo]||{n:0,min:[],tu:[],bash:0,read:0};t.n++;t.min.push(r.min||0);t.tu.push(r.tu);t.bash+=r.bash;t.read+=r.read}
const med=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:0};const p90=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?a[Math.min(a.length-1,Math.floor(a.length*0.9))]:0};
console.log('\nTIPO | n | min med/p90/max | turnos med/p90/max | bash:read');
for(const t of Object.keys(byTipo).sort((a,b)=>byTipo[b].n-byTipo[a].n)){const x=byTipo[t];console.log(t.padEnd(16),String(x.n).padStart(3),' | ',med(x.min)+'/'+p90(x.min)+'/'+Math.max(...x.min),' | ',med(x.tu)+'/'+p90(x.tu)+'/'+Math.max(...x.tu),' | ',x.bash+':'+x.read)}
console.log('\nTOP 22 por duracao:');
for(const r of rows.slice(0,22))console.log([r.proj.padEnd(28),r.tipo.padEnd(13),String(r.min).padStart(4)+'min','tu='+String(r.tu).padStart(3),'bash='+r.bash,'read='+r.read,'edit='+r.edit,'write='+r.write,'out='+Math.round(r.out/1000)+'k',r.desc].join(' | '));
console.log('\nTOP 10 por turnos:');
for(const r of rows.slice().sort((a,b)=>b.tu-a.tu).slice(0,10))console.log([r.proj.padEnd(28),r.tipo.padEnd(13),String(r.min).padStart(4)+'min','tu='+String(r.tu).padStart(3),'bash='+r.bash,'read='+r.read,r.desc].join(' | '));
