// Repeat the usability probes; expected current limitations are reported, not hidden.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {parseUarch,formatUarch,compile} from '../dist/index.js';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'output');
mkdirSync(output,{recursive:true});
const source=readFileSync(resolve(root,'examples/06-round-robin-arbiter.uarch'),'utf8');
const base=await parseUarch(source);
const automatic=await parseUarch(readFileSync(resolve(root,'src/test/fixtures/arbiter-automatic.uarch'),'utf8'));
const trials=[];
function record(name,design){
  try{
    const r=compile(design);
    trials.push({name,result:'pass',...r.audit.metrics,width:r.layout.width,height:r.layout.height});
  }catch(e){trials.push({name,result:'reject',message:e.message});}
}
record('automatic after renderer fixes',automatic);
record('guided final',base);
const wide=structuredClone(base);
wide.instances.forEach(i=>{
  i.pins.forEach(p=>{if(p.type.bits===32)p.type.bits=64;});
  i.notes=i.notes?.map(s=>s.replace('data[32]','data[64]'));
});
wide.nets.forEach(n=>{n.label=n.label?.replace('/32','/64');});
record('change all data buses to 64 bits',wide);

const extra=structuredClone(base);
const queues=extra.instances.find(i=>i.id==='queues'),mux=extra.instances.find(i=>i.id==='select');
queues.pins.splice(5,0,{id:'data5',direction:'out',side:'right',type:{bits:32},label:'data 5',align:'select.d5'});
mux.pins.splice(5,0,{id:'d5',direction:'in',side:'left',type:{bits:32},label:'5'});
mux.label='6:1 MUX';queues.notes=['6 independent queues'];extra.title='Six inputs, one shared output';
extra.instances.forEach(i=>i.pins.forEach(p=>{if(p.type.bits===5)p.type.bits=6;}));
extra.nets.forEach(n=>{n.label=n.label?.replace('/5','/6');});
extra.nets.push({id:'data5',source:'queues.data5',sinks:['select.d5'],label:'Data5/32'});
record('add a sixth queue without new layout hints',extra);
const adjusted=structuredClone(extra);
adjusted.instances.filter(i=>i.span===2).forEach(i=>i.span=3);
adjusted.instances.filter(i=>i.row===2).forEach(i=>i.row=3);
record('six queues after increasing two spans and moving two blocks down',adjusted);

const long=structuredClone(base);
long.nets.filter(n=>/^data[0-4]$/.test(n.id)).forEach((n,j)=>n.label=`Input queue ${j} head data / 32`);
record('longer data labels without wider channels',long);
const missing=structuredClone(base);
missing.nets=missing.nets.filter(n=>n.id!=='output-ready');record('delete OutReady',missing);
const bad=structuredClone(base);
bad.instances.find(i=>i.id==='select').pins.find(p=>p.id==='d0').type.bits=16;
record('one 16-bit sink on a 32-bit bus',bad);
const reordered=structuredClone(base);
reordered.instances.reverse();reordered.nets.reverse();record('reverse node and net declaration order',reordered);
trials.at(-1).identicalSVG=compile(reordered).drawing===compile(base).drawing;
for(const trial of trials){
  const invalid=['delete OutReady','one 16-bit sink on a 32-bit bus'].includes(trial.name);
  assert.equal(trial.result,invalid?'reject':'pass',trial.name);
}
assert.equal(trials.at(-1).identicalSVG,true,'Reordering must preserve SVG');

const pins=base.instances.flatMap(i=>i.pins);
const counts={declarations:source.split(/\r?\n/).filter(s=>s.trim()&&!s.startsWith('#')).length,
  pins:pins.length,explicitNodePlacements:base.instances.length,pinAlignments:pins.filter(p=>p.align).length,
  nodeAlignments:base.instances.filter(i=>i.align).length,spans:base.instances.filter(i=>i.span).length,
  corridors:base.nets.filter(n=>n.corridor).length};
writeFileSync(resolve(output,'arbiter-usability.json'),JSON.stringify({counts,trials},null,2)+'\n');
writeFileSync(resolve(output,'arbiter-six-input.uarch'),formatUarch(adjusted));
writeFileSync(resolve(output,'arbiter-six-compact.uarch'),formatUarch(extra));
console.log(JSON.stringify({counts,trials},null,2));
for(const [input,name] of [
  ['src/test/fixtures/arbiter-automatic.uarch','arbiter-auto-fixed'],
  ['examples/06-round-robin-arbiter.uarch','06-round-robin-arbiter'],
  ['output/arbiter-six-compact.uarch','arbiter-six-compact'],
  ['output/arbiter-six-input.uarch','arbiter-six-input']
]){
  const result=spawnSync(process.execPath,['dist/cli.js','render',input,'-o',`output/${name}`],{cwd:root,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
