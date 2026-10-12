import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,readdirSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const cli=fileURLToPath(new URL('../cli.js',import.meta.url));
const fixture=fileURLToPath(new URL('../../examples/01-first-diagram.uarch',import.meta.url));
const call=(cwd:string,...args:string[])=>spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8'});

test('standalone CLI reports its version and checks sources from an unrelated directory',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'uarchdraw-check-'));
  assert.match(call(cwd,'--version').stdout,/uarchdraw 0\.1\.0/);
  const input=join(cwd,'first diagram.uarch');writeFileSync(input,readFileSync(fixture));
  const result=call(cwd,'check',input);assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);assert.equal(report.ok,true);assert.equal(report.metrics.labeledNets,1);
  assert.deepEqual(readdirSync(cwd),['first diagram.uarch']);
});
test('render emits the new format and preserves input comments when output uses the same stem',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'uarchdraw-render-')),input=join(cwd,'my diagram.uarch');
  const source=readFileSync(fixture,'utf8');writeFileSync(input,source);
  const result=call(cwd,'render',input,'-o',join(cwd,'my diagram'),'--svg-only');assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(input,'utf8'),source);
  for(const ext of ['.svg','-gray.svg','.html','.signals.md','.qa.json','.layout.json','.json'])assert.ok(existsSync(join(cwd,'my diagram'+ext)),ext);
  assert.ok(!existsSync(join(cwd,'my diagram.png')));
  assert.equal(JSON.parse(readFileSync(join(cwd,'my diagram.json'),'utf8')).version,1);
});
test('CLI rejects unsupported versions, extensions and incompatible options',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'uarchdraw-errors-')),input=join(cwd,'wrong.uarch');
  writeFileSync(input,'uarch 99\nstages EX');
  const bad=call(cwd,'check',input);assert.equal(bad.status,1);assert.match(bad.stderr,/wrong.uarch:1: Expected "uarch 1"/);
  assert.match(call(cwd,'check','wrong.txt').stderr,/Expected a .uarch/);
  assert.match(call(cwd,'render',input,'--svg-only','--png-only').stderr,/Choose either/);
  assert.match(call(cwd,'check',input,'-o','ignored').stderr,/does not accept output/);
});
