/** Self-contained reader for the exact audited SVG, with no network dependencies. */
import { pinMap,width,type Design,type Layout } from './model.js';
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function signalCatalog(d:Design,l:Layout){
  const pins=pinMap(d);
  return l.routes.map(r=>({id:r.net.id,name:r.net.label!,description:r.net.description??'',bits:width(pins.get(r.net.source)!.pin.type),
    fields:'fields' in pins.get(r.net.source)!.pin.type?(pins.get(r.net.source)!.pin.type as {fields:Record<string,number>}).fields:{},
    source:r.net.source,sinks:r.net.sinks,style:r.net.style??'data'}));
}
export function signalTable(d:Design,l:Layout):string{
  const cell=(s:string)=>s.replaceAll('|','\\|').replaceAll('\n',' ');
  return `# ${d.title} — Signal index\n\nGenerated from the same circuit model. Stages: ${d.stages.join(' → ')}. Examples use /N for bit width and {N} for the total width of a named bundle; port declarations define the types.\n\n| Signal | Width | Meaning | Source → Destinations | Bundle fields |\n| --- | --- | --- | --- | --- |\n`+
    signalCatalog(d,l).map(s=>`| ${[s.name,String(s.bits),s.description,s.source+' → '+s.sinks.join(', '),Object.entries(s.fields).map(([k,v])=>`${k}[${v}]`).join(', ')].map(cell).join(' | ')} |`).join('\n')+'\n';
}
export function inspector(d:Design,l:Layout,drawing:string):string{
  const catalog=signalCatalog(d,l),json=JSON.stringify(catalog).replaceAll('<','\\u003c');
  const styles=new Set(catalog.map(s=>s.style));
  const legend=([['data','','Data'],['control','control','Control'],['forward','mem','Forwarding'],['writeback','wb','Writeback']] as const)
    .filter(([style])=>styles.has(style!)).map(([,cls,label])=>`<span class="swatch ${cls}"></span>${label}`).join(' &nbsp; ');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title)} — Signal inspector</title>
