import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {parseUarch,formatUarch,compile,validate,createView,pinMap} from '../index.js';
import type {Design} from '../model.js';

const read=(name:string)=>readFileSync(new URL('../../examples/'+name+'.uarch',import.meta.url),'utf8');
const simple='uarch 1\nstages S T\nnode a block S\npin a.o out u32 right\nnode b block T\npin b.i in u32 left\nnet data a.o -> b.i';
const cli=fileURLToPath(new URL('../cli.js',import.meta.url));

test('typed options fail at their source line before geometry is attempted',async()=>{
  for(const [change,pattern] of [
    ['{"optional":"false"}',/Expected a boolean/],
    ['{"label":123}',/Expected a string/],
    ['{"align":false}',/Expected a string/],
    ['{"offset":"0.5"}',/Expected a number/],
  ] as const){
    await assert.rejects(parseUarch(simple.replace('pin b.i in u32 left','pin b.i in u32 left '+change),'bad.uarch'),error=>{
      assert.match(String(error),/bad.uarch:6:/);assert.match(String(error),pattern);return true;
    });
  }
  await assert.rejects(parseUarch(simple+' {"description":{"bad":true}}','bad.uarch'),/bad.uarch:7:.*Expected a string/);
  await assert.rejects(parseUarch(simple.replace('stages S T','stages S T\nstages S T')),/Specify stages only once/);
});

test('JSON and API callers cannot bypass option or structural validation',async()=>{
  const d=await parseUarch(simple);
  for(const mutate of [
    (x:any)=>x.instances[1].pins[0].optional='false',
    (x:any)=>x.nets[0].description={},
    (x:any)=>x.instances[0].notes='not an array',
    (x:any)=>x.instances[0].pins[0].type={fields:null},
    (x:any)=>x.instances[0].pins=null,
  ]){
    const bad=structuredClone(d);mutate(bad);assert.throws(()=>compile(bad),error=>{assert(!(error instanceof TypeError));return true;});
  }
  assert.throws(()=>validate(null as unknown as Design),/Expected an object/);
});

test('automatic placement can coexist with a fixed data-path anchor',async()=>{
  const d=await parseUarch('uarch 1\nstages S\nnode a block S {"column":1,"row":0}\npin a.o out u32 right\nnode b block S\npin b.i in u32 left\nnet ab a.o -> b.i');
  assert.equal(d.instances[0]!.column,1);assert(d.instances[1]!.column>1);assert(compile(d).audit.ok);
});

test('adaptive routing recovers long labels without changing connectivity or input',async()=>{
  const d=await parseUarch(read('06-round-robin-arbiter'));
  d.nets.filter(n=>/^data[0-4]$/.test(n.id)).forEach((n,j)=>n.label=`Input queue ${j} head data / 32`);
  const snapshot=JSON.stringify(d);
  assert.throws(()=>compile(d,{adaptive:false}),/No readable label space/);
  const result=compile(d);assert(result.planning.expanded);assert(result.planning.attempts<=4);
  assert.equal(result.audit.metrics.nets,14);assert.equal(result.audit.metrics.sinks,15);assert.equal(JSON.stringify(d),snapshot);
  assert.throws(()=>compile(d,{maxAttempts:99}),/maxAttempts/);
});

test('parameters, port arrays and built-in MUX adapt from 2 to 32 inputs',async()=>{
  const source=read('11-automatic-selector');
  for(const n of [2,5,6,8,16,32]){
    const d=await parseUarch(source.replace('param N = 8','param N = '+n));
    const result=compile(d),mux=d.instances.find(i=>i.id==='mux')!;
    assert.equal(mux.pins.filter(p=>p.id.startsWith('d')).length,n);
    assert.deepEqual(mux.pins.find(p=>p.id==='select')!.type,{bits:Math.ceil(Math.log2(n))});
    assert.equal(result.audit.metrics.crossings,0);assert.equal(result.audit.metrics.nets,n+2);
    for(const route of result.layout.routes.filter(r=>r.net.source.startsWith('samples.')))assert(route.edges.every(([a,b])=>a.y===b.y));
  }
});

