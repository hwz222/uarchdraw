/** Derive overview/detail diagrams from one validated connectivity model. */
import { validate,pinMap,type Design,type Instance,type Pin } from './model.js';
import { automaticPlacement } from './automatic.js';
export interface ViewOptions { overview?:boolean; focus?:string }

export async function createView(design:Design,options:ViewOptions):Promise<Design>{
  validate(design);
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('View options must be an object');
  if(options.overview!==undefined&&typeof options.overview!=='boolean')throw new Error('overview must be a boolean');
  if(options.focus!==undefined&&typeof options.focus!=='string')throw new Error('focus must be a group name');
  for(const key of Object.keys(options))if(!['overview','focus'].includes(key))throw new Error(`Unknown view option ${key}`);
  if(options.overview&&options.focus)throw new Error('Choose overview or focus, not both');
  if(!options.overview&&!options.focus)return structuredClone(design);
  const groups=design.groups??[];
  if(!groups.length)throw new Error('This design has no groups; declare a group before selecting a view');
  const d=structuredClone(design),pins=pinMap(design);
  delete d.groups;
  const byId=new Map(design.instances.map(i=>[i.id,i]));
  if(options.focus){
    const group=groups.find(g=>g.id===options.focus||g.id===options.focus!.replaceAll('.','__'));
    if(!group)throw new Error(`Unknown focus group ${options.focus}`);
    const members=new Set(group.members),boundary=new Map<string,Instance>();
    d.title=`${design.title} — ${group.label}`;
    d.instances=d.instances.filter(i=>members.has(i.id));
    let prefix='external__';while(design.instances.some(i=>i.id.startsWith(prefix)))prefix='_'+prefix;
    const external=(ref:string,direction:Pin['direction'])=>{
      const original=pins.get(ref)!,key=direction+'_'+original.instance.id,id=prefix+key;
      let node=boundary.get(key);
      if(!node){node={id,label:original.instance.label+' (external)',kind:'block',stage:direction==='out'?'EXTERNAL_INPUTS':'EXTERNAL_OUTPUTS',column:0,row:0,pins:[],placement:'auto'};boundary.set(key,node);}
      if(!node.pins.some(p=>p.id===original.pin.id))node.pins.push({id:original.pin.id,direction,type:structuredClone(original.pin.type),side:direction==='out'?'right':'left',label:original.pin.label});
      return id+'.'+original.pin.id;
    };
    d.nets=d.nets.filter(n=>members.has(n.source.split('.')[0]!)||n.sinks.some(s=>members.has(s.split('.')[0]!))).map(n=>{
      const sourceInside=members.has(n.source.split('.')[0]!);
      return {...n,source:sourceInside?n.source:external(n.source,'out'),
        sinks:n.sinks.filter(s=>sourceInside||members.has(s.split('.')[0]!)).map(s=>members.has(s.split('.')[0]!)?s:external(s,'in'))};
    });
    d.instances.push(...boundary.values());
    const middle=design.stages.filter(stage=>d.instances.some(i=>members.has(i.id)&&i.stage===stage));
    if(middle.some(s=>s==='EXTERNAL_INPUTS'||s==='EXTERNAL_OUTPUTS'))throw new Error('Focus views reserve EXTERNAL_INPUTS and EXTERNAL_OUTPUTS stage names');
    d.stages=[...(d.instances.some(i=>i.stage==='EXTERNAL_INPUTS')?['EXTERNAL_INPUTS']:[]),...middle,
      ...(d.instances.some(i=>i.stage==='EXTERNAL_OUTPUTS')?['EXTERNAL_OUTPUTS']:[])];
    d.notes.push('External blocks show the real drivers and receivers at this group boundary.');
  }else{
    const top=groups.filter(g=>!g.parent),owners=new Map(top.flatMap(g=>g.members.map(id=>[id,g] as const)));
    d.title=design.title+' — overview';
    d.instances=d.instances.filter(i=>!owners.has(i.id));
    const collapsed=new Map(top.map(g=>[g.id,{id:g.id,label:g.label,kind:'block' as const,stage:design.stages.find(stage=>g.members.some(id=>byId.get(id)!.stage===stage))!,column:0,row:0,pins:[] as Pin[],placement:'auto' as const}]));
    const port=(group:string,id:string,direction:Pin['direction'],ref:string,label:string)=>{
      const node=collapsed.get(group)!;
      if(!node.pins.some(p=>p.id===id))node.pins.push({id,direction,type:structuredClone(pins.get(ref)!.pin.type),side:direction==='out'?'right':'left',label});
      return group+'.'+id;
    };
    d.nets=d.nets.flatMap(n=>{
      const srcOwner=owners.get(n.source.split('.')[0]!);
      const sinks=n.sinks.filter(s=>!srcOwner||owners.get(s.split('.')[0]!)?.id!==srcOwner.id);
      if(!sinks.length)return [];
      const source=srcOwner?port(srcOwner.id,'out__'+n.id,'out',n.source,pins.get(n.source)!.pin.id):n.source;
      const mapped=sinks.map(s=>{const owner=owners.get(s.split('.')[0]!);return owner?port(owner.id,'in__'+n.id,'in',s,pins.get(s)!.pin.id):s;});
      return [{...n,source,sinks:[...new Set(mapped)]}];
    });
    d.instances.push(...collapsed.values());
    d.stages=design.stages.filter(stage=>d.instances.some(i=>i.stage===stage));
    d.notes.push('Top-level groups are collapsed; external nets retain their original identity and type.');
  }
  // Views have different extents: discard geometry constraints from hidden nodes.
  for(const node of d.instances){
    node.placement='auto';node.column=0;node.row=0;delete node.align;
    if(node.kind!=='pipeline')delete node.span;
    for(const pin of node.pins){delete pin.align;if(node.kind!=='pipeline')delete pin.row;}
  }
  validate(d);await automaticPlacement(d);validate(d);return d;
}
