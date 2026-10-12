import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rv32i } from './fixtures/rv32i.js';
import { runPipeline,interlock,chooseForward,type Instruction } from './fixtures/pipeline.js';
const run=(p:Instruction[],mem:Record<number,number>={})=>runPipeline(rv32i(),p,mem);
const addi=(rd:number,rs1:number,imm:number):Instruction=>({op:'addi',rd,rs1,imm});
const nop=()=>addi(0,0,0);
test('adjacent producer reaches BOTH forwarding muxes, newest producer wins',()=>{
  const p=run([addi(1,0,7),addi(1,1,2),{op:'add',rd:2,rs1:1,rs2:1}]);
  assert.equal(p.registers[2],18);const t=p.trace.find(t=>t.ex===8)!;assert.equal(t.selectA,1);assert.equal(t.selectB,1);
});
test('one gap forwards the selected WB result',()=>{
  const p=run([addi(1,0,11),nop(),addi(2,1,5)]);assert.equal(p.registers[2],16);assert.equal(p.trace.find(t=>t.ex===8)!.selectA,2);
});
test('load-use stalls once, forwards data from WB and never the address',()=>{
  const p=run([{op:'lw',rd:1,rs1:0,imm:80},addi(2,1,5)],{80:41});assert.equal(p.registers[2],46);assert.equal(p.trace.filter(t=>t.stall).length,1);assert.equal(p.trace.find(t=>t.ex===4)!.selectA,2);
});
test('store receives ForwardB before the immediate ALU mux',()=>{
  const p=run([addi(1,0,123),{op:'sw',rs1:0,rs2:1,imm:64}]);assert.equal(p.memory[64],123);assert.equal(p.trace.find(t=>t.ex===4)!.selectB,1);
});
test('load-to-store conservatively stalls once',()=>{
  const p=run([{op:'lw',rd:1,rs1:0,imm:80},{op:'sw',rs1:0,rs2:1,imm:84}],{80:987});assert.equal(p.memory[84],987);assert.equal(p.trace.filter(t=>t.stall).length,1);
});
test('dependent taken branch uses forwarded operands and flushes younger work',()=>{
  const p=run([addi(1,0,1),{op:'beq',rs1:1,rs2:0,imm:12},addi(2,0,9),{op:'beq',rs1:1,rs2:1,imm:12},addi(2,0,99),{op:'sw',rs1:0,rs2:1,imm:80},addi(3,0,8)]);
  assert.equal(p.registers[2],9);assert.equal(p.registers[3],8);assert.equal(p.memory[80],undefined);assert.equal(p.trace.filter(t=>t.redirect).length,1);
});
test('JALR target consumes forwarded rs1 and clears bit zero; link can forward',()=>{
  const p=run([addi(1,0,17),{op:'jalr',rd:5,rs1:1,imm:0},addi(2,0,99),nop(),addi(6,5,3)]);assert.equal(p.registers[2],0);assert.equal(p.registers[5],8);assert.equal(p.registers[6],11);
});
test('x0 is immutable and excluded from forwarding',()=>{
  const p=run([addi(0,0,100),{op:'add',rd:1,rs1:0,rs2:0}]);assert.equal(p.registers[1],0);assert.equal(p.trace.find(t=>t.ex===4)!.selectA,0);
});
test('immediate bits / unused rs2 never trigger false load-use',()=>{
  const p=run([{op:'lw',rd:1,rs1:0,imm:80},{...addi(2,0,1),rs2:1}],{80:55});assert.equal(p.registers[2],1);assert.equal(p.trace.filter(t=>t.stall).length,0);
});
test('WB is visible to ID on the same cycle',()=>{
  const p=run([addi(1,0,17),nop(),nop(),addi(2,1,4)]);assert.equal(p.registers[2],21);assert.equal(p.trace.find(t=>t.ex===12)!.selectA,0);
});
test('redirect has priority over a simultaneous younger load dependency',()=>{
  assert.deepEqual(interlock(addi(2,1,0),{op:'lw',rd:1,rs1:0},true),{stall:false,enable:true,clearIF:true,clearEX:true});
});
test('LUI, AUIPC and JAL produce correct architectural values',()=>{
  const p=run([{op:'lui',rd:1,imm:0x12000},{op:'auipc',rd:2,imm:0x1000},{op:'jal',rd:5,imm:8},addi(1,0,99),{op:'add',rd:3,rs1:1,rs2:2}]);assert.equal(p.registers[1],0x12000);assert.equal(p.registers[2],0x1004);assert.equal(p.registers[5],12);assert.equal(p.registers[3],0x13004);
});
test('a not-ready newer load cannot select stale older WB data',()=>{
  assert.equal(chooseForward(1,true,{valid:true,write:true,load:true,rd:1,value:80},{valid:true,write:true,load:false,rd:1,value:4}),0);
});
test('deleting the store-data branch is detected by value reachability',()=>{
  const d=rv32i();d.nets.find(n=>n.id==='forwarded-b')!.sinks=d.nets.find(n=>n.id==='forwarded-b')!.sinks.filter(s=>s!=='exmem.store_d');
  assert.throws(()=>runPipeline(d,[addi(1,0,7),{op:'sw',rs1:0,rs2:1,imm:64}]),/exmem.store_d/);
});
