import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {parseUarch,compile,formatUarch} from '../dist/index.js';
import {audit} from '../dist/audit.js';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'output');
mkdirSync(out,{recursive:true});
const results=[];
const read=path=>readFileSync(resolve(root,path),'utf8');
async function probe(name,source,change){
  try{
    const d=await parseUarch(source);change?.(d);
    const r=compile(d);
    results.push({name,result:'pass',width:r.layout.width,height:r.layout.height,...r.audit.metrics});
    return {d,...r};
  }catch(e){results.push({name,result:'reject',message:e.message});}
}
const cases=['07-feedback-counter','08-fifo-handshake','09-register-file','10-sample-selector'];
for(const name of cases){
  await probe('initial '+name,read(`src/test/fixtures/${name}.uarch`));
  await probe('final '+name,read(`examples/${name}.uarch`));
  const r=spawnSync(process.execPath,['dist/cli.js','render',`examples/${name}.uarch`],{cwd:root,encoding:'utf8',timeout:15000});
  if(r.status!==0)throw new Error(`${name}: ${r.error?.message??r.stderr}`);
}
await probe('zero-width return corridor','uarch 1\ntitle "Hold"\nstages S\nnode r register S {"label":"Hold"}\npin r.d in u1 top\npin r.q out u1 bottom\nnet hold r.q -> r.d {"corridor":"bottom"}');
await probe('default pipeline extent','uarch 1\ntitle "Capture"\nstages S\nnode r pipeline S {"label":"Capture"}');
await probe('long title','uarch 1\ntitle "A long descriptive heading for a small standalone register"\nstages S\nnode r register S');
await probe('six footer notes','uarch 1\ntitle "Register"\nstages S\nnode r register S\n'+Array.from({length:6},(_,j)=>`note "Note number ${j+1}"`).join('\n'));
for(const kind of ['mux','alu'])for(const side of ['top','bottom'])for(const offset of [0,0.25,0.5,0.75,1]){
  const operands=kind==='alu'?'\npin m.a in u32 left {"optional":true}\npin m.b in u32 left {"optional":true}':'';
  await probe(`${kind} ${side} offset ${offset}`,`uarch 1\ntitle "Port placement"\nstages S\nnode m ${kind} S${operands}\npin m.sel in u1 ${side} {"offset":${offset},"optional":true}`);
}
const fifo=await probe('FIFO control case',read('examples/08-fifo-handshake.uarch'));
const removed=fifo.drawing.replace(/(<g id="net-data"[\s\S]*?<title>[\s\S]*?<\/title>)[\s\S]*?<\/g>/,'$1</g>');
const missing=audit(fifo.d,fifo.layout,removed);
results.push({name:'delete rendered Data net paths only',result:missing.ok?'incorrectly accepted':'correctly rejected',errors:missing.errors});

await probe('FIFO 64-bit data',read('examples/08-fifo-handshake.uarch'),d=>{
  d.instances.forEach(i=>i.pins.forEach(p=>{if(p.type.bits===32)p.type.bits=64;}));
  d.nets.forEach(n=>{n.label=n.label?.replace('/32','/64');});
});
await probe('register file with longer component title',read('examples/09-register-file.uarch'),d=>d.instances.find(i=>i.id==='rf').label='Integer register bank');
await probe('counter with long wire name',read('examples/07-feedback-counter.uarch'),d=>d.nets.find(n=>n.id==='sum').label='Incremented count before enable selection / 32');
await probe('drop FIFO ready net',read('examples/08-fifo-handshake.uarch'),d=>d.nets=d.nets.filter(n=>n.id!=='in-ready'));
let wideSelector;
const sixteen=await probe('sixteen-channel expansion',read('examples/10-sample-selector.uarch'),d=>{
  const samples=d.instances.find(i=>i.id==='samples'),mux=d.instances.find(i=>i.id==='mux');
  mux.label='16:1 MUX';d.title='Sixteen-channel sample selector';
  for(let j=8;j<16;j++){
    samples.pins.push({id:'d'+j,direction:'out',side:'right',type:{bits:16},label:String(j),align:`mux.d${j}`});
    mux.pins.splice(j,0,{id:'d'+j,direction:'in',side:'left',type:{bits:16},label:String(j)});
    d.nets.push({id:'sample'+j,source:`samples.d${j}`,sinks:[`mux.d${j}`],label:`Ch${j}/16`});
  }
  d.instances.forEach(i=>i.pins.forEach(p=>{if(p.type.bits===3)p.type.bits=4;}));
  d.nets.find(n=>n.id==='index').label='Channel/4';
  d.notes[0]='Channel selects inputs 0 through 15. Sample and tag are captured together.';
  wideSelector=d;
});
const adjusted=await probe('sixteen channels with additional vertical spacing',formatUarch(wideSelector),d=>{
  d.instances.filter(i=>['samples','mux'].includes(i.id)).forEach(i=>i.span=4);
  d.instances.find(i=>i.id==='channel').row=4;
  const capture=d.instances.find(i=>i.id==='capture');capture.span=5;capture.pins.find(p=>p.id==='channel').row=4;
});
if(adjusted){
  writeFileSync(resolve(out,'sixteen-channel.uarch'),formatUarch(adjusted.d));
  const r=spawnSync(process.execPath,['dist/cli.js','render','output/sixteen-channel.uarch'],{cwd:root,encoding:'utf8',timeout:15000});
  if(r.status!==0)throw new Error(r.stderr);
}
for(const name of cases){
  const d=await parseUarch(read(`examples/${name}.uarch`)),before=compile(d);
  d.instances.reverse();d.nets.reverse();d.nets.forEach(n=>n.sinks.reverse());
  const after=compile(d);
  results.push({name:name+' reordered declarations',result:before.drawing===after.drawing?'identical':'changed'});
}
for(const result of results){
  const expected=result.name==='delete rendered Data net paths only'?'correctly rejected':
    result.name==='drop FIFO ready net'?'reject':
    result.name.endsWith(' reordered declarations')?'identical':'pass';
  assert.equal(result.result,expected,result.name);
}
writeFileSync(resolve(out,'diverse-results.json'),JSON.stringify({results},null,2)+'\n');
console.log(`${results.length} probes recorded in output/diverse-results.json`);
console.log(JSON.stringify(results.filter(r=>r.result!=='pass'),null,2));
