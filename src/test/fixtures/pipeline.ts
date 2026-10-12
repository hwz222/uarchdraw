/** Executable teaching-profile witness, not an ISA-compliance simulator.
 * Values enter functional units through the diagram's actual nets. */
import type { Design } from '../../model.js';
export interface Instruction { op:'add'|'addi'|'sub'|'lui'|'auipc'|'lw'|'sw'|'beq'|'jal'|'jalr'; rd?:number; rs1?:number; rs2?:number; imm?:number }
interface Slot { inst:Instruction; pc:number; a:number; b:number; result:number; store:number; target:number; pc4:number }
interface Candidate { valid:boolean; write:boolean; load:boolean; rd:number; value:number }
export interface Cycle { cycle:number; ex?:number; stall:boolean; redirect:boolean; selectA:number; selectB:number; a:number;b:number;wb?:{rd:number;value:number} }
const uses1=(i:Instruction)=>!['lui','auipc','jal'].includes(i.op);
const uses2=(i:Instruction)=>['add','sub','sw','beq'].includes(i.op);
const writes=(i:Instruction)=>!['sw','beq'].includes(i.op);
export function chooseForward(rs:number,used:boolean,mem:Candidate,wb:Candidate):0|1|2 {
  if(!used||rs===0)return 0;
  if(mem.valid&&mem.write&&mem.rd!==0&&mem.rd===rs)return mem.load?0:1;
  return wb.valid&&wb.write&&wb.rd!==0&&wb.rd===rs?2:0;
}
export function interlock(id:Instruction|undefined,ex:Instruction|undefined,redirect:boolean){
  const stall=!!id&&!!ex&&ex.op==='lw'&&(ex.rd??0)!==0&&
    ((uses1(id)&&id.rs1===ex.rd)||(uses2(id)&&id.rs2===ex.rd));
  return {stall:stall&&!redirect,enable:redirect||!stall,clearIF:redirect,clearEX:redirect||stall};
}
export function runPipeline(design:Design,program:Instruction[],memory:Record<number,number>={},initial:Record<number,number>={}):{registers:number[];memory:Record<number,number>;trace:Cycle[]} {
  const drivers=new Map(design.nets.flatMap(n=>n.sinks.map(s=>[s,n.source] as const)));
  const values=new Map<string,unknown>();
  const read=<T>(pin:string):T=>{const source=drivers.get(pin);if(!source||!values.has(source))throw new Error(`Diagram has no driven path into ${pin} (source: ${source})`);return values.get(source) as T;};
  const put=(pin:string,v:unknown)=>values.set(pin,v);
  const r=Array<number>(32).fill(0);for(const [k,v] of Object.entries(initial))r[Number(k)]=v|0;r[0]=0;
  const mem={...memory},trace:Cycle[]=[];let pc=0,id:Slot|undefined,ex:Slot|undefined,m:Slot|undefined,wb:Slot|undefined;
  const candidate=(s:Slot|undefined):Candidate=>({valid:!!s,write:!!s&&writes(s.inst),load:s?.inst.op==='lw',rd:s?.inst.rd??0,value:s?.result??0});
  const empty:Candidate={valid:false,write:false,load:false,rd:0,value:0};
  for(let cycle=0;cycle<150;cycle++){
    values.clear();let committed:Cycle['wb'];
    const wc=candidate(wb);put('memwb.ready_q',wc.value);put('memwb.load_q',wc.value);put('memwb.ctl_q',wb?.inst.op==='lw');
    put('wb.out',read<boolean>('wb.ctl')?read<number>('wb.load'):read<number>('wb.ready'));put('memwb.status_q',wc);
    const writeStatus=read<Candidate>('rf.rd'),writeValue=read<number>('rf.data');
    if(writeStatus.valid&&writeStatus.write&&writeStatus.rd){r[writeStatus.rd]=writeValue|0;committed={rd:writeStatus.rd,value:writeValue|0};}
    const nextWB=m?{...m}:undefined;
    if(m){
      put('exmem.alu_q',m.result);put('exmem.store_q',m.store);put('store.out',read<number>('store.data'));
      const address=read<number>('dmem.address');
      if(m.inst.op==='sw')mem[address]=read<number>('dmem.write')|0;
      if(m.inst.op==='lw'){put('dmem.read',mem[address]??0);put('load.out',read<number>('load.data'));nextWB!.result=read<number>('memwb.load_d');}
    }
    const mc=candidate(m);put('exmem.status',mc);put('exmem.alu_q',m?.result??0);put('exmem.pc4_q',m?.pc4??0);put('exmem.ctl_q',m?.inst.op==='jal'||m?.inst.op==='jalr');
    put('ready.out',read<boolean>('ready.ctl')?read<number>('ready.pc4'):read<number>('ready.alu'));
    if(nextWB&&m?.inst.op!=='lw')nextWB.result=read<number>('memwb.ready_d');
    put('idex.regs_q',ex?.inst);put('idex.status',candidate(ex));put('decode.regs',id?.inst);
    const fInst=read<Instruction|undefined>('forward.regs');
    const aSel=chooseForward(fInst?.rs1??0,!!fInst&&uses1(fInst),read<Candidate>('forward.mem')??empty,read<Candidate>('forward.wb')??empty);
    const bSel=chooseForward(fInst?.rs2??0,!!fInst&&uses2(fInst),read<Candidate>('forward.mem')??empty,read<Candidate>('forward.wb')??empty);
    put('forward.a',aSel);put('forward.b',bSel);put('idex.a_q',ex?.a??0);put('idex.b_q',ex?.b??0);
    for(const mux of ['fa','fb']){const sel=read<number>(mux+'.sel'),input=['original','mem','wb'][sel]!;put(mux+'.out',read<number>(mux+'.'+input));}
    const a=read<number>('sa.reg'),b=read<number>('sb.reg');
    let nextM=ex?{...ex}:undefined,redirect=false,target=0;
    if(ex){
      const i=ex.inst,imm=i.imm??0;
      put('idex.pc_q',ex.pc);put('idex.imm_q',imm);put('zero.out',0);
      put('sa.out',i.op==='lui'?read<number>('sa.zero'):i.op==='auipc'?read<number>('sa.pc'):a);
      put('sb.out',['addi','lw','sw','lui','auipc'].includes(i.op)?read<number>('sb.imm'):b);
      const aa=read<number>('alu.a'),bb=read<number>('alu.b');
      put('alu.out',(i.op==='sub'?aa-bb:aa+bb)|0);nextM!.result=read<number>('exmem.alu_d');nextM!.store=read<number>('exmem.store_d');
      put('idex.pc4_q',ex.pc4);nextM!.pc4=read<number>('exmem.pc4_d');
      redirect=i.op==='jal'||i.op==='jalr'||(i.op==='beq'&&read<number>('branch.a')===read<number>('branch.b'));
      target=((i.op==='jalr'?read<number>('target.rs1'):read<number>('target.pc'))+read<number>('target.imm'))|0;if(i.op==='jalr')target&=~1;
    }
    put('branch.taken',redirect);put('target.out',target);
    const es=read<Candidate>('hazard.execute');
    const hz=interlock(read<Instruction|undefined>('hazard.decode'),es.valid?{op:es.load?'lw':'add',rd:es.rd}:undefined,read<boolean>('hazard.redirect'));
    put('hazard.hold',hz.enable);put('hazard.clearIF',hz.clearIF);put('hazard.clearEX',hz.clearEX);
    const bubble=read<boolean>('idex.clear'),flush=read<boolean>('ifid.clear');
    let nextEX:Slot|undefined;
    if(id&&!bubble){put('rf.a',r[id.inst.rs1??0]!);put('rf.b',r[id.inst.rs2??0]!);nextEX={...id,a:read<number>('idex.a_d'),b:read<number>('idex.b_d')};}
    if(read<boolean>('npc.select'))pc=read<number>('npc.target');
    let nextID=id;
    if(flush)nextID=undefined;
    else if(read<boolean>('ifid.enable')){
      const inst=program[pc/4];nextID=inst?{inst,pc,pc4:pc+4,a:0,b:0,result:0,store:0,target:0}:undefined;
      if(read<boolean>('pc.enable'))pc+=4;
    }
    trace.push({cycle,ex:ex?.pc,stall:hz.stall,redirect,selectA:aSel,selectB:bSel,a,b,wb:committed});
    wb=nextWB;m=nextM;ex=nextEX;id=nextID;r[0]=0;
    if(pc/4>=program.length&&!id&&!ex&&!m&&!wb)return {registers:r,memory:mem,trace};
  }
  throw new Error('Pipeline witness did not drain in 150 cycles');
}
