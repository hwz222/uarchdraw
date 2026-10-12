import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {parseUarch,formatUarch,createView,compile} from '../index.js';
import type {ViewOptions} from '../views.js';

interface Entry {id:string;source:string;checks:Record<string,number|boolean>;view?:ViewOptions}
interface Failure {id:string;source:string;expected:string;flags:string[]}
interface Lesson {id:string;steps:Entry[];exercise:Omit<Entry,'id'>;errors:Failure[]}
const directory=fileURLToPath(new URL('../../examples/tutorials/',import.meta.url));
const course=JSON.parse(readFileSync(join(directory,'course.json'),'utf8')) as {lessons:Lesson[]};
const read=(entry:{source:string})=>readFileSync(join(directory,entry.source),'utf8');

for(const lesson of course.lessons){
  const entries=[...lesson.steps,{...lesson.exercise,id:'solution-'+lesson.id}];
  for(const entry of entries)test(`learning checkpoint ${entry.id} matches its stated result`,async()=>{
    const parsed=await parseUarch(read(entry),entry.source);
    assert.deepEqual(await parseUarch(formatUarch(parsed)),parsed);
    const design=entry.view?await createView(parsed,entry.view):parsed,r=compile(design);
    assert(r.audit.ok);
    for(const key of ['symbols','nets','sinks'] as const)if(entry.checks[key]!==undefined)assert.equal(r.audit.metrics[key],entry.checks[key]);
    if(entry.checks.width!==undefined){
      const widths=design.instances.flatMap(i=>i.pins).filter(p=>'bits' in p.type).map(p=>'bits' in p.type?p.type.bits:0);
      assert.equal(Math.max(...widths),entry.checks.width);
    }
    if(entry.checks.array!==undefined){
      const mux=design.instances.find(i=>i.kind==='mux')!;
      assert.equal(mux.pins.filter(p=>/^d\d+$/.test(p.id)).length,entry.checks.array);
      const channels=r.layout.routes.filter(route=>/\.data\d+$/.test(route.net.source));
      assert.equal(channels.length,entry.checks.array);
      assert(channels.every(route=>route.edges.every(([a,b])=>a.y===b.y)));
    }
    if(entry.checks.attempts!==undefined)assert.equal(r.planning.attempts,entry.checks.attempts);
    if(entry.checks.expanded!==undefined)assert.equal(r.planning.expanded,entry.checks.expanded);
  });
  for(const failure of lesson.errors)test(`learning fault ${failure.id} explains the real rejection`,async()=>{
    await assert.rejects(async()=>{
      const design=await parseUarch(read(failure),failure.source);
      compile(design,{adaptive:failure.flags.includes('--no-adaptive')?false:undefined});
    },error=>{assert(String(error).includes(failure.expected));return true;});
  });
}

test('lesson code listings remain complete and match the executable checkpoints',()=>{
  for(const lesson of course.lessons){
    const prose=readFileSync(join(directory,lesson.id+'.md'),'utf8');
    const listings=[...prose.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m=>m[1]!.trim());
    for(const entry of [...lesson.steps,lesson.exercise])assert(listings.includes(read(entry).trim()),`${lesson.id}: stale code listing for ${entry.source}`);
    assert.match(prose,/What you should see/);assert.match(prose,/Try it yourself/);
  }
});
