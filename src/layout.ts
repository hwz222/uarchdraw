import { rowSpan,type Design,type Instance,type Layout,type Placed,type Point,type Side } from './model.js';
import { ceil, snap, textWidth } from './font.js';

const GAP = 180;
export function measureSymbol(i: Instance,ROW=240): {w:number; h:number} {
  const lines = i.label.split('\n');
  if(i.kind==='pipeline'){
    if(i.placement==='auto'&&i.span===undefined&&!i.pins.some(p=>p.row!==undefined)){
      const ports=Math.max(...['left','right'].map(side=>i.pins.filter(p=>p.side===side).length));
      const labels=['left','right'].map(side=>Math.max(0,...i.pins.filter(p=>p.side===side).map(p=>textWidth(p.label??p.id,16)+12))).reduce((a,b)=>a+b,16);
      return {w:ceil(Math.max(144,labels,textWidth(i.label,23)+24)),h:ceil(Math.max(144,ports*48+72))};
    }
    return {w:ceil(Math.max(144,textWidth(i.label,23)+24,...i.pins.filter(p=>p.row!==undefined).map(p=>textWidth(p.label??p.id,23)+24))),h:rowSpan(i)*ROW};
  }
  if(i.kind==='mux') return {w:ceil(Math.max(84,...i.pins.filter(p=>p.side==='left').map(p=>textWidth(p.label??p.id,23)+48))/2)*2,h:ceil(Math.max(168,textWidth(i.label,23)+48,(i.pins.filter(p=>p.side==='left').length+1)*(i.placement==='auto'?48:36),i.span===undefined?0:i.span*ROW-120))};
  if(i.kind==='alu') return {w:144,h:192};
  if(i.kind==='adder') return {w:96,h:96};
  const sideHeight = Math.max(...['left','right'].map(s=>i.pins.filter(p=>p.side===s).length))*36+lines.length*26+24+(i.notes?.length??0)*22;
  const pinWidth=['left','right'].map(side=>Math.max(0,...i.pins.filter(p=>p.side===side).map(p=>textWidth(p.label??(i.placement==='auto'?p.id:''),16)+8))).reduce((a,b)=>a+b,16);
  const edgeWidth=i.placement==='auto'?Math.max(...['top','bottom'].map(side=>i.pins.filter(p=>p.side===side).length))*36+24:0;
  return {w:ceil(Math.max(120,pinWidth,edgeWidth,...lines.map(s=>textWidth(s,23)+24),...((i.notes??[]).map(s=>textWidth(s,16)+24)))),
    h:ceil(Math.max(sideHeight,lines.length*26+40+(i.notes?.length??0)*22,
      i.placement==='auto'&&i.span===undefined?120:(i.span??1)*ROW-120))};
}
/** Quantize shaped-symbol ports to points on the actual edge AND routing grid. */
function shapedPin(n:Placed,side:Side,ratio:number,j:number):Point|undefined{
  const {x,y,w,h,instance:i}=n;
  if(!['alu','adder','mux'].includes(i.kind))return;
  if(side==='left'){
    const at=i.kind==='alu'?(j===0?h/4:3*h/4):i.kind==='adder'?(j===0?24:72):snap(h*ratio);
    return {x,y:y+at};
  }
  const candidates:Point[]=[];
  if(side==='right'){
    for(let dy=0;dy<=h;dy+=12){
      if(i.kind==='mux'&&dy>=24&&dy<=h-24)candidates.push({x:x+w,y:y+dy});
      if(i.kind==='alu'&&dy>=h/4&&dy<=3*h/4)candidates.push({x:x+w,y:y+dy});
      if(i.kind==='adder'){
        const dx=60+36*(1-Math.abs(dy-h/2)/(h/2));
        if(Number.isInteger(dx/12))candidates.push({x:x+dx,y:y+dy});
      }
    }
  }else{
    for(let dx=0;dx<=w;dx+=12){
      const inset=i.kind==='mux'?24*dx/w:i.kind==='alu'?h/4*dx/w:Math.max(0,(dx-60)*48/36);
      if(Number.isInteger(inset/12))candidates.push({x:x+dx,y:y+(side==='top'?inset:h-inset)});
    }
  }
  const target=side==='right'?y+h*ratio:x+w*ratio;
  const coordinate=(p:Point)=>side==='right'?p.y:p.x,center=side==='right'?y+h/2:x+w/2;
  candidates.sort((a,b)=>Math.abs(coordinate(a)-target)-Math.abs(coordinate(b)-target)||Math.abs(coordinate(a)-center)-Math.abs(coordinate(b)-center));
  return candidates[0];
}
/** A constrained stage/column planner. Rows are alignment constraints, never stored coordinates. */
export function place(d: Design,options:{gap?:number;rowSpacing?:number}={}): Layout {
  const ROW=ceil(Math.max(options.rowSpacing??d.layout?.rowSpacing??240,...d.instances.filter(i=>i.kind!=='pipeline'&&!i.span&&i.placement!=='auto').map(i=>measureSymbol(i).h+48)));
  const gap=ceil(options.gap??d.layout?.gap??GAP);
  // Reserve only the header and the return lanes this design actually needs.
  const TOP=ceil(228+d.nets.filter(n=>n.corridor==='top').length*36);
  const nodes: Placed[]=[], stages: Layout['stages']=[];
  let x=72;
  for(const name of d.stages) {
    const items=d.instances.filter(i=>i.stage===name).sort((a,b)=>a.id.localeCompare(b.id));
    const start=x;
    for(const col of [...new Set(items.map(i=>i.column))].sort((a,b)=>a-b)) {
      const group=items.filter(i=>i.column===col), w=Math.max(...group.map(i=>measureSymbol(i,ROW).w));
      for(const i of group) {
        const s=measureSymbol(i,ROW), y=TOP+i.row*ROW;
        const n: Placed={instance:i,x:snap(x+(w-s.w)/2),y,w:s.w,h:s.h,pins:{}};
        for(const side of ['left','right','top','bottom'] as const) {
          const ps=i.pins.filter(p=>p.side===side);
          ps.forEach((p,j)=>{
            const ratio=p.offset??((j+1)/(ps.length+1));
            const shaped=i.kind==='mux'&&p.row!==undefined&&['left','right'].includes(side)?undefined:shapedPin(n,side,ratio,j);
            if(shaped){n.pins[p.id]=shaped;return;}
            if(side==='left'||side==='right') {
              const header=i.label.split('\n').length*26+12,footer=(i.notes?.length??0)*22+12;
              const py=p.row!==undefined?TOP+p.row*ROW+snap(ROW*(p.offset??(p.row===0?.45:.25))):
                i.kind==='block'||i.kind==='register'?y+snap(header+(s.h-header-footer)*ratio):y+snap(s.h*ratio);
              const px=side==='left'?n.x:n.x+s.w;
              n.pins[p.id]={x:px,y:py};
            } else {
              n.pins[p.id]={x:n.x+snap(s.w*ratio),y:side==='top'?y:y+s.h};
            }
          });
        }
        nodes.push(n);
      }
      x+=w+gap;
    }
    stages.push({name,x:start-24,w:x-start});
  }
  // Resolve named alignment dependencies from electrical ports, not instance IDs.
  const lookup=(ref:string)=>{const [id,p]=ref.split('.'),node=nodes.find(n=>n.instance.id===id);if(!node?.pins[p!])throw new Error(`Unknown alignment port ${ref}`);return {node,pin:p!};};
  const done=new Set<string>(),active=new Set<string>();
  function alignNode(n:Placed){
    const tag='node:'+n.instance.id;if(done.has(tag))return;if(active.has(tag))throw new Error(`Cyclic alignment at ${n.instance.id}`);active.add(tag);
    if(n.instance.align){const a=n.instance.align,target=alignPin(a.with),own=n.pins[a.pin];if(!own)throw new Error(`Unknown alignment pin ${n.instance.id}.${a.pin}`);
      const dy=target.y-own.y;n.y+=dy;Object.values(n.pins).forEach(p=>p.y+=dy);}
    active.delete(tag);done.add(tag);
  }
  function alignPin(ref:string):Point{
    const {node,pin}=lookup(ref),tag='pin:'+ref;alignNode(node);if(done.has(tag))return node.pins[pin]!;
    if(active.has(tag))throw new Error(`Cyclic port alignment ${ref}`);active.add(tag);
    const p=node.instance.pins.find(p=>p.id===pin)!;
    if(p.align){if(!['block','register','pipeline'].includes(node.instance.kind)||!['left','right'].includes(p.side))throw new Error(`Named pin alignment needs a flat vertical side: ${ref}`);node.pins[pin]!.y=alignPin(p.align).y;}
    active.delete(tag);done.add(tag);return node.pins[pin]!;
  }
  nodes.forEach(n=>n.instance.pins.forEach(p=>alignPin(`${n.instance.id}.${p.id}`)));
  // Inferred parallel-bus alignments may need a taller source rectangle. Grow
  // around actual anchors rather than rounding it to a large shared row span.
  for(const n of nodes)if(n.instance.placement==='auto'&&['block','register','pipeline'].includes(n.instance.kind)&&n.instance.span===undefined&&!n.instance.pins.some(p=>p.row!==undefined)){
    const flat=n.instance.pins.filter(p=>['left','right'].includes(p.side));
    n.h=ceil(Math.max(n.h,...flat.map(p=>n.pins[p.id]!.y-n.y+24+(n.instance.notes?.length??0)*22)));
    for(const p of n.instance.pins)if(p.side==='bottom')n.pins[p.id]!.y=n.y+n.h;
  }
  // Rows position symbols; an unused remainder of the final row is not content.
  // Full pipeline spans and any alignment-induced growth remain in these bounds.
  const bodyBottom=ceil(Math.max(TOP,...nodes.map(n=>n.y+n.h)));
  const footerTop=ceil(bodyBottom+72+d.nets.filter(n=>n.corridor==='bottom').length*48);
  const height=footerTop+ceil(d.notes.length?70+(d.notes.length-1)*27:24);
  const width=ceil(Math.max(x-24,96+textWidth(d.title,30),96+textWidth(d.subtitle,19),...d.notes.map(s=>96+textWidth(s,19))));
  return {width,height,nodes,routes:[],stages,bodyTop:TOP,bodyBottom,footerTop};
}
