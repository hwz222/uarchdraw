/** Validate runtime input before layout, including callers supplying JSON. */
import type { Design } from './model.js';
type ObjectValue=Record<string,unknown>;
const object=(v:unknown):v is ObjectValue=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=(path:string,message:string):never=>{throw new Error(`${path}: ${message}`);};
const keys=(v:ObjectValue,allowed:string[],path:string)=>{
  for(const key of Object.keys(v))if(!allowed.includes(key))fail(path,`Unknown option ${key}`);
};
const string=(v:unknown,path:string)=>{if(typeof v!=='string')fail(path,'Expected a string');};
const strings=(v:unknown,path:string)=>{
  if(!Array.isArray(v))fail(path,'Expected an array of strings');
  (v as unknown[]).forEach((x,j)=>string(x,`${path}[${j}]`));
};
const integer=(v:unknown,path:string,min:number)=>{
  if(!Number.isSafeInteger(v)||Number(v)<min)fail(path,`Expected a safe integer >= ${min}`);
};
const optional=(v:ObjectValue,key:string,path:string,check:(x:unknown,p:string)=>void)=>{
  if(v[key]!==undefined)check(v[key],`${path}.${key}`);
};
const enumValue=(values:string[])=>(v:unknown,path:string)=>{
  if(!values.includes(v as string))fail(path,`Expected ${values.join(' | ')}`);
};
const boolean=(v:unknown,path:string)=>{if(typeof v!=='boolean')fail(path,'Expected a boolean');};
const signal=(v:unknown,path:string)=>{
  if(!object(v))fail(path,'Invalid width: expected a signal type');
  const s=v as ObjectValue;
  if('bits' in s){keys(s,['bits'],path);integer(s.bits,`${path}.bits (Invalid width)`,1);}
  else {
    keys(s,['fields'],path);
    if(!object(s.fields)||!Object.keys(s.fields).length)fail(path,'Invalid width: expected nonempty bundle fields');
    let total=0;
    for(const [name,width] of Object.entries(s.fields as ObjectValue)){
      if(!/^[A-Za-z_][\w-]*$/.test(name))fail(path,`Invalid bundle field ${name}`);
      integer(width,`${path}.${name} (Invalid width)`,1);total+=Number(width);
    }
    integer(total,`${path}.total (Invalid width)`,1);
  }
};

export function assertOptions(v:ObjectValue,kind:'node'|'pin'|'net'|'layout',path:string=kind):void {
  const allowed={
    node:['label','column','row','span','notes','operation','align','placement','role'],
    pin:['label','offset','row','optional','align'],
    net:['label','description','style','corridor'],
    layout:['gap','rowSpacing','adaptive'],
  };
  keys(v,allowed[kind],path);
  for(const key of ['label','description','operation'])optional(v,key,path,string);
  if(kind==='node'){
    optional(v,'notes',path,strings);
    for(const key of ['column','row'])optional(v,key,path,(x,p)=>integer(x,p,0));
    optional(v,'span',path,(x,p)=>integer(x,p,1));
    optional(v,'placement',path,enumValue(['auto','fixed']));
    optional(v,'role',path,enumValue(['data','control']));
    if(v.align!==undefined){
      if(!object(v.align))fail(`${path}.align`,'Expected an object with pin and with');
      const a=v.align as ObjectValue;keys(a,['pin','with'],`${path}.align`);
      string(a.pin,`${path}.align.pin`);string(a.with,`${path}.align.with`);
    }
  }else if(kind==='pin'){
    optional(v,'row',path,(x,p)=>integer(x,p,0));
    optional(v,'optional',path,boolean);optional(v,'align',path,string);
    optional(v,'offset',path,(x,p)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)fail(p,'Expected a number from 0 to 1');});
  }else if(kind==='net'){
    optional(v,'style',path,enumValue(['data','control','forward','writeback']));
    optional(v,'corridor',path,enumValue(['top','bottom']));
  }else{
    optional(v,'gap',path,(x,p)=>integer(x,p,60));
    optional(v,'rowSpacing',path,(x,p)=>integer(x,p,120));
    optional(v,'adaptive',path,boolean);
  }
}

export function assertDesignShape(value:unknown):asserts value is Design {
  if(!object(value))fail('design','Expected an object');
  const d=value as ObjectValue;
  keys(d,['version','title','subtitle','stages','instances','nets','notes','layout','groups'],'design');
  string(d.title,'design.title');string(d.subtitle,'design.subtitle');
  strings(d.stages,'design.stages');strings(d.notes,'design.notes');
  if(d.groups!==undefined){
    if(!Array.isArray(d.groups))fail('groups','Expected an array');
    for(const item of d.groups as unknown[]){
      if(!object(item))fail('group','Expected an object');const g=item as ObjectValue;
      keys(g,['id','label','members','parent'],'group');string(g.id,'group.id');string(g.label,'group.label');strings(g.members,'group.members');optional(g,'parent','group',string);
    }
  }
  if(d.layout!==undefined){if(!object(d.layout))fail('design.layout','Expected an object');assertOptions(d.layout as ObjectValue,'layout','design.layout');}
  if(!Array.isArray(d.instances)||!Array.isArray(d.nets))fail('design','Expected instances and nets arrays');
  for(const [j,item] of (d.instances as unknown[]).entries()){
    const path=`instances[${j}]`;
    if(!object(item))fail(path,'Expected an object');const i=item as ObjectValue;
    keys(i,['id','kind','stage','pins',...['label','column','row','span','notes','operation','align','placement','role']],path);
    for(const key of ['id','kind','stage','label'])string(i[key],`${path}.${key}`);
    const {id,kind,stage,pins,...opts}=i;assertOptions(opts,'node',String(id));
    if(!Array.isArray(pins))fail(path,'Expected pins array');
    for(const item of pins as unknown[]){
      if(!object(item))fail(`${path}.pins`,'Expected an object');const p=item as ObjectValue;
      keys(p,['id','direction','type','side','label','offset','row','optional','align'],`${id}.${p.id}`);
      for(const key of ['id','direction','side'])string(p[key],`${id}.${p.id}.${key}`);
      const {id:pid,direction,type,side,...opts}=p;assertOptions(opts,'pin',`${id}.${pid}`);signal(type,`${id}.${pid}`);
    }
  }
  for(const item of d.nets as unknown[]){
    if(!object(item))fail('nets','Expected an object');const n=item as ObjectValue;
    keys(n,['id','source','sinks','label','description','style','corridor'],'net');
    string(n.id,'net.id');string(n.source,`${n.id}.source`);strings(n.sinks,`${n.id}.sinks`);
    const {id,source,sinks,...opts}=n;assertOptions(opts,'net',String(id));
  }
}
