import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {pinMap} from '../dist/index.js';

export const root=resolve(import.meta.dirname,'..');
export const directory=resolve(root,'examples/tutorials');
export const course=JSON.parse(readFileSync(resolve(directory,'course.json'),'utf8'));
export const checkpoints=course.lessons.flatMap(lesson=>[
  ...lesson.steps.map(step=>({...step,lesson:lesson.id})),
  {...lesson.exercise,id:'solution-'+lesson.id,title:lesson.title+' solution',lesson:lesson.id},
]);
export const readSource=entry=>readFileSync(resolve(directory,entry.source),'utf8');
export const viewFlags=entry=>entry.view?.overview?['--overview']:entry.view?.focus?['--focus',entry.view.focus]:[];

export function verifyCheckpoint(design,result,entry){
  const checks=entry.checks,metrics=result.audit.metrics;
  assert.equal(result.audit.ok,true,entry.id);
  for(const key of ['symbols','nets','sinks'])if(checks[key]!==undefined)assert.equal(metrics[key],checks[key],`${entry.id}: ${key}`);
  if(checks.width!==undefined){
    const scalarWidths=design.instances.flatMap(i=>i.pins).filter(p=>'bits' in p.type).map(p=>p.type.bits);
    assert.equal(Math.max(...scalarWidths),checks.width,`${entry.id}: data width`);
  }
  if(checks.array!==undefined){
    const mux=design.instances.find(i=>i.kind==='mux');
    assert.equal(mux?.pins.filter(p=>/^d\d+$/.test(p.id)).length,checks.array,`${entry.id}: MUX inputs`);
    const data=result.layout.routes.filter(r=>/\.data\d+$/.test(r.net.source));
    assert.equal(data.length,checks.array,`${entry.id}: channel nets`);
    assert(data.every(r=>r.edges.every(([a,b])=>a.y===b.y)),`${entry.id}: horizontal sample paths`);
  }
  if(checks.bundle)assert([...pinMap(design).values()].some(p=>'fields' in p.pin.type),`${entry.id}: bundle`);
  if(checks.attempts!==undefined)assert.equal(result.planning.attempts,checks.attempts,`${entry.id}: attempts`);
  if(checks.expanded!==undefined)assert.equal(result.planning.expanded,checks.expanded,`${entry.id}: expansion`);
}
