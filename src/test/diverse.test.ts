import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUarch } from '../dsl.js';
import { compile } from '../compile.js';
import { audit } from '../audit.js';
import { place } from '../layout.js';
import { route } from '../router.js';
import { glyphBounds } from '../font.js';

const source=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const run=async(s:string)=>compile(await parseUarch(s));
const fifo=()=>parseUarch(source('examples/08-fifo-handshake.uarch'));

test('ordinary two-input adder and near-title aligned register pins both render',async()=>{
  const counter=await run(source('src/test/fixtures/07-feedback-counter.uarch'));
  const add=counter.layout.nodes.find(n=>n.instance.id==='add')!;
  assert.notDeepEqual(add.pins.a,add.pins.b);
  const rf=await run(source('examples/09-register-file.uarch'));
  assert.equal(rf.audit.ok,true);
});

test('default pipeline rows and canvas use the same six-row extent',async()=>{
  const result=await run(source('src/test/fixtures/10-sample-selector.uarch'));
  const n=result.layout.nodes.find(n=>n.instance.id==='capture')!;
  assert.equal(n.instance.span,undefined);
  assert.ok(n.y+n.h<=result.layout.bodyBottom);
  assert.ok(n.y+n.h<result.layout.height);
  const bare=await run('uarch 1\ntitle "Capture"\nstages S\nnode r pipeline S');
  assert.ok(bare.layout.nodes[0]!.y+bare.layout.nodes[0]!.h<bare.layout.height);
});

test('independent SVG audit catches a clipped symbol even when its title is visible',async()=>{
  const d=await parseUarch('uarch 1\ntitle "Capture"\nstages S\nnode r pipeline S'),r=compile(d);
  const node=r.layout.nodes[0]!,cutoff=node.y+node.h-12;
  const clipped={...r.layout,height:cutoff};
  const drawing=r.drawing.replace(`height="${r.layout.height}"`,`height="${cutoff}"`).replace(`viewBox="0 0 ${r.layout.width} ${r.layout.height}"`,`viewBox="0 0 ${r.layout.width} ${cutoff}"`);
  assert.ok(audit(d,clipped,drawing).errors.includes('Symbol clipped: r'));
  assert.ok(audit(d,r.layout,drawing).errors.includes('Rendered SVG canvas differs from layout'));
});

test('a same-column feedback corridor has a legal routing seed',async()=>{
  const r=await run('uarch 1\ntitle "Hold"\nstages S\nnode r register S {"label":"Hold"}\npin r.d in u1 top\npin r.q out u1 bottom\nnet hold r.q -> r.d {"corridor":"bottom"}');
  assert.equal(r.audit.metrics.nets,1);assert.equal(r.audit.metrics.sinks,1);
});

test('long document text and six footer notes expand the canvas',async()=>{
  const prefix='uarch 1\ntitle "A long descriptive heading for a small standalone register"\nstages S\nnode r register S\n';
  const r=await run(prefix+Array.from({length:6},(_,j)=>`note "Note number ${j+1}"`).join('\n'));
  assert.ok(r.layout.width>600);assert.equal(r.audit.ok,true);
});

test('off-center MUX and ALU control pins meet the rendered sloped edges',async()=>{
  for(const kind of ['mux','alu'] as const)for(const side of ['top','bottom'] as const)for(const offset of [0,0.25,0.5,0.75,1]){
    const operands=kind==='alu'?'\npin m.a in u32 left {"optional":true}\npin m.b in u32 left {"optional":true}':'';
    const r=await run(`uarch 1\ntitle "Port placement"\nstages S\nnode m ${kind} S${operands}\npin m.sel in u1 ${side} {"offset":${offset},"optional":true}`);
    const p=r.layout.nodes[0]!.pins.sel!;assert.equal(p.x%12,0);assert.equal(p.y%12,0);
  }
});

test('deleting or rerouting only a visible SVG wire fails the audit',async()=>{
  const d=await fifo(),r=compile(d);
  const missing=r.drawing.replace(/(<g id="net-data"[\s\S]*?<title>[\s\S]*?<\/title>)[\s\S]*?<\/g>/,'$1</g>');
  assert.ok(audit(d,r.layout,missing).errors.includes('data: missing or duplicate visible SVG wire'));
  const changed=r.drawing.replace(/(<g id="net-data"[\s\S]*?<path class="net-wire" d=")[^"]+/, '$1M24,120H48');
  assert.ok(audit(d,r.layout,changed).errors.includes('data: rendered SVG wire differs from routed connectivity'));
  assert.equal(audit(d,r.layout,r.drawing).ok,true);
});

test('coincident unused pins are rejected too',async()=>{
  const d=await parseUarch('uarch 1\ntitle "Ports"\nstages S\nnode r block S\npin r.a out u1 top {"offset":0.5}\npin r.b out u1 top {"offset":0.5}');
  assert.throws(()=>compile(d),/Coincident pins/);
});

test('a malformed off-grid escape fails before the stepping loop',async()=>{
  const d=await fifo(),l=place(d);l.nodes[0]!.pins.data!.x+=1;
  assert.throws(()=>route(d,l),/not on the routing grid/);
});

test('sixteen parallel channels stay straight when labels fit between their rows',async()=>{
  const d=await parseUarch(source('examples/10-sample-selector.uarch'));
  const samples=d.instances.find(i=>i.id==='samples')!,mux=d.instances.find(i=>i.id==='mux')!;
  samples.span=4;mux.span=4;mux.label='16:1 MUX';
  for(let j=8;j<16;j++){
    samples.pins.push({id:'d'+j,direction:'out',side:'right',type:{bits:16},label:String(j),align:`mux.d${j}`});
    mux.pins.splice(j,0,{id:'d'+j,direction:'in',side:'left',type:{bits:16},label:String(j)});
    d.nets.push({id:'sample'+j,source:`samples.d${j}`,sinks:[`mux.d${j}`],label:`Ch${j}/16`});
  }
  d.instances.forEach(i=>i.pins.forEach(p=>{if('bits' in p.type&&p.type.bits===3)p.type.bits=4;}));
  d.instances.find(i=>i.id==='channel')!.row=4;
  const capture=d.instances.find(i=>i.id==='capture')!;capture.span=5;capture.pins.find(p=>p.id==='channel')!.row=4;
  const r=compile(d);
  assert.equal(r.audit.metrics.nets,18);
  for(const net of r.layout.routes.filter(n=>n.net.id.startsWith('sample')))assert.ok(net.edges.every(([a,b])=>a.y===b.y));
  const bank=r.layout.nodes.find(n=>n.instance.id==='samples')!;
  for(let j=0;j<16;j++){
    const label=r.drawing.match(new RegExp(`<text ([^>]*data-pin-label="samples.d${j}"[^>]*)>([^<]+)</text>`))!;
    const y=Number(label[1]!.match(/\by="([^"]+)"/)![1]),g=glyphBounds(label[2]!,16);
    assert.ok(Math.abs(y+g.y+g.h/2-bank.pins['d'+j]!.y)<1,'pin name is centered on its own wire');
  }
  const misplaced=r.drawing.replace(/<text [^>]*data-pin-label="samples.d0"[^>]*>/,tag=>tag.replace(/\by="[^"]+"/,`y="${bank.pins.d1!.y}"`));
  assert.ok(audit(d,r.layout,misplaced).errors.includes('samples.d0: rendered pin label leaves its own lane'));
});
