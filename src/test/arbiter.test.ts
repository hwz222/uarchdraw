import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseUarch } from '../dsl.js';
import { compile } from '../compile.js';
import { audit } from '../audit.js';
import type { Design } from '../model.js';

const source=(file:string)=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');
const original=()=>parseUarch(source('src/test/fixtures/arbiter-automatic.uarch'));
const guided=()=>parseUarch(source('examples/06-round-robin-arbiter.uarch'));

test('pruning a preferred corridor reattaches its label to surviving wire geometry',async()=>{
  const d=await original(),r=compile(d);
  const grant=r.layout.routes.find(n=>n.net.id==='grant')!;
  // This local return loses its entire initial top trunk. The old label stayed there.
  assert.ok(!grant.edges.some(([a,b])=>a.y===132&&b.y===132));
  assert.equal(r.audit.ok,true);
  const detached=r.drawing.replace(/<text [^>]*data-label-for="grant"[^>]*>/,
    tag=>tag.replace(/ x="[^"]+"/,' x="48"').replace(/ y="[^"]+"/,' y="100"'));
  assert.notEqual(detached,r.drawing);
  assert.ok(audit(d,r.layout,detached).errors.includes('grant: rendered signal label is detached from its wire'));
});

test('an eight-input MUX has readable input glyphs and honors an explicit span',async()=>{
  const prefix='uarch 1\ntitle "Eight inputs"\nstages SELECT\n';
  const pins=Array.from({length:8},(_,j)=>`pin m.d${j} in u32 left {"label":"${j}","optional":true}`).join('\n');
  const d=await parseUarch(prefix+'node m mux SELECT {"label":"8:1 MUX"}\n'+pins);
  const compact=compile(d); // The old fixed-height MUX fails the glyph collision audit.
  const n=compact.layout.nodes[0]!;
  for(let j=1;j<8;j++)assert.ok(n.pins['d'+j]!.y-n.pins['d'+(j-1)]!.y>=36);
  const taller=structuredClone(d);taller.instances[0]!.span=3;
  assert.ok(compile(taller).layout.nodes[0]!.h>n.h);
});

test('guided arbiter placement changes no electrical endpoint or type',async()=>{
  const electrical=(d:Design)=>({
    pins:d.instances.flatMap(i=>i.pins.map(p=>({id:i.id+'.'+p.id,direction:p.direction,type:p.type}))).sort((a,b)=>a.id.localeCompare(b.id)),
    nets:d.nets.map(n=>({id:n.id,source:n.source,sinks:[...n.sinks].sort()})).sort((a,b)=>a.id.localeCompare(b.id))
  });
  assert.deepEqual(electrical(await guided()),electrical(await original()));
});

test('all five arbiter data paths stay horizontal and label coverage is complete',async()=>{
  const r=compile(await guided());
  for(const id of ['data0','data1','data2','data3','data4']){
    const net=r.layout.routes.find(n=>n.net.id===id)!;
    assert.ok(net.edges.every(([a,b])=>a.y===b.y));
  }
  assert.equal(r.audit.metrics.labeledNets,14);
});
