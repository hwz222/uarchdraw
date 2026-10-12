// Reproduce automatic-authoring edits without adding manual layout hints.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {parseUarch,formatUarch,createView,compile} from '../dist/index.js';

const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'output');
mkdirSync(folder,{recursive:true});mkdirSync(resolve(root,'output'),{recursive:true});
const source=name=>readFileSync(resolve(root,'examples/'+name+'.uarch'),'utf8');
const cases=[];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
async function render(name,design,parameters={}){
  const input=resolve(root,'output/'+name+'.uarch'),prefix=resolve(root,'output/'+name);
  writeFileSync(input,formatUarch(design));
  const result=spawnSync(process.execPath,['dist/cli.js','render',input,'-o',prefix],{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr||result.stdout);
  const qa=JSON.parse(readFileSync(prefix+'.qa.json')),planning=JSON.parse(readFileSync(prefix+'.planning.json'));
  assert.equal(qa.ok,true);
  const layout=JSON.parse(readFileSync(prefix+'.layout.json'));
  cases.push({name,parameters,geometry:qa,planning,width:layout.width,height:layout.height,
    sha256:{png:hash(prefix+'.png'),grayPng:hash(prefix+'-gray.png'),svg:hash(prefix+'.svg')}});
}
for(const n of [16,32]){
  const design=await parseUarch(source('11-automatic-selector').replace('param N = 8','param N = '+n));
  const result=compile(design);
  assert.equal(result.audit.metrics.crossings,0);
  for(const route of result.layout.routes.filter(r=>r.net.source.startsWith('samples.')))assert(route.edges.every(([a,b])=>a.y===b.y));
  await render('selector-'+n,design,{N:n,W:16});
}
for(const n of [6,16])await render('arbiter-'+n,await parseUarch(source('12-automatic-arbiter').replace('param N = 5','param N = '+n)),{N:n,W:32});
await render('fifo-64',await parseUarch(source('13-automatic-fifo').replace('param W = 32','param W = 64')),{W:64});
const hierarchy=await parseUarch(source('14-hierarchical-datapath'));
await render('hierarchy-overview',await createView(hierarchy,{overview:true}));
await render('hierarchy-detail',await createView(hierarchy,{focus:'core.execute'}));
const long=await parseUarch(source('06-round-robin-arbiter'));
long.nets.filter(n=>/^data[0-4]$/.test(n.id)).forEach((n,j)=>n.label=`Input queue ${j} head data / 32`);
await render('long-labels',long);
writeFileSync(resolve(folder,'automation-results.json'),JSON.stringify({cases},null,2)+'\n');
console.log(`${cases.length} automation variants verified; metrics and hashes saved in output/automation-results.json`);