test('template arguments bind locally and width changes remain structurally checked',async()=>{
  const source='uarch 2\nparam W = 32\ntemplate Output(W) { out data: bits(W) }\nblock a: Output(64)\nblock b { in data: bits(64) }\nconnect a.data -> b.data';
  const d=await parseUarch(source);assert.deepEqual(pinMap(d).get('a.data')!.pin.type,{bits:64});assert(compile(d).audit.ok);
  await assert.rejects(parseUarch(source.replace('in data: bits(64)','in data: bits(W)')),/incompatible types/);
});

test('separate connection statements merge one driver into one fanout net',async()=>{
  const d=await parseUarch('uarch 2\nblock a { out data: bit }\nblock b { in data: bit }\nblock c { in data: bit }\nconnect a.data -> b.data\nconnect a.data -> c.data');
  assert.equal(d.nets.length,1);assert.equal(d.nets[0]!.sinks.length,2);assert(compile(d).audit.ok);
});

test('automatic pipeline ports remain labeled without explicit field rows',async()=>{
  const d=await parseUarch('uarch 2\nblock source { out value: bits(32) }\nblock pipe: pipeline { in value: bits(32); out next: bits(32) }\nconnect source.value -> pipe.value');
  const r=compile(d);assert(r.audit.ok);assert.match(r.drawing,/data-pin-label="pipe.value"/);assert.match(r.drawing,/data-pin-label="pipe.next"/);
  assert(r.layout.nodes.find(n=>n.instance.id==='pipe')!.h<240);
});

test('automatic default port labels size their rectangles without display overrides',async()=>{
  const d=await parseUarch('uarch 2\nblock a { out extremely_descriptive_output_port: bit }\nblock b { in very_long_input_port_name: bit }\nconnect a.extremely_descriptive_output_port -> b.very_long_input_port_name');
  const r=compile(d);assert(r.audit.ok);
  assert(r.layout.nodes.every(n=>n.w>240));
  assert.match(r.drawing,/data-pin-label="a.extremely_descriptive_output_port"/);
});

test('inferred net IDs distinguish underscore-containing block and port names',async()=>{
  const d=await parseUarch('uarch 2\nblock a_b { out c: bit }\nblock a { out b_c: bit }\nblock sink { in x: bit; in y: bit }\nconnect a_b.c -> sink.x\nconnect a.b_c -> sink.y');
  assert.equal(new Set(d.nets.map(n=>n.id)).size,2);assert(compile(d).audit.ok);
  const canonical=await parseUarch(formatUarch(d));assert.deepEqual(canonical,d);
});

test('malformed expansions fail rather than silently selecting or truncating ports',async()=>{
  const source=read('11-automatic-selector');
  for(const [input,pattern] of [
    [source.replace('param N = 8','param N = 0'),/array size/],
    [source.replace('param N = 8','param N = 129'),/array size/],
    [source.replace('param W = 16','param W = 16 / 0'),/Division by zero/],
    [source.replace('param W = 16','param W = unknown(16)'),/Unknown integer function/],
    [source.replace('mux.d[*]','mux.d[99]'),/index out of range/],
    [source.replace('mux.d[*]','mux.d[0]'),/equal lengths/],
    [source.replace('Samples(N, W) in','Samples(N) in'),/expects 2 arguments/],
    [source.replace('out index: bits(clog2(N))','out index: bits(MISSING)'),/Unknown parameter/],
  ] as const)await assert.rejects(parseUarch(input,'expansion.uarch'),pattern);
});

test('version-2 comments and multiline blocks round trip to canonical version 1',async()=>{
  for(const name of ['11-automatic-selector','12-automatic-arbiter','13-automatic-fifo','14-hierarchical-datapath']){
    const d=await parseUarch('// Author comment\n'+read(name).replace('param W =','param W ='));
    const canonical=await parseUarch(formatUarch(d));
    assert.deepEqual(canonical,d);assert.equal(compile(canonical).drawing,compile(d).drawing);
  }
});

test('automatic arbiter keeps the main buses horizontal across input-count changes',async()=>{
  for(const n of [5,6,8,16]){
    const d=await parseUarch(read('12-automatic-arbiter').replace('param N = 5','param N = '+n)),r=compile(d);
    assert.equal(r.audit.metrics.crossings,3);
    for(const route of r.layout.routes.filter(r=>r.net.source.startsWith('queues.data')))assert(route.edges.every(([a,b])=>a.y===b.y));
    const control=r.layout.nodes.filter(n=>n.instance.role==='control');
    const mux=r.layout.nodes.find(n=>n.instance.id==='mux')!;
    assert(control.every(n=>n.y>=mux.y+mux.h));
  }
});

