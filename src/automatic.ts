/** Measured, deterministic placement with separate data and control lanes. */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ELK as ElkAPI } from 'elkjs/lib/elk-api.js';
import { pinMap,width,type Design,type Instance } from './model.js';
import { measureSymbol } from './layout.js';
const ElkConstructor=ELK as unknown as {new():ElkAPI};
const rectangle=(i:Instance)=>['block','register','pipeline'].includes(i.kind);

export async function automaticPlacement(d:Design):Promise<void>{
  const pins=pinMap(d),incident=(i:Instance)=>d.nets.filter(n=>n.source.startsWith(i.id+'.')||n.sinks.some(s=>s.startsWith(i.id+'.')));
  const control=(i:Instance)=>i.role==='control'||(i.role!=='data'&&incident(i).length>0&&incident(i).every(n=>n.style==='control'));
  const stageIndex=(i:Instance)=>d.stages.indexOf(i.stage);
  const data=d.nets.filter(n=>n.style!=='control').sort((a,b)=>width(pins.get(b.source)!.pin.type)-width(pins.get(a.source)!.pin.type)||a.id.localeCompare(b.id));
  // Align parallel buses against shaped operand ports; reserve enough source height.
  for(const n of data){
    const src=pins.get(n.source)!;
    if(src.instance.placement!=='auto'||!rectangle(src.instance)||src.pin.side!=='right'||src.pin.align)continue;
    const target=n.sinks.map(s=>({ref:s,...pins.get(s)!})).find(p=>['mux','alu','adder'].includes(p.instance.kind)&&p.pin.side==='left'&&stageIndex(p.instance)>=stageIndex(src.instance));
    if(target)src.pin.align=target.ref;
  }
  for(const lane of [false,true]){
    for(const stage of d.stages){
    const group=d.instances.filter(i=>i.stage===stage);
    const occupied=group.filter(i=>i.placement!=='auto'||(lane&&!control(i))).map(i=>({column:i.column,row:i.row,rows:Math.ceil((measureSymbol(i).h+48)/240)}));
      const nodes=group.filter(i=>i.placement==='auto'&&control(i)===lane);
      if(!nodes.length)continue;
      const ids=new Set(nodes.map(i=>i.id));
      const elk=new ElkConstructor();
      const result=await elk.layout({id:stage,layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES'},
        children:nodes.map(i=>({id:i.id,width:measureSymbol(i).w,height:measureSymbol(i).h})).sort((a,b)=>a.id.localeCompare(b.id)),
        edges:d.nets.filter(n=>(n.style==='control')===lane).flatMap(n=>n.sinks.map((s,j)=>({id:n.id+'-'+j,sources:[n.source.split('.')[0]!],targets:[s.split('.')[0]!]})))
          .filter(e=>ids.has(e.sources[0]!)&&ids.has(e.targets[0]!)).sort((a,b)=>a.id.localeCompare(b.id))});
      const columns=[...new Set(result.children!.map(i=>i.x!))].sort((a,b)=>a-b);
      for(const x of columns){
        const column=columns.indexOf(x);
        let row=lane?Math.max(0,...d.instances.filter(i=>!control(i)).map(i=>i.row+Math.ceil((measureSymbol(i).h+48)/240))):0;
        for(const child of result.children!.filter(i=>i.x===x).sort((a,b)=>a.y!-b.y!||a.id.localeCompare(b.id))){
          const node=nodes.find(i=>i.id===child.id)!,rows=Math.ceil((measureSymbol(node).h+48)/240);
          const anchors=d.nets.filter(n=>(n.style==='control')===lane&&n.sinks.some(s=>s.startsWith(node.id+'.')))
            .map(n=>group.find(i=>i.id===n.source.split('.')[0]&&i.placement!=='auto')).filter((i):i is Instance=>!!i);
          const targetColumn=Math.max(column,...anchors.map(i=>i.column+1));
          while(occupied.some(o=>o.column===targetColumn&&row<o.row+o.rows&&row+rows>o.row))row++;
          node.column=targetColumn;node.row=row;occupied.push({column:targetColumn,row,rows});row+=rows;
        }
      }
    }
  }
  // Align a receiver's primary data operand by moving its entire rectangle.
  // Keep the dependency direction forward, preventing inferred alignment cycles.
  for(const n of data){
    const src=pins.get(n.source)!;
    for(const ref of n.sinks){
      const dst=pins.get(ref)!;
      if(dst.instance.placement!=='auto'||!rectangle(dst.instance)||dst.instance.align||dst.pin.align||dst.pin.side!=='left'||src.pin.side!=='right'||dst.instance.row!==src.instance.row)continue;
      if(stageIndex(dst.instance)>stageIndex(src.instance)||(dst.instance.stage===src.instance.stage&&dst.instance.column>src.instance.column)){
        dst.instance.align={pin:dst.pin.id,with:n.source};
      }
    }
  }
}
