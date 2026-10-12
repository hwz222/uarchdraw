import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseUarch,formatUarch } from '../dsl.js';
import { compile } from '../compile.js';
import { rv32i } from './fixtures/rv32i.js';
const dir=fileURLToPath(new URL('../../examples/',import.meta.url));
for(const file of readdirSync(dir).filter(f=>f.endsWith('.uarch')).sort())test(`tutorial compiles and retains every signal: ${file}`,async()=>{
  const design=await parseUarch(readFileSync(join(dir,file),'utf8'),file),result=compile(design);
  assert.equal(result.audit.metrics.labeledNets,design.nets.length);
  assert.deepEqual(await parseUarch(formatUarch(design)),design);
});
test('the published RV32I source matches the electrically tested fixture',async()=>{
  const design=await parseUarch(readFileSync(join(dir,'05-rv32i-forwarding.uarch'),'utf8'));
  assert.deepEqual(design,rv32i());
});
