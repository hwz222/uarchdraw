import type { Design, Layout, Placed, Point, Rect } from './model.js';
import { pinMap, width } from './model.js';
import { readFileSync } from 'node:fs';
import { fontPath,glyphBounds,textWidth } from './font.js';
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const text=(x:number,y:number,s:string,size=23,anchor='middle',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`;
const color=(s?:string)=>s==='control'?'#536778':s==='forward'?'#b05a13':s==='writeback'?'#226a8c':'#222b32';
function symbol(n:Placed):string {
  const {x,y,w,h,instance:i}=n;
  let shape='';
  if(i.kind==='mux')shape=`<path d="M${x},${y} L${x+w},${y+24} V${y+h-24} L${x},${y+h} Z"/>`;
  else if(i.kind==='alu') {
    // Patterson/Hennessy datapath convention: sloped shoulders, one input notch,
    // a vertical output edge. Input pins land on the two straight left edges.
    shape=`<path d="M${x},${y} L${x+w},${y+h/4} V${y+3*h/4} L${x},${y+h} V${y+5*h/8} L${x+w/4},${y+h/2} L${x},${y+3*h/8} Z"/>`;
  } else if(i.kind==='adder')shape=`<path d="M${x},${y} H${x+60} L${x+w},${y+h/2} L${x+60},${y+h} H${x} V${y+60} L${x+24},${y+h/2} L${x},${y+36} Z"/>`;
  else shape=`<rect x="${x}" y="${y}" width="${w}" height="${h}" ${i.kind==='pipeline'?'fill="#f2f4f5"':''}/>`;
  const labels:string[]=[];
  const occupied:Rect[]=[];
  const textBox=(tx:number,ty:number,s:string,size:number,anchor:string):Rect=>{
    const g=glyphBounds(s,size),advance=textWidth(s,size);
    return {x:tx+g.x-(anchor==='middle'?advance/2:anchor==='end'?advance:0),y:ty+g.y,w:g.w,h:g.h};
  };
  const addLabel=(tx:number,ty:number,s:string,size=23,anchor='middle',extra='')=>{
    labels.push(text(tx,ty,s,size,anchor,extra));occupied.push(textBox(tx,ty,s,size,anchor));
  };
  if(i.kind==='pipeline') {
    labels.push(text(x+w/2,y+30,i.label,23,'middle','font-weight="bold"'));
    const done=new Set<string>();
    for(const p of i.pins){
      if(p.row===undefined){
        if(i.placement==='auto'&&['left','right'].includes(p.side)){
          const s=p.label??p.id,g=glyphBounds(s,16),a=n.pins[p.id]!;
          labels.push(text(p.side==='left'?x+8:x+w-8,a.y-g.y-g.h/2,s,16,p.side==='left'?'start':'end',`data-pin-label="${esc(i.id+'.'+p.id)}"`));
        }
        continue;
      }
      const label=p.label??p.id;if(done.has(label))continue;done.add(label);labels.push(text(x+w/2,n.pins[p.id]!.y-9,label,23));
    }
  } else if(i.kind==='mux') {
    const name=i.label;
    labels.push(text(x+w*.84,y+h/2,name,23,'middle',`transform="rotate(-90 ${x+w*.84} ${y+h/2})"`));
    i.pins.filter(p=>p.side==='left').forEach(p=>labels.push(text(x+6,n.pins[p.id]!.y+6,p.label??p.id,23,'start')));
  } else {
    const lines=i.label.split('\n'),yy=i.kind==='block'||i.kind==='register'?y+20:y+h/2-(lines.length-1)*13;
    lines.forEach((s,j)=>addLabel(x+w/2,yy+j*26+7,s,23,'middle','font-weight="bold"'));
    (i.notes??[]).forEach((s,j)=>addLabel(x+w/2,y+h-12-((i.notes?.length??0)-1-j)*22,s,16));
    if(i.kind==='block'||i.kind==='register')for(const p of i.pins.filter(p=>p.side==='left'||p.side==='right')){
      const a=n.pins[p.id]!;
      if(p.label&&p.label!==p.id||i.operation==='register-file'||i.placement==='auto'){
        const tx=p.side==='left'?x+8:x+w-8,anchor=p.side==='left'?'start':'end',s=p.label??p.id;
        // Center the glyphs on their pin, so adjacent labels cannot look like a
        // pair belonging to the same wire. Keep fallbacks in that pin's lane.
        const g=glyphBounds(s,16),centered=a.y-g.y-g.h/2;
        const neighbors=i.pins.filter(q=>q.side===p.side&&q.id!==p.id).map(q=>n.pins[q.id]!.y);
        const ty=[centered,a.y-7,a.y+21].find(v=>{
          const b=textBox(tx,v,s,16,anchor);
          return b.y>=y+2&&b.y+b.h<=y+h-2&&neighbors.every(py=>py<a.y?b.y>(py+a.y)/2:b.y+b.h<(py+a.y)/2)
            &&!occupied.some(c=>b.x<c.x+c.w+3&&b.x+b.w+3>c.x&&b.y<c.y+c.h+3&&b.y+b.h+3>c.y);
        })??centered;
        addLabel(tx,ty,s,16,anchor,`data-pin-label="${esc(i.id+'.'+p.id)}"`);
      }
    }
  }
  for(const p of i.pins) {
    const a=n.pins[p.id]!;
    labels.push(`<circle data-pin-id="${esc(i.id+'.'+p.id)}" cx="${a.x}" cy="${a.y}" r="2" fill="#222b32" stroke="none"><title>${esc(p.id)} (${p.direction})</title></circle>`);
  }
  return `<g id="instance-${i.id}" data-instance-id="${i.id}"><title>${esc(i.label)}</title><g fill="white" stroke="#26313a" stroke-width="2.2">${shape}</g>${labels.join('')}</g>`;
}
function paths(edges:[Point,Point][]):string {
  // Merge unit grid segments into long collinear spans; avoid tiny SVG fragments.
  const lines=new Map<string,number[]>();
  for(const [a,b] of edges){const h=a.y===b.y,k=h?`h:${a.y}`:`v:${a.x}`;const list=lines.get(k)??[];list.push(h?Math.min(a.x,b.x):Math.min(a.y,b.y));lines.set(k,list);}
  const out:string[]=[];
  for(const [k,vs] of lines){const [axis,fixed]=k.split(':'),f=Number(fixed);vs.sort((a,b)=>a-b);let start=vs[0]!,last=start;
    const emit=()=>out.push(axis==='h'?`M${start},${f}H${last+12}`:`M${f},${start}V${last+12}`);
    for(const v of vs.slice(1)){if(v>last+12){emit();start=v;}last=v;}emit();
  }return out.join(' ');
}
export function svg(d:Design,l:Layout,gray=false):string {
  const pins=pinMap(d);
  const hover=l.routes.map(r=>`svg:has([data-net-id="${r.net.id}"]:hover) [data-net-id="${r.net.id}"]{opacity:1}`).join('');
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${esc(d.title)}</title><desc id="desc">${esc(d.subtitle)}</desc>`,
    `<defs><style>@font-face{font-family:UarchDrawFont;src:url(data:font/ttf;base64,${readFileSync(fontPath).toString('base64')})}text{font-family:UarchDrawFont,DejaVu Sans,sans-serif;fill:#26313a}[data-net-id]{cursor:crosshair}svg:has([data-net-id]:hover) [data-net-id]{opacity:.15}${hover}</style></defs>`,
    `<rect width="${l.width}" height="${l.height}" fill="white"/>`,text(48,44,d.title,30,'start','font-weight="bold"'),text(48,76,d.subtitle,19,'start')];
  for(const s of l.stages)out.push(`<path d="M${s.x},${l.bodyTop-62}H${s.x+s.w-12}" stroke="#d2d8dd" stroke-width="2"/>`,text(s.x+s.w/2,l.bodyTop-78,s.name,24,'middle','font-weight="bold"'));
  for(const r of l.routes){const c=gray?'#30353a':color(r.net.style),path=paths(r.edges),dash=r.net.style==='control'?'stroke-dasharray="6 4"':'';
    const type=pins.get(r.net.source)!.pin.type,fields='fields' in type?'\n'+Object.entries(type.fields).map(([k,v])=>`${k}[${v}]`).join(' · '):'';
    const tip=`${r.net.label} (${width(type)} bits)\n${r.net.description??''}\n${r.net.source} → ${r.net.sinks.join(', ')}${fields}`;
    out.push(`<g id="net-${r.net.id}" data-net-id="${r.net.id}"><title>${esc(tip)}</title><path class="net-hit" d="${path}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke"/><path d="${path}" fill="none" stroke="white" stroke-width="6.5" stroke-linecap="round"/><path class="net-wire" d="${path}" fill="none" stroke="${c}" stroke-width="${r.net.style==='control'?1.6:2.3}" ${dash}/>`);
    for(const p of r.junctions)out.push(`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${c}"/>`);
    out.push('</g>');
  }
  for(const n of l.nodes)out.push(symbol(n));
  for(const r of l.routes)for(const sink of r.net.sinks){
    const [id,pin]=sink.split('.'),n=l.nodes.find(n=>n.instance.id===id)!,p=n.instance.pins.find(p=>p.id===pin)!,a=n.pins[pin!]!;
    const v=p.side==='left'?{x:1,y:0}:p.side==='right'?{x:-1,y:0}:p.side==='top'?{x:0,y:1}:{x:0,y:-1};
    const c=gray?'#30353a':color(r.net.style);
    out.push(`<path data-sink="${esc(sink)}" d="M${a.x-v.x*9-v.y*4},${a.y-v.y*9+v.x*4} L${a.x},${a.y} L${a.x-v.x*9+v.y*4},${a.y-v.y*9-v.x*4}" fill="none" stroke="${c}" stroke-width="1.6"/>`);
  }
  for(const r of l.routes)if(r.label){const a=r.label,tx=a.x+(a.vertical?a.size:0),ty=a.y+(a.vertical?a.h:a.size);
    out.push(text(tx,ty,a.text,a.size,'start',`data-net-id="${r.net.id}" data-label-for="${r.net.id}" ${a.vertical?`transform="rotate(-90 ${tx} ${ty})"`:''}`));}
  const ny=l.footerTop+38;
  d.notes.forEach((s,j)=>out.push(text(48,ny+j*27,s,19,'start')));
  out.push('</svg>');return out.join('\n');
}