test('overview and nested focus preserve the real boundary nets and types',async()=>{
  const d=await parseUarch(read('14-hierarchical-datapath')),before=JSON.stringify(d);
  const overview=await createView(d,{overview:true});
  assert.equal(overview.instances.length,3);assert.equal(overview.nets.length,2);
  assert.equal(overview.instances.find(i=>i.id==='core')!.label,'Processing core');
  const detail=await createView(d,{focus:'core.execute'});
  assert.equal(detail.nets.length,3);assert(detail.instances.some(i=>i.label==='Operand source (external)'));
  assert(detail.instances.some(i=>i.label==='Result consumer (external)'));
  for(const view of [overview,detail]){
    assert(compile(view).audit.ok);
    for(const net of view.nets){const original=d.nets.find(n=>n.id===net.id)!;assert.deepEqual(pinMap(view).get(net.source)!.pin.type,pinMap(d).get(original.source)!.pin.type);}
  }
  assert.equal(JSON.stringify(d),before);
  await assert.rejects(createView(d,{focus:'missing'}),/Unknown focus group/);
  await assert.rejects(createView(d,{overview:true,focus:'core'}),/Choose overview or focus/);
});

test('hierarchy validation rejects cycles and overlapping sibling ownership',async()=>{
  const d=await parseUarch(read('14-hierarchical-datapath'));
  const cycle=structuredClone(d);cycle.groups![0]!.parent='core__execute';assert.throws(()=>validate(cycle),/Cyclic group/);
  const overlap=structuredClone(d);overlap.groups!.push({id:'other',label:'Other',members:['core__execute__compute']});assert.throws(()=>validate(overlap),/Overlapping sibling/);
});

test('CLI init creates runnable sources and refuses to overwrite user files',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'uarchdraw-init-')),file=join(cwd,'design.uarch');
  const call=(...args:string[])=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});
  assert.equal(call('init',file,'--template','selector').status,0);
  const before=readFileSync(file,'utf8');assert.match(before,/uarch 2/);
  assert.equal(call('check',file).status,0);assert.equal(call('init',file).status,1);assert.equal(readFileSync(file,'utf8'),before);
  const group=join(cwd,'group.uarch');assert.equal(call('init',group,'--template','hierarchy').status,0);
  assert.equal(call('check',group,'--overview').status,0);assert.equal(call('check',group,'--focus','core.execute').status,0);
});

test('watch rebuilds changed sources and preserves verified output across invalid edits',{timeout:20000},async()=>{
  const cwd=mkdtempSync(join(tmpdir(),'uarchdraw-watch-')),input=join(cwd,'design.uarch'),output=join(cwd,'result');
  const source=read('11-automatic-selector');writeFileSync(input,source);
  const child=spawn(process.execPath,[cli,'watch',input,'-o',output,'--svg-only'],{cwd,windowsHide:true,stdio:'pipe'});
  let errors='';child.stderr.on('data',chunk=>errors+=String(chunk));
  const waitFor=async(check:()=>boolean)=>{for(let j=0;j<100;j++){if(check())return;if(child.exitCode!==null)throw new Error('Watcher exited: '+errors);await delay(100);}throw new Error('Watcher did not update: '+errors);};
  try{
    await waitFor(()=>existsSync(output+'.svg'));const first=readFileSync(output+'.svg','utf8');
    writeFileSync(input,source.replace('param N = 8','param N = 16'));
    await waitFor(()=>readFileSync(output+'.svg','utf8').includes('16:1 MUX'));
    const valid=readFileSync(output+'.svg','utf8');assert.notEqual(valid,first);
    writeFileSync(input,source.replace('param N = 8','param N = 0'));
    await waitFor(()=>errors.includes('array size'));assert.equal(readFileSync(output+'.svg','utf8'),valid);
    writeFileSync(input,source.replace('param N = 8','param N = 6'));
    await waitFor(()=>readFileSync(output+'.svg','utf8').includes('6:1 MUX'));
  }finally{child.kill();await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve());});}
});
