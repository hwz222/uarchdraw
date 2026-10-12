import type { Design, Layout, Point, Rect } from './model.js';
import { glyphBounds, textWidth } from './font.js';
const key=(p:Point)=>`${p.x},${p.y}`;
const overlap=(a:Rect,b:Rect)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.5;
const decode=(s:string)=>s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&amp;','&');
function attrs(s:string):Record<string,string>{return Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1]!,m[2]!]));}
function polygon(path:string):Point[]{
  const ts=path.match(/[MLHVZ]|-?\d+(?:\.\d+)?/g)??[],out:Point[]=[];let x=0,y=0;
  for(let i=0;i<ts.length;){const c=ts[i++]!;if(c==='Z')break;if(c==='M'||c==='L'){x=Number(ts[i++]);y=Number(ts[i++]);}else if(c==='H')x=Number(ts[i++]);else if(c==='V')y=Number(ts[i++]);else throw new Error('Unsupported outline '+c);out.push({x,y});}return out;
}
/** Read the visible SVG wire, independently of the router's edge list. */
function renderedEdges(path:string):Set<string>{
  const tokens=path.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g)??[],edges=new Set<string>();
  let at:Point|undefined;
  const number=(i:number)=>{const v=Number(tokens[i]);if(!Number.isFinite(v)||v%12!==0)throw new Error('invalid wire coordinate');return v;};
  for(let i=0;i<tokens.length;){
    const cmd=tokens[i++]!;
    if(cmd==='M'){at={x:number(i++),y:number(i++)};continue;}
    if(!at||!['H','V'].includes(cmd))throw new Error('unsupported wire path');
    const end=cmd==='H'?{x:number(i++),y:at.y}:{x:at.x,y:number(i++)};
    let p:Point=at;
    while(p.x!==end.x||p.y!==end.y){
      const next:Point={x:p.x+Math.sign(end.x-p.x)*12,y:p.y+Math.sign(end.y-p.y)*12};
      const k=[key(p),key(next)].sort().join('|');
      if(edges.has(k))throw new Error('duplicate rendered segment');edges.add(k);p=next;
    }
    at=end;
  }
  return edges;
}
const distance=(p:Point,a:Point,b:Point)=>{
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
const boundary=(p:Point,ps:Point[])=>Math.min(...ps.map((a,j)=>distance(p,a,ps[(j+1)%ps.length]!)));
function within(p:Point,ps:Point[]):boolean{
  if(boundary(p,ps)<.01)return false;let yes=false;
  for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i]!,b=ps[j]!;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;
}
export interface Audit { ok:boolean; errors:string[]; metrics:{symbols:number;nets:number;labeledNets:number;sinks:number;crossings:number;junctions:number;bends:number;segments:number;texts:number} }
/** Deliberately reads rendered outlines and glyph bounds, not router obstacle exceptions. */
export function audit(d:Design,l:Layout,drawing:string):Audit {
  const errors:string[]=[],outlines=new Map<string,Point[]>();
  const root=attrs(drawing.match(/<svg\s+([^>]+)>/)?.[1]??'');
  if(Number(root.width)!==l.width||Number(root.height)!==l.height||root.viewBox!==`0 0 ${l.width} ${l.height}`)errors.push('Rendered SVG canvas differs from layout');
  for(let i=0;i<l.nodes.length;i++)for(let j=0;j<i;j++)if(overlap(l.nodes[i]!,l.nodes[j]!))errors.push(`Overlapping symbols ${l.nodes[i]!.instance.id} / ${l.nodes[j]!.instance.id}`);
  for(const m of drawing.matchAll(/<g id="instance-([^"]+)"[\s\S]*?<g fill="white"[^>]*>([\s\S]*?)<\/g>/g)){
    const shape=m[2]!,pa=shape.match(/<path d="([^"]+)"/);
    if(pa)outlines.set(m[1]!,polygon(pa[1]!));else {const a=attrs(shape),x=Number(a.x),y=Number(a.y),w=Number(a.width),h=Number(a.height);outlines.set(m[1]!,[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]);}
  }
  for(const n of l.nodes){
    const ps=outlines.get(n.instance.id);
    if(!ps){errors.push(`Missing rendered symbol ${n.instance.id}`);continue;}
    if(ps.some(p=>p.x<0||p.y<0||p.x>l.width||p.y>l.height))errors.push(`Symbol clipped: ${n.instance.id}`);
    const positions=new Set<string>();
    for(const [p,a] of Object.entries(n.pins)){
      if(boundary(a,ps)>.1)errors.push(`Pin ${n.instance.id}.${p} misses rendered outline`);
      if(positions.has(key(a)))errors.push(`Coincident pins on ${n.instance.id} at ${key(a)}`);positions.add(key(a));
    }
  }
  const groups=new Map<string,string[]>();
  for(const m of drawing.matchAll(/<g id="net-([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)){
    const items=groups.get(m[1]!)??[];items.push(m[2]!);groups.set(m[1]!,items);
  }
  const allEdges=new Map<string,string>(),vertices=new Map<string,Map<string,number>>();
  let crossings=0,bends=0;
  for(const r of l.routes){
    const group=groups.get(r.net.id);
    const wires=group?.length===1?[...group[0]!.matchAll(/<path\s+([^>]+)>/g)].map(m=>attrs(m[1]!)).filter(a=>a.class?.split(/\s+/).includes('net-wire')):[];
    if(wires.length!==1||['none','transparent'].includes(wires[0]?.stroke??'none'))errors.push(`${r.net.id}: missing or duplicate visible SVG wire`);
    else try{
      const actual=renderedEdges(wires[0]!.d??''),wanted=new Set(r.edges.map(([a,b])=>[key(a),key(b)].sort().join('|')));
      if(actual.size!==wanted.size||[...wanted].some(k=>!actual.has(k)))errors.push(`${r.net.id}: rendered SVG wire differs from routed connectivity`);
    }catch(e){errors.push(`${r.net.id}: invalid rendered SVG wire (${e instanceof Error?e.message:e})`);}
    const adj=new Map<string,Set<string>>();
    for(const [a,b] of r.edges){
      if(a.x!==b.x&&a.y!==b.y)errors.push(`${r.net.id}: diagonal segment`);
      const ak=key(a),bk=key(b),ek=[ak,bk].sort().join('|'),prev=allEdges.get(ek);if(prev&&prev!==r.net.id)errors.push(`${r.net.id}: shared segment with ${prev}`);allEdges.set(ek,r.net.id);
      for(const [p,q] of [[ak,bk],[bk,ak]]){const s=adj.get(p!)??new Set<string>();s.add(q!);adj.set(p!,s);}
      for(const p of [a,b]){const v=vertices.get(key(p))??new Map<string,number>();v.set(r.net.id,(v.get(r.net.id)??0)+1);vertices.set(key(p),v);}
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      for(const [id,ps] of outlines)if(within(mid,ps))errors.push(`${r.net.id}: enters rendered symbol ${id} at ${key(mid)}`);
    }
    const locate=(s:string)=>{const [id,p]=s.split('.');return l.nodes.find(n=>n.instance.id===id)!.pins[p!]!;};
    const seen=new Set<string>(),stack=[key(locate(r.net.source))];while(stack.length){const k=stack.pop()!;if(seen.has(k))continue;seen.add(k);stack.push(...adj.get(k)??[]);}
    for(const s of r.net.sinks)if(!seen.has(key(locate(s))))errors.push(`${r.net.id}: disconnected sink ${s}`);
    if(seen.size!==adj.size)errors.push(`${r.net.id}: detached wire island`);
    const want=[...adj].filter(([,v])=>v.size>=3).map(([k])=>k).sort();
    for(const neighbors of adj.values())if(neighbors.size===2){const [a,b]=[...neighbors].map(k=>k.split(',').map(Number));if(a![0]!==b![0]&&a![1]!==b![1])bends++;}
    if(JSON.stringify(want)!==JSON.stringify(r.junctions.map(key).sort()))errors.push(`${r.net.id}: wrong junction dots`);
  }
  for(const [k,ns] of vertices)if(ns.size>1){crossings++;if([...ns.values()].some(n=>n!==2))errors.push(`Ambiguous crossing / endpoint at ${k}`);}
  const texts:{value:string;box:Rect}[]=[],labels=new Map<string,string[]>();
  for(const m of drawing.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)){
    const a=attrs(m[1]!),value=decode(m[2]!),size=Number(a['font-size']),g=glyphBounds(value,size),advance=textWidth(value,size);
    if(a['data-label-for']){const id=a['data-label-for']!,list=labels.get(id)??[];list.push(value);labels.set(id,list);}
    const x=Number(a.x)-(a['text-anchor']==='middle'?advance/2:a['text-anchor']==='end'?advance:0),y=Number(a.y);
    let box={x:x+g.x,y:y+g.y,w:g.w,h:g.h};
    if(a.transform){const [angle,cx,cy]=(a.transform.match(/-?\d+(?:\.\d+)?/g)??[]).map(Number);if(angle===-90)box={x:cx!+box.y-cy!,y:cy!-(box.x+box.w-cx!),w:box.h,h:box.w};}
    if(a['data-label-for']){
      const route=l.routes.find(r=>r.net.id===a['data-label-for']);
      // Read actual rendered glyph positions, so moving only SVG text is caught.
      // A label needs an overlapping projection on its own wire within 24 px.
      const close=route?.edges.some(([p,q])=>p.y===q.y?
        Math.max(p.x,q.x)>box.x&&Math.min(p.x,q.x)<box.x+box.w&&Math.min(Math.abs(p.y-box.y),Math.abs(p.y-box.y-box.h))<=24:
        Math.max(p.y,q.y)>box.y&&Math.min(p.y,q.y)<box.y+box.h&&Math.min(Math.abs(p.x-box.x),Math.abs(p.x-box.x-box.w))<=24);
      if(!close)errors.push(`${a['data-label-for']}: rendered signal label is detached from its wire`);
    }
    if(a['data-pin-label']){
      const ref=a['data-pin-label']!,[id,pid]=ref.split('.'),n=l.nodes.find(n=>n.instance.id===id),p=n?.instance.pins.find(p=>p.id===pid),at=n?.pins[pid!];
      if(!n||!p||!at||value!==(p.label??p.id))errors.push(`${ref}: incorrect rendered pin label`);
      else {
        const peers=n.instance.pins.filter(q=>q.side===p.side&&q.id!==p.id).map(q=>n.pins[q.id]!.y);
        if(peers.some(py=>py<at.y?box.y<=(py+at.y)/2:box.y+box.h>=(py+at.y)/2))errors.push(`${ref}: rendered pin label leaves its own lane`);
      }
    }
    if(box.x<0||box.y<0||box.x+box.w>l.width||box.y+box.h>l.height)errors.push(`Text clipped: ${value}`);
    for(const prev of texts)if(overlap(box,prev.box))errors.push(`Text collision: ${value} / ${prev.value}`);
    texts.push({value,box});
    for(const r of l.routes)for(const [a,b] of r.edges){
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(mid.x>box.x&&mid.x<box.x+box.w&&mid.y>box.y&&mid.y<box.y+box.h){errors.push(`Wire ${r.net.id} crosses text: ${value}`);break;}
    }
  }
  for(const r of l.routes){const texts=labels.get(r.net.id);if(texts?.length!==1||texts[0]!==r.net.label)errors.push(`${r.net.id}: missing, duplicate or incorrect rendered signal label`);}
  return {ok:errors.length===0,errors:[...new Set(errors)],metrics:{symbols:l.nodes.length,nets:l.routes.length,labeledNets:labels.size,sinks:d.nets.reduce((a,n)=>a+n.sinks.length,0),crossings,junctions:l.routes.reduce((a,n)=>a+n.junctions.length,0),bends,segments:allEdges.size,texts:texts.length}};
}
