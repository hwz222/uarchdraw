import type { Design, Layout, Point, Routed, Rect, WireLabel } from './model.js';
import { GRID as G, snap, textWidth } from './font.js';
import { pinMap, width } from './model.js';
import { placeWireLabel } from './labels.js';
const key=(p:Point)=>`${p.x},${p.y}`;
const edgeKey=(a:Point,b:Point)=>[key(a),key(b)].sort().join('|');
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
const inside=(p:Point,r:Rect,pad=0)=>p.x>r.x-pad&&p.x<r.x+r.w+pad&&p.y>r.y-pad&&p.y<r.y+r.h+pad;
const dirs=[{x:G,y:0},{x:0,y:G},{x:-G,y:0},{x:0,y:-G}];
class Heap {
  a:{id:number;cost:number}[]=[];
  push(id:number,cost:number){let i=this.a.length;this.a.push({id,cost});while(i){const j=(i-1)>>1;if(this.a[j]!.cost<=cost)break;this.a[i]=this.a[j]!;i=j;}this.a[i]={id,cost};}
  pop(){const r=this.a[0]!,v=this.a.pop()!;if(this.a.length){let i=0;while(2*i+1<this.a.length){let j=2*i+1;if(j+1<this.a.length&&this.a[j+1]!.cost<this.a[j]!.cost)j++;if(v.cost<=this.a[j]!.cost)break;this.a[i]=this.a[j]!;i=j;}this.a[i]=v;}return r;}
}
/** Grid A*: different nets cannot share segments or form accidental T junctions. */
export function route(d:Design,l:Layout):void {
  const owners=new Map<string,string>(), vertex=new Map<string,Map<string,number>>();
  const ends=new Map<string,{at:Point;escape:Point;stub:[Point,Point][]}>();
  const unit=(a:Point,b:Point):[Point,Point][]=>{
    if([a.x,a.y,b.x,b.y].some(v=>!Number.isFinite(v)||v%G!==0))throw new Error('Route endpoint is not on the routing grid');
    if(a.x!==b.x&&a.y!==b.y)throw new Error('Non-orthogonal route');
    const result:[Point,Point][]=[];let p=a;
    while(!same(p,b)){const q={x:p.x+Math.sign(b.x-p.x)*G,y:p.y+Math.sign(b.y-p.y)*G};result.push([p,q]);p=q;}
    return result;
  };
  function occupy(id:string,edges:[Point,Point][]){for(const [a,b] of edges){
    const k=edgeKey(a,b),prev=owners.get(k);if(prev&&prev!==id)throw new Error(`Port conflict ${id} / ${prev} at ${k}`);owners.set(k,id);
    const axis=a.y===b.y?1:2;
    for(const p of [a,b]){const v=vertex.get(key(p))??new Map<string,number>();v.set(id,(v.get(id)??0)|axis);vertex.set(key(p),v);}
  }}
  for(const n of l.nodes)for(const p of n.instance.pins){
    const at=n.pins[p.id]!;let escape:Point;
    switch(p.side){case'left':escape={x:n.x-24,y:at.y};break;case'right':escape={x:n.x+n.w+24,y:at.y};break;case'top':escape={x:at.x,y:n.y-24};break;case'bottom':escape={x:at.x,y:n.y+n.h+24};break;}
    ends.set(`${n.instance.id}.${p.id}`,{at,escape,stub:unit(at,escape)});
  }
  for(const n of d.nets) for(const k of [n.source,...n.sinks]) occupy(n.id,ends.get(k)!.stub);
  const pins=pinMap(d);
  const ordered=d.nets.map(n=>({...n,label:n.label??`${n.id}/${width(pins.get(n.source)!.pin.type)}`})).sort((a,b)=>{
    const pr=(n:typeof a)=>n.corridor?0:n.style==='control'?3:n.sinks.length===1?1:2;
    return pr(a)-pr(b)||a.id.localeCompare(b.id);
  });
  const corridors=new Map<string,{left:Point;right:Point;label?:WireLabel}>();let top=0,bottom=0;
  const corridorXs=[...new Set(ordered.filter(n=>n.corridor).flatMap(n=>[n.source,...n.sinks].map(s=>ends.get(s)!.escape.x)))].sort((a,b)=>a-b);
  for(const n of ordered.filter(n=>n.corridor)){
    const y=n.corridor==='top'?132+(top++)*36:l.bodyBottom+72+(bottom++)*48;
    const xs=[n.source,...n.sinks].map(s=>ends.get(s)!.escape.x);
    const left={x:Math.min(...xs),y},right={x:Math.max(...xs),y};
    let label:WireLabel|undefined;
    if(n.label){
      const w=textWidth(n.label,23)+8;let x=snap(left.x+36);
      const xs=corridorXs.filter(x=>x>=left.x&&x<=right.x),gaps=xs.slice(1).map((b,j)=>({x:xs[j]!,w:b-xs[j]!})).sort((a,b)=>b.w-a.w);
      const free=gaps.find(g=>g.w>=w+48);if(free)x=snap(free.x+(free.w-w)/2);
      label={x,y:y-30,w,h:27,text:n.label,size:21};
    }
    corridors.set(n.id,{left,right,label});
  }
  const labelObstacles:Rect[]=[...l.stages.map(s=>({x:s.x+s.w/2-textWidth(s.name,24)/2-6,y:l.bodyTop-104,w:textWidth(s.name,24)+12,h:30})),
    ...[...corridors.values()].flatMap(c=>c.label?[c.label]:[])];
  const cols=l.width/G+1, rows=l.height/G+1, total=cols*rows*5;
  const blocked=new Uint8Array(cols*rows);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const p={x:x*G,y:y*G};if(l.nodes.some(n=>inside(p,n,12))||labelObstacles.some(n=>inside(p,n,6)))blocked[y*cols+x]=1;
  }
  function search(seeds:Point[],target:Point,id:string):[Point,Point][] {
    const costs=new Float64Array(total);costs.fill(Infinity);
    const parent=new Int32Array(total);parent.fill(-1);
    const heap=new Heap();
    const encode=(p:Point,dir:number)=>((p.y/G)*cols+p.x/G)*5+dir;
    const point=(s:number):Point=>({x:Math.floor(s/5)%cols*G,y:Math.floor(Math.floor(s/5)/cols)*G});
    for(const p of seeds){const s=encode(p,4);costs[s]=0;heap.push(s,(Math.abs(p.x-target.x)+Math.abs(p.y-target.y))/G);}
    let found=-1;
    while(heap.a.length){const {id:s,cost}=heap.pop();const a=point(s),oldDir=s%5;
      if(cost>costs[s]!+(Math.abs(a.x-target.x)+Math.abs(a.y-target.y))/G+.001)continue;
      if(same(a,target)){found=s;break;}
      for(let dir=0;dir<4;dir++){
        const dd=dirs[dir]!,b={x:a.x+dd.x,y:a.y+dd.y};
        if(b.x<24||b.y<120||b.x>l.width-24||b.y>l.footerTop)continue;
        if(blocked[b.y/G*cols+b.x/G])continue;
        const owner=owners.get(edgeKey(a,b));if(owner&&owner!==id)continue;
        const axis=dir%2===0?1:2;
        const va=vertex.get(key(a)),vb=vertex.get(key(b));
        const foreignA=va?[...va].filter(([k])=>k!==id):[];
        const foreignB=vb?[...vb].filter(([k])=>k!==id):[];
        if(foreignA.length&&(oldDir===4||dir!==oldDir||foreignA.some(([,ax])=>ax===3||ax===axis)))continue;
        if(foreignB.some(([,ax])=>ax===3||ax===axis))continue;
        // Crossing is only legal through a segment interior, never its end.
        if(foreignB.some(([k])=>{
          const perp=axis===1?{x:0,y:G}:{x:G,y:0};
          return owners.get(edgeKey(b,{x:b.x+perp.x,y:b.y+perp.y}))!==k||owners.get(edgeKey(b,{x:b.x-perp.x,y:b.y-perp.y}))!==k;
        }))continue;
        const ns=encode(b,dir),c=costs[s]!+1+(oldDir!==4&&dir!==oldDir?5:0)+foreignB.length*14;
        if(c<costs[ns]!){costs[ns]=c;parent[ns]=s;heap.push(ns,c+(Math.abs(b.x-target.x)+Math.abs(b.y-target.y))/G);}
      }
    }
    if(found<0)throw new Error(`No legal route for ${id} to ${key(target)}; change port order or row/column placement`);
    const path:Point[]=[];for(let s=found;s>=0;s=parent[s]!)path.push(point(s));path.reverse();
    return path.slice(1).map((b,i)=>[path[i]!,b]);
  }
  for(const net of ordered){
    const source=ends.get(net.source)!,edges:[Point,Point][]=[...source.stub];
    let seeds=[source.escape],label:WireLabel|undefined;
    const append=(es:[Point,Point][])=>{occupy(net.id,es);edges.push(...es);};
    if(net.corridor){
      const c=corridors.get(net.id)!,{left,right}=c;label=c.label;
      const trunk=unit(left,right);append(trunk);
      append(search(trunk.length?trunk.flatMap(e=>e):[left],source.escape,net.id));
      seeds=edges.flatMap(e=>e);
    }
    for(const sink of [...net.sinks].sort((a,b)=>{
      const dist=(s:string)=>{const p=ends.get(s)!.escape;return Math.abs(p.x-source.escape.x)+Math.abs(p.y-source.escape.y);};return dist(a)-dist(b)||a.localeCompare(b);
    })){
      const end=ends.get(sink)!;append(search(seeds,end.escape,net.id));append(end.stub);
      seeds=edges.flatMap(e=>e);
    }
    const uniq=[...new Map(edges.map(e=>[edgeKey(...e),e])).values()];
    const degree=new Map<string,{p:Point;n:number}>();for(const e of uniq)for(const p of e){const v=degree.get(key(p))??{p,n:0};v.n++;degree.set(key(p),v);}
    const routed:Routed={net:{...net,sinks:[...net.sinks].sort()},edges:uniq,junctions:[...degree.values()].filter(v=>v.n>=3).map(v=>v.p)};
    if(label)routed.label=label;
    l.routes.push(routed);
    labelRoute(routed);
    if(routed.label&&!net.corridor){const b=routed.label;
      for(let yy=Math.max(0,Math.floor((b.y-6)/G));yy<=Math.min(rows-1,Math.ceil((b.y+b.h+6)/G));yy++)
        for(let xx=Math.max(0,Math.floor((b.x-6)/G));xx<=Math.min(cols-1,Math.ceil((b.x+b.w+6)/G));xx++)
          if(inside({x:xx*G,y:yy*G},b,6))blocked[yy*cols+xx]=1;
    }
  }
  // Corridor construction may leave an unused tail after branches join earlier.
  // Prune all nonterminal leaves so a crossing can never sit on a dangling end.
  for(const r of l.routes){
    const terminals=new Set([r.net.source,...r.net.sinks].map(s=>key(ends.get(s)!.at)));
    let change=true;
    while(change){const degree=new Map<string,number>();for(const e of r.edges)for(const p of e)degree.set(key(p),(degree.get(key(p))??0)+1);
      const leaves=new Set([...degree].filter(([k,n])=>n===1&&!terminals.has(k)).map(([k])=>k));change=leaves.size>0;
      if(change)r.edges=r.edges.filter(e=>e.every(p=>!leaves.has(key(p))));
    }
    const degree=new Map<string,{p:Point;n:number}>();for(const e of r.edges)for(const p of e){const v=degree.get(key(p))??{p,n:0};v.n++;degree.set(key(p),v);}
    r.junctions=[...degree.values()].filter(v=>v.n>=3).map(v=>v.p);
  }
  // A preferred corridor can be pruned when branches meet before reaching it.
  // Reattach its label to surviving geometry; never leave a name in empty space.
  for(const r of l.routes)if(r.net.corridor&&r.label){
    const b=r.label;
    const attached=r.edges.some(([a,c])=>a.y===c.y&&Math.abs(a.y-(b.y+30))<.1&&Math.max(a.x,c.x)>b.x&&Math.min(a.x,c.x)<b.x+b.w);
    if(!attached){
      const index=labelObstacles.indexOf(b);if(index>=0)labelObstacles.splice(index,1);
      delete r.label;labelRoute(r);
    }
  }
  function labelRoute(r:Routed){
    if(r.label||!r.net.label)return;
    r.label=placeWireLabel(l,r,labelObstacles,[...ends.values()].flatMap(e=>e.stub));
    if(!r.label)throw new Error(`No readable label space for ${r.net.id} (${JSON.stringify(r.net.label)}); shorten label and put details in description, or change port order/placement`);
    labelObstacles.push(r.label);
  }
}
