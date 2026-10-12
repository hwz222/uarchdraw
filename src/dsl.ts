import type { Design, Instance, Pin, Signal, Net } from './model.js';
import { validate } from './model.js';
import { assertOptions } from './schema.js';
import { automaticPlacement } from './automatic.js';
import { parseAuthoring } from './authoring.js';
const names=(s:string)=>s.split(/\s+/).filter(Boolean);
const parseOptions=(s:string,kind:'node'|'pin'|'net'|'layout')=>{
  const v:Record<string,unknown>=s?JSON.parse(s):{};
  if(!v||Array.isArray(v)||typeof v!=='object')throw new Error('Options must be an object');
  assertOptions(v,kind);return v;
};
export async function parseUarch(text:string,file='<input>'):Promise<Design>{
  const first=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).find(s=>s&&!s.startsWith('#')&&!s.startsWith('//'));
  if(/^uarch\s+2(?:\s|$)/.test(first??''))return parseAuthoring(text,file);
  const d:Design={version:1,title:'UarchDraw diagram',subtitle:'',stages:[],instances:[],nets:[],notes:[]};
  const types=new Map<string,Signal>(),pending:{node:Instance;auto:boolean}[]=[];
  let header=false,stagesSeen=false;
  for(const [line,raw] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
    const s=raw.trim();if(!s||s.startsWith('#'))continue;
    try {
      if(!header){if(s!=='uarch 1')throw new Error('Expected "uarch 1" as the first declaration.');header=true;continue;}
      let m:RegExpMatchArray|null;
      if(m=s.match(/^(title|subtitle|note)\s+(".*")$/)){const v:unknown=JSON.parse(m[2]!);if(typeof v!=='string')throw new Error('Expected string');if(m[1]==='note')d.notes.push(v);else d[m[1] as 'title'|'subtitle']=v;}
      else if(m=s.match(/^stages\s+(.+)$/)){if(stagesSeen)throw new Error('Specify stages only once');stagesSeen=true;d.stages=names(m[1]!);}
      else if(m=s.match(/^layout\s+(\{.*\})$/))d.layout=parseOptions(m[1]!,'layout');
      else if(m=s.match(/^group\s+([\w-]+)\s+(\{.*\})$/)){
        const v=JSON.parse(m[2]!);if(!v||Array.isArray(v)||typeof v!=='object')throw new Error('Group options must be an object');
        for(const key of Object.keys(v))if(!['label','members','parent'].includes(key))throw new Error(`Unknown group option ${key}`);
        (d.groups??=[]).push({id:m[1]!,...v});
      }
      else if(m=s.match(/^type\s+([\w-]+)\s+(\{.*\})$/)){
        if(types.has(m[1]!))throw new Error(`Duplicate type ${m[1]}`);types.set(m[1]!,{fields:JSON.parse(m[2]!)});
      }
      else if(m=s.match(/^node\s+([\w-]+)\s+(block|register|pipeline|mux|alu|adder)\s+([\w-]+)(?:\s+(\{.*\}))?$/)){
        const v=parseOptions(m[4]??'','node');
        if((v.column===undefined)!==(v.row===undefined))throw new Error('Specify both column and row, or omit both for ELK ordering');
        const node={id:m[1]!,kind:m[2]!,stage:m[3]!,label:m[1]!,column:0,row:0,pins:[],...v} as Instance;
        if(v.column===undefined)node.placement='auto';d.instances.push(node);pending.push({node,auto:node.placement==='auto'});
      }
      else if(m=s.match(/^pin\s+([\w-]+)\.([\w-]+)\s+(in|out)\s+([\w-]+)\s+(left|right|top|bottom)(?:\s+(\{.*\}))?$/)){
        const node=d.instances.find(i=>i.id===m![1]);if(!node)throw new Error(`Declare node ${m[1]} before its pins`);
        const type=/^u[1-9]\d*$/.test(m[4]!)?{bits:Number(m[4]!.slice(1))}:types.get(m[4]!);if(!type)throw new Error(`Unknown signal type ${m[4]}`);
        const opts=parseOptions(m[6]??'','pin');node.pins.push({id:m[2]!,direction:m[3]!,type,side:m[5]!,...opts} as Pin);
      }
      else if(m=s.match(/^net\s+([\w-]+)\s+([\w-]+\.[\w-]+)\s+->\s+([\w.,\s-]+?)(?:\s+(\{.*\}))?$/)){
        const opts=parseOptions(m[4]??'','net');d.nets.push({id:m[1]!,source:m[2]!,sinks:m[3]!.split(',').map(s=>s.trim()),...opts} as Net);
      } else throw new Error('Unknown declaration');
    } catch(e){throw new Error(`${file}:${line+1}: ${e instanceof Error?e.message:e}`);}
  }
  if(!header)throw new Error(`${file}:1: Empty UarchDraw source`);
  validate(d);
  if(pending.some(p=>p.auto))await automaticPlacement(d);
  validate(d);return d;
}
export function formatUarch(d:Design):string {
  const lines=['uarch 1','# Explicit electrical pins; column/row are alignment constraints, not pixel coordinates.',`title ${JSON.stringify(d.title)}`,`subtitle ${JSON.stringify(d.subtitle)}`,`stages ${d.stages.join(' ')}`];
  if(d.layout)lines.push(`layout ${JSON.stringify(d.layout)}`);
  const types=new Map<string,string>();
  for(const i of d.instances)for(const p of i.pins)if('fields'in p.type){const key=JSON.stringify(p.type.fields);if(!types.has(key))types.set(key,'bundle'+(types.size+1));}
  for(const [json,name] of types)lines.push(`type ${name} ${json}`);
  for(const i of d.instances){
    const {id,kind,stage,pins,...v}=i;lines.push('',`node ${id} ${kind} ${stage} ${JSON.stringify(v)}`);
    for(const p of pins){const{id:pid,direction,type,side,...opts}=p;lines.push(`pin ${id}.${pid} ${direction} ${'bits'in type?'u'+type.bits:types.get(JSON.stringify(type.fields))} ${side} ${JSON.stringify(opts)}`);}
  }
  lines.push('');for(const n of d.nets){const{id,source,sinks,...opts}=n;lines.push(`net ${id} ${source} -> ${sinks.join(', ')} ${JSON.stringify(opts)}`);}
  for(const g of d.groups??[]){const{id,...opts}=g;lines.push(`group ${id} ${JSON.stringify(opts)}`);}
  for(const n of d.notes)lines.push(`note ${JSON.stringify(n)}`);return lines.join('\n')+'\n';
}