<style>
*{box-sizing:border-box}body{margin:0;color:#26313a;font:15px system-ui,sans-serif;background:#f5f7f9}header{height:66px;padding:12px 20px;border-bottom:1px solid #d4dce3;background:white;display:flex;align-items:center;gap:12px}header strong{margin-right:auto}button,select,input{font:inherit;color:inherit;border:1px solid #bcc9d4;background:white;border-radius:5px;padding:7px 11px}button{cursor:pointer}button:hover,button:focus-visible{background:#e8f0f7}main{display:grid;grid-template-columns:minmax(0,1fr) 350px;height:calc(100vh - 66px)}#canvas{overflow:auto;background:white;padding:16px}#canvas svg{display:block;max-width:none;height:auto}aside{overflow:auto;border-left:1px solid #d4dce3;padding:18px}h1{font-size:20px;margin:0 0 10px}p{line-height:1.65;margin:9px 0}.muted{color:#566978;font-size:13px}#detail{padding:16px;background:white;border:1px solid #d4dce3;border-radius:8px;margin:14px 0;overflow-wrap:anywhere}#detail h2{font-size:20px;margin:0 0 8px}#detail dt{font-size:12px;color:#566978;margin-top:12px}#detail dd{margin:4px 0;line-height:1.5}#filter{width:100%}#list{display:grid;gap:5px;margin-top:12px}#list button{text-align:left;padding:10px}#list button small{display:block;color:#596c7a;margin-top:4px}#list button[aria-pressed=true]{background:#e4f0fa;border-color:#4885b4}.legend{font-size:13px;line-height:1.8}.swatch{display:inline-block;width:22px;border-top:2px solid #26313a;margin-right:7px;vertical-align:middle}.control{border-top:2px dashed #536778}.mem{border-color:#b05a13}.wb{border-color:#226a8c}#canvas svg.has-selection [data-net-id]{opacity:.1!important}#canvas svg.has-selection [data-net-id].selected{opacity:1!important}#canvas svg [data-instance-id].endpoint>g{stroke:#287cac;stroke-width:4}#canvas svg [data-pin-id].endpoint{fill:#287cac;r:6}#canvas svg.has-selection [data-net-id].selected path:not(.net-hit){stroke-width:3.5}#canvas svg.has-selection [data-net-id].selected path[stroke=white]{stroke-width:7}
@media(max-width:800px){main{grid-template-columns:minmax(0,1fr) 280px}header{padding:10px;gap:6px}header strong{font-size:13px}button,select{padding:6px}}
</style>
<header><strong>${esc(d.title)}</strong><label for="zoom">Zoom</label><select id="zoom"><option value="fit">Fit width</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select><button id="clear">Clear selection</button></header>
<main><div id="canvas" aria-label="Datapath diagram">${drawing}</div><aside>
<h1>Trace signals</h1><p class="muted">Select a wire, its label, or an entry below to highlight the entire net and its endpoints. Zoom and scroll to read details.</p>
<div class="legend">${legend}<br>● marks a connection; a white gap marks a crossing.<br>/N = N bits; {N} = typed bundle.<br>Stages: ${d.stages.map(esc).join(' → ')}.</div>
<div id="detail" role="status" aria-live="polite"><p>${catalog.length} signals. Select one to inspect its meaning, width, source, destination ports, and bundle fields.</p></div>
<label for="filter">Search names, ports or descriptions</label><input id="filter" type="search" autocomplete="off"><div id="count" class="muted"></div>
<nav id="list" aria-label="Signals">${catalog.map(s=>`<button data-select="${s.id}" aria-pressed="false">${esc(s.name)}<small>${esc(s.source)} → ${s.sinks.length} receiving ports</small></button>`).join('')}</nav>
</aside></main><script>
const signals=${json};const canvas=document.getElementById('canvas'),svg=canvas.querySelector('svg'),detail=document.getElementById('detail'),filter=document.getElementById('filter');
const initial=detail.innerHTML;const byId=new Map(signals.map(s=>[s.id,s]));
function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
function select(id){const s=byId.get(id);svg.classList.toggle('has-selection',!!s);svg.querySelectorAll('.selected,.endpoint').forEach(e=>e.classList.remove('selected','endpoint'));document.querySelectorAll('[data-select]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.select===id)));detail.replaceChildren();if(!s){detail.innerHTML=initial;return;}
svg.querySelectorAll('[data-net-id]').forEach(e=>{if(e.dataset.netId===id)e.classList.add('selected');});
for(const ref of [s.source,...s.sinks]){document.getElementById('instance-'+ref.split('.')[0]).classList.add('endpoint');svg.querySelectorAll('[data-pin-id]').forEach(e=>{if(e.dataset.pinId===ref)e.classList.add('endpoint');});}
detail.append(element('h2',s.name),element('p',s.description||s.id));const dl=element('dl','');for(const [k,v] of [['Width',s.bits+' bits'],['Source',s.source],['Destination ports',s.sinks.join(' / ')],['Bundle fields',Object.entries(s.fields).map(([k,v])=>k+' ['+v+']').join(' · ')||'Scalar signal']]){dl.append(element('dt',k),element('dd',v));}detail.append(dl);}
document.getElementById('list').addEventListener('click',e=>{const b=e.target.closest('[data-select]');if(b)select(b.dataset.select);});
svg.addEventListener('click',e=>{const n=e.target.closest('[data-net-id]');if(n)select(n.dataset.netId);});
document.getElementById('clear').addEventListener('click',()=>select());document.addEventListener('keydown',e=>{if(e.key==='Escape')select();});
function zoom(){const z=document.getElementById('zoom').value;svg.style.width=(z==='fit'?Math.max(100,canvas.clientWidth-32):${l.width}*Number(z))+'px';}document.getElementById('zoom').addEventListener('change',zoom);window.addEventListener('resize',zoom);zoom();
function search(){const q=filter.value.trim().toLowerCase();let count=0;document.querySelectorAll('[data-select]').forEach(b=>{const s=byId.get(b.dataset.select);b.hidden=!JSON.stringify(s).toLowerCase().includes(q);if(!b.hidden)count++;});document.getElementById('count').textContent=count+' / '+signals.length+' signals';}filter.addEventListener('input',search);search();
</script></html>`;
}
