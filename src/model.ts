/** Electrical identity is independent of names, display order and geometry. */
import { assertDesignShape } from './schema.js';
export type Signal = { bits: number } | { fields: Record<string, number> };
export type Side = 'left' | 'right' | 'top' | 'bottom';
export interface Pin {
  id: string; direction: 'in' | 'out'; type: Signal; side: Side;
  label?: string; offset?: number; row?: number; optional?: boolean;
  /** Keep a flat-side port at the same height as another named port. */
  align?: string;
}
export interface Instance {
  id: string; label: string; kind: 'block' | 'register' | 'pipeline' | 'mux' | 'alu' | 'adder';
  stage: string; column: number; row: number; span?: number; pins: Pin[];
  notes?: string[]; operation?: string;
  align?: { pin: string; with: string };
  placement?: 'auto' | 'fixed';
  role?: 'data' | 'control';
}
export interface Net {
  id: string; source: string; sinks: string[]; label?: string;
  description?: string;
  style?: 'data' | 'control' | 'forward' | 'writeback';
  corridor?: 'top' | 'bottom';
}
export interface Design {
  version: 1; title: string; subtitle: string; stages: string[];
  instances: Instance[]; nets: Net[]; notes: string[];
  layout?: { gap?: number; rowSpacing?: number; adaptive?: boolean };
  groups?: { id:string; label:string; members:string[]; parent?:string }[];
}
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface Placed extends Rect { instance: Instance; pins: Record<string, Point> }
export interface WireLabel extends Rect { text: string; vertical?: boolean; size: number }
export interface Routed { net: Net; edges: [Point, Point][]; junctions: Point[]; label?: WireLabel }
export interface Layout {
  width: number; height: number; nodes: Placed[]; routes: Routed[];
  stages: { name: string; x: number; w: number }[];
  bodyTop: number; bodyBottom: number;
  /** Bottom of the routing area; footer text starts below this boundary. */
  footerTop: number;
}
export const rowSpan = (i: Instance): number => i.span ?? (i.kind === 'pipeline' ? 6 : 1);
export const width = (s: Signal): number => 'bits' in s ? s.bits : Object.values(s.fields).reduce((a,b)=>a+b,0);
export const pinKey = (i: string, p: string): string => `${i}.${p}`;
export function pinMap(d: Design): Map<string, { instance: Instance; pin: Pin }> {
  return new Map(d.instances.flatMap(i=>i.pins.map(pin=>[pinKey(i.id,pin.id),{instance:i,pin}] as const)));
}
export function validate(d: Design): void {
  assertDesignShape(d);
  const errors: string[] = [];
  if (d.version !== 1) errors.push('Expected UarchDraw design version 1');
  if(!d.stages.length||!d.instances.length)errors.push('At least one stage and one instance are required');
  const unique = (values: string[], what: string) => {
    if(new Set(values).size !== values.length) errors.push(`Duplicate ${what}`);
    for(const v of values) if(!/^[\w-]+$/.test(v)) errors.push(`Invalid ${what}: ${v}`);
  };
  unique(d.instances.map(i=>i.id),'instance ID'); unique(d.nets.map(n=>n.id),'net ID');
  if(new Set(d.stages).size !== d.stages.length) errors.push('Duplicate stage');
  if(d.groups){
    unique(d.groups.map(g=>g.id),'group ID');
    const nodes=new Set(d.instances.map(i=>i.id)),groups=new Map(d.groups.map(g=>[g.id,g]));
    for(const g of d.groups){
      if(nodes.has(g.id))errors.push(`Group ID conflicts with instance ${g.id}`);
      if(!g.members.length||g.members.some(id=>!nodes.has(id)))errors.push(`Invalid members in group ${g.id}`);
      if(new Set(g.members).size!==g.members.length)errors.push(`Duplicate member in group ${g.id}`);
      if(g.parent&&!groups.has(g.parent))errors.push(`Unknown parent group ${g.parent}`);
      const visited=new Set([g.id]);let current=g;
      while(current.parent&&groups.has(current.parent)){
        if(visited.has(current.parent)){errors.push(`Cyclic group ${g.id}`);break;}
        visited.add(current.parent);current=groups.get(current.parent)!;
      }
      if(g.parent&&groups.has(g.parent)&&g.members.some(id=>!groups.get(g.parent!)!.members.includes(id)))errors.push(`Group ${g.id} leaves parent ${g.parent}`);
    }
    for(const a of d.groups)for(const b of d.groups)if(a.id<b.id&&a.parent===b.parent&&a.members.some(id=>b.members.includes(id)))errors.push(`Overlapping sibling groups ${a.id} / ${b.id}`);
  }
  for(const i of d.instances) {
    unique(i.pins.map(p=>p.id),`pin ID in ${i.id}`);
    if(!['block','register','pipeline','mux','alu','adder'].includes(i.kind))errors.push(`Unknown symbol ${i.kind}`);
    if(typeof i.label!=='string'||i.notes?.some(s=>typeof s!=='string'))errors.push(`Invalid text in ${i.id}`);
    if(i.span!==undefined&&(!Number.isInteger(i.span)||i.span<1))errors.push(`Invalid span ${i.id}`);
    if(i.kind==='alu'&&i.pins.filter(p=>p.side==='left').length!==2)errors.push(`${i.id}: ALU symbol needs two left operand pins`);
    if(i.kind==='adder'&&i.pins.filter(p=>p.side==='left').length>2)errors.push(`${i.id}: adder symbol supports at most two left operand pins`);
    if(!d.stages.includes(i.stage)) errors.push(`Unknown stage ${i.stage}`);
    if(!Number.isInteger(i.row)||i.row<0||!Number.isInteger(i.column)||i.column<0) errors.push(`Invalid grid placement ${i.id}`);
    for(const p of i.pins) {
      if(!['in','out'].includes(p.direction)||!['left','right','top','bottom'].includes(p.side))errors.push(`Invalid pin direction/side ${i.id}.${p.id}`);
      const ws = 'bits' in p.type ? [p.type.bits] : Object.values(p.type.fields);
      if(!ws.length||ws.some(w=>!Number.isInteger(w)||w<=0)) errors.push(`Invalid width ${i.id}.${p.id}`);
      if(p.offset!==undefined&&(!Number.isFinite(p.offset)||p.offset<0||p.offset>1)) errors.push(`Invalid port offset ${i.id}.${p.id}`);
      if(p.row!==undefined&&(!Number.isInteger(p.row)||p.row<i.row||p.row>=i.row+rowSpan(i)))errors.push(`Pin row outside ${i.id}.${p.id}`);
    }
  }
  const pins = pinMap(d), driven = new Map<string,string>(), sources = new Set<string>();
  for(const i of d.instances){
    if(i.align&&(!pins.has(i.align.with)||!i.pins.some(p=>p.id===i.align!.pin)))errors.push(`Invalid instance alignment ${i.id}`);
    for(const p of i.pins)if(p.align){
      if(!pins.has(p.align))errors.push(`Unknown alignment port ${p.align}`);
      if(!['block','register','pipeline'].includes(i.kind)||!['left','right'].includes(p.side))errors.push(`Named pin alignment needs a flat vertical side: ${i.id}.${p.id}`);
    }
  }
  const signature = (s: Signal) => 'bits' in s ? `bits:${s.bits}` : JSON.stringify(Object.entries(s.fields).sort());
  for(const n of d.nets) {
    if(n.style!==undefined&&!['data','control','forward','writeback'].includes(n.style))errors.push(`${n.id}: unknown net style`);
    if(n.corridor!==undefined&&!['top','bottom'].includes(n.corridor))errors.push(`${n.id}: unknown corridor`);
    const src = pins.get(n.source);
    if(!src||src.pin.direction!=='out') { errors.push(`${n.id}: invalid source ${n.source}`); continue; }
    if(sources.has(n.source)) errors.push(`${n.source}: split driver identity; combine sinks in one net`);
    sources.add(n.source);
    if(!n.sinks.length) errors.push(`${n.id}: no sinks`);
    for(const s of n.sinks) {
      const dst=pins.get(s);
      if(!dst||dst.pin.direction!=='in') { errors.push(`${n.id}: invalid sink ${s}`); continue; }
      if(driven.has(s)) errors.push(`${s}: multiple drivers (${driven.get(s)}, ${n.id})`);
      driven.set(s,n.id);
      if(signature(src.pin.type)!==signature(dst.pin.type)) errors.push(`${n.id}: incompatible types ${n.source} -> ${s}`);
    }
  }
  for(const [k,{pin}] of pins) if(pin.direction==='in'&&!pin.optional&&!driven.has(k)) errors.push(`Undriven input ${k}`);
  if(errors.length) throw new Error(errors.join('\n'));
}
