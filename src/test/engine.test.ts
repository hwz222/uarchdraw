import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rv32i } from './fixtures/rv32i.js';
import { validate,type Design,type Instance,type Pin } from '../model.js';
import { place } from '../layout.js';
import { route } from '../router.js';
import { svg } from '../svg.js';
import { audit } from '../audit.js';
import { parseUarch,formatUarch } from '../dsl.js';
import { signalCatalog,signalTable } from '../inspect.js';
const compile=(d:Design)=>{validate(d);const l=place(d);route(d,l);const drawing=svg(d,l),qa=audit(d,l,drawing);assert.deepEqual(qa.errors,[]);return {l,drawing,qa};};
test('golden RV32I electrical model, actual outlines, nets, junctions and glyphs',()=>{
  const {qa}=compile(rv32i());assert.equal(qa.metrics.nets,49);assert.equal(qa.metrics.sinks,81);assert.equal(qa.metrics.labeledNets,49);assert.ok(qa.metrics.crossings<100);
});
test('every net has a rendered name; deleting a label fails the independent audit',()=>{
  const d=rv32i(),{l,drawing}=compile(d);
  const removed=drawing.replace(/<text [^>]*data-label-for="operand-a"[^>]*>[^<]*<\/text>/,'');
  assert.ok(audit(d,l,removed).errors.some(e=>e.includes('operand-a: missing')));
  const catalog=signalCatalog(d,l);assert.equal(catalog.length,49);assert.ok(catalog.every(s=>s.description&&s.name));
  assert.deepEqual(catalog.find(s=>s.id==='store-lanes')!.fields,{data:32,mask:4});
  assert.match(signalTable(d,l),/FwdB_E\/32/);
});
test('named alignment preserves horizontal operand paths; rejects unknown and cyclic dependencies',()=>{
  const d=rv32i(),l=place(d),at=(id:string,p:string)=>l.nodes.find(n=>n.instance.id===id)!.pins[p]!;
  assert.equal(at('rf','a').y,at('idex','a_d').y);assert.equal(at('idex','a_q').y,at('fa','original').y);
  const bad=rv32i();bad.instances.find(i=>i.id==='rf')!.pins.find(p=>p.id==='a')!.align='absent.port';assert.throws(()=>validate(bad),/Unknown alignment/);
  const cycle=rv32i();cycle.instances.find(i=>i.id==='idex')!.pins.find(p=>p.id==='pc_d')!.align='idex.pc_q';cycle.instances.find(i=>i.id==='idex')!.pins.find(p=>p.id==='pc_q')!.align='idex.pc_d';assert.throws(()=>place(cycle),/Cyclic/);
});
test('ALU uses straight operand edges, one central input notch and a flat output edge',()=>{
  const d=rv32i(),l=place(d),n=l.nodes.find(n=>n.instance.kind==='alu')!,drawing=svg(d,l);
  assert.equal(n.pins.a!.x,n.x);assert.equal(n.pins.b!.x,n.x);assert.equal(n.pins.out!.x,n.x+n.w);
  assert.match(drawing,new RegExp(`L${n.x+n.w},${n.y+n.h/4} V${n.y+3*n.h/4}`));
  assert.match(drawing,new RegExp(`L${n.x+n.w/4},${n.y+n.h/2}`));
});
test('fresh, repeated and permuted declarations produce identical SVG',()=>{
  const d=rv32i(),frozen=JSON.stringify(d),a=compile(d).drawing,b=compile(d).drawing;assert.equal(JSON.stringify(d),frozen);assert.equal(a,b);
  d.instances.reverse();d.nets.reverse();d.nets.forEach(n=>n.sinks.reverse());assert.equal(compile(d).drawing,a);
});
test('UarchDraw source round trip retains every pin and bundle member',async()=>{
  const d=rv32i();assert.deepEqual(await parseUarch(formatUarch(d)),d);
});
test('longer display names resize symbols instead of silently clipping',()=>{
  const d=rv32i();d.instances.find(i=>i.id==='rf')!.label='Integer register file';const {l}=compile(d);assert.ok(l.nodes.find(n=>n.instance.id==='rf')!.w>204);
});
test('symbol and routing rules do not depend on the RV32I instance names',()=>{
  const d=rv32i(),rename=(s:string)=>'unit_'+s;
  d.instances.forEach(i=>{i.id=rename(i.id);if(i.align)i.align.with=rename(i.align.with);i.pins.forEach(p=>{if(p.align)p.align=rename(p.align);});});
  d.nets.forEach(n=>{n.source=rename(n.source);n.sinks=n.sinks.map(rename);});
  compile(d);
});
test('reject width mismatch, duplicate sink drivers and split source identities',()=>{
  const a=rv32i();a.instances.find(i=>i.id==='alu')!.pins.find(p=>p.id==='a')!.type={bits:1};assert.throws(()=>validate(a),/incompatible types/);
  const b=rv32i();b.nets.push({id:'bad',source:'zero.out',sinks:['alu.a']});assert.throws(()=>validate(b),/multiple drivers/);assert.throws(()=>validate(b),/split driver identity/);
});
test('unknown and invalid widths never collapse to 1 bit; bundle identity is structural',async()=>{
  await assert.rejects(parseUarch('uarch 1\nstages S\nnode a block S\npin a.o out nonsense right','width.uarch'),/width.uarch:4: Unknown signal type/);
  const d=rv32i();d.instances[0]!.pins[0]!.type={bits:0};assert.throws(()=>validate(d),/Invalid width/);
  const e=rv32i();e.instances.find(i=>i.id==='wb')!.pins.find(p=>p.id==='ctl')!.type={fields:{wrong:22}};assert.throws(()=>validate(e),/incompatible types/);
});
function small():Design{
  const pin=(id:string,direction:'in'|'out',side:'left'|'right'):Pin=>({id,direction,side,type:{bits:32}});
  const n=(id:string,column:number,pins:Pin[]):Instance=>({id,label:id,kind:'block',stage:'S',column,row:0,pins});
  return {version:1,title:'Mixed fanout regression',subtitle:'',stages:['S'],notes:[],instances:[n('a',0,[pin('i','in','left'),pin('o','out','right')]),n('b',1,[pin('i','in','left'),pin('o','out','right')]),n('c',2,[pin('i','in','left')]),n('isolated',3,[])],nets:[{id:'ab',source:'a.o',sinks:['b.i']},{id:'mixed',source:'b.o',sinks:['a.i','c.i'],corridor:'bottom'}]};
}
test('cycle plus isolated component / mixed forward-backward fanout has one connected driver',()=>{compile(small());});
test('fanout does not multiply driver ports or driver height',()=>{
  const d=small();const before=place(d).nodes.find(n=>n.instance.id==='b')!.h;
  for(let j=0;j<8;j++){d.instances.push({id:'sink'+j,label:'Sink '+j,kind:'block',stage:'S',column:2,row:j+1,pins:[{id:'i',direction:'in',side:'left',type:{bits:32}}]});d.nets[1]!.sinks.push(`sink${j}.i`);}
  const {l}=compile(d);assert.equal(l.nodes.find(n=>n.instance.id==='b')!.h,before);
});
test('checker catches severed branches and fabricated junctions',()=>{
  const d=small(),l=place(d);route(d,l);const r=l.routes.find(r=>r.net.id==='ab')!;r.edges.splice(Math.floor(r.edges.length/2),1);assert.ok(audit(d,l,svg(d,l)).errors.some(e=>e.includes('disconnected')));
  r.junctions.push({x:24,y:24});assert.ok(audit(d,l,svg(d,l)).errors.some(e=>e.includes('junction')));
});
test('ELK orders an unconstrained local graph without altering stage order',async()=>{
  const d=await parseUarch('uarch 1\nstages S T\nnode a block S\npin a.o out u32 right\nnode b block S\npin b.i in u32 left\nnode c block T\nnet ab a.o -> b.i');
  assert.deepEqual(d.stages,['S','T']);assert.ok(d.instances[0]!.column<d.instances[1]!.column);compile(d);
});
