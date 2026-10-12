import type { Layout,Point,Rect,Routed,WireLabel } from './model.js';
import { textWidth } from './font.js';
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.w+6&&a.x+a.w+6>b.x&&a.y<b.y+b.h+6&&a.y+a.h+6>b.y;
function spans(edges:[Point,Point][],horizontal:boolean){
  const map=new Map<number,number[]>();
  for(const [a,b] of edges)if((a.y===b.y)===horizontal){const fixed=horizontal?a.y:a.x,at=horizontal?Math.min(a.x,b.x):Math.min(a.y,b.y);const list=map.get(fixed)??[];list.push(at);map.set(fixed,list);}
  const result:{fixed:number;start:number;length:number}[]=[];
  for(const [fixed,values] of map){values.sort((a,b)=>a-b);let start=values[0]!,end=start;
    for(const v of values.slice(1)){if(v>end+12){result.push({fixed,start,length:end+12-start});start=v;}end=v;}result.push({fixed,start,length:end+12-start});}
  return result.sort((a,b)=>b.length-a.length||a.fixed-b.fixed);
}
function positions(start:number,length:number,need:number):number[]{
  if(length<need+12)return [];
  const min=start+7,max=start+length-need-7,mid=(min+max)/2;
  const out=[min,mid,max];for(let x=min+36;x<max;x+=36)out.push(x);return out;
}
/** Place readable horizontal text beside vertical wires as well as above horizontal
 * wires. Rotation is a last resort, never a reason to omit a net's identity. */
export function placeWireLabel(l:Layout,r:Routed,reserved:Rect[],pinStubs:[Point,Point][]):WireLabel|undefined{
  const size=21,text=r.net.label!,w=textWidth(text,size)+4,h=25;
  const candidates:WireLabel[]=[];
  for(const s of spans(r.edges,true))for(const x of positions(s.start,s.length,w))for(const y of [s.fixed-33,s.fixed+9])candidates.push({x,y,w,h,text,size});
  for(const s of spans(r.edges,false))for(const y of positions(s.start,s.length,h))for(const x of [s.fixed+8,s.fixed-w-8])candidates.push({x,y,w,h,text,size});
  for(const s of spans(r.edges,false))for(const y of positions(s.start,s.length,w))for(const x of [s.fixed-h-8,s.fixed+8])candidates.push({x,y,w:h,h:w,text,size,vertical:true});
  const edges=[...pinStubs,...l.routes.flatMap(r=>r.edges)];
  for(const b of candidates){
    if(b.x<24||b.x+b.w>l.width-24||b.y<96||b.y+b.h>l.footerTop)continue;
    if(l.nodes.some(n=>overlaps(b,n))||reserved.some(n=>overlaps(b,n)))continue;
    const touches=edges.some(([a,c])=>a.y===c.y?
      a.y>=b.y-3&&a.y<=b.y+b.h+3&&Math.max(a.x,c.x)>=b.x-3&&Math.min(a.x,c.x)<=b.x+b.w+3:
      a.x>=b.x-3&&a.x<=b.x+b.w+3&&Math.max(a.y,c.y)>=b.y-3&&Math.min(a.y,c.y)<=b.y+b.h+3);
    if(!touches)return b;
  }
}
