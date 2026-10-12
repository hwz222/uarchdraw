import { width,type Design, type Instance, type Net, type Pin, type Signal } from '../../model.js';
const bit=(bits=32):Signal=>({bits});
const fetch:Signal={fields:{instruction:32,valid:1}};
export const control:Signal={fields:{valid:1,RegWrite:1,MemRead:1,MemWrite:1,resultSel:2,aluOp:4,srcA:2,srcB:1,branch:3,jump:2,funct3:3}};
export const indices:Signal={fields:{rs1:5,rs2:5,rd:5,usesRs1:1,usesRs2:1}};
export const status:Signal={fields:{valid:1,RegWrite:1,MemRead:1,rd:5}};
const p=(id:string,direction:'in'|'out',type:Signal=bit(),side:'left'|'right'|'top'|'bottom'=direction==='in'?'left':'right',label=id,offset?:number):Pin=>({id,direction,type,side,label,...offset!==undefined?{offset}:{}});
const instances:Instance[]=[];
const add=(id:string,label:string,kind:Instance['kind'],stage:string,column:number,row:number,pins:Pin[],extra:Partial<Instance>={})=>instances.push({id,label,kind,stage,column,row,pins,...extra});
const pipe=(id:string,label:string,stage:string,column:number,fields:[string,Signal,number][],controls:Pin[]=[])=>add(id,label,'pipeline',stage,column,0,fields.flatMap<Pin>(([key,type,row])=>[
  {...p(`${key}_d`,'in',type,'left',key),row},{...p(`${key}_q`,'out',type,'right',key),row}
]).concat(controls),{span:6,operation:'pipeline-register'});
const nets:Net[]=[];
const net=(id:string,source:string,sinks:string[],extra:Partial<Net>={})=>nets.push({id,source,sinks,...extra});

export function rv32i():Design {
  // Fresh data each call: layout must never leak geometry back into this fixture.
  instances.length=0; nets.length=0;
  add('npc','Next PC','mux','IF',0,2,[p('seq','in',bit(),'left','0'),p('target','in',bit(),'left','1'),p('select','in',bit(1),'top','redirect'),p('out','out')]);
  add('pc','PC','register','IF',0,3,[p('d','in'),p('q','out'),p('enable','in',bit(1),'top','en')]);
  add('inc','+4','adder','IF',1,1,[p('pc','in'),p('out','out')],{operation:'add4'});
  add('imem','Instruction\nmemory','block','IF',1,3,[p('address','in',bit(),'left','addr'),p('instruction','out',fetch,'right','inst / V')]);
  pipe('ifid','IF / ID','IF',2,[['pc',bit(),1],['pc4',bit(),2],['inst',fetch,3]],
    [p('enable','in',bit(1),'top','en',.25),p('clear','in',bit(1),'top','clr',.75)]);
  add('hazard','Hazard / flush','block','ID',0,0,[p('decode','in',indices,'left','ID'),p('execute','in',status,'bottom','EX'),p('redirect','in',bit(1),'top','redirect'),p('hold','out',bit(1),'top','hold'),p('clearIF','out',bit(1),'right','IF clr'),p('clearEX','out',bit(1),'right','EX clr')],{notes:['redirect > stall'],operation:'hazard'});
  add('decode','Decode','block','ID',0,1,[p('inst','in',fetch),p('ctl','out',control,'right','control'),p('regs','out',indices,'bottom','indices'),p('rs1','out',bit(5),'left','rs1'),p('rs2','out',bit(5),'left','rs2')]);
  add('rf','Register file','block','ID',0,3,[p('rs1','in',bit(5),'left','rs1'),p('rs2','in',bit(5),'left','rs2'),p('rd','in',status,'bottom','rd / we'),p('data','in',bit(),'bottom','write'),p('a','out',bit(),'right','read 1'),p('b','out',bit(),'right','read 2')],{span:2,notes:['32 x 32   /   x0 = 0','WB → ID read-through'],operation:'register-file'});
  add('imm','Immediate','block','ID',0,5,[p('inst','in',fetch),p('out','out')],{notes:['I / S / B / U / J']});
  pipe('idex','ID / EX','ID',1,[['ctl',control,0],['pc',bit(),1],['a',bit(),2],['pc4',bit(),3],['b',bit(),4],['imm',bit(),5]],
    [p('regs_d','in',indices,'bottom','rs / rd',.25),p('regs_q','out',indices,'bottom','rs / rd',.75),p('clear','in',bit(1),'top','bubble'),p('status','out',status,'top','status')]);
  add('forward','Forward control','block','EX',0,0,[p('regs','in',indices,'left','rs1 / rs2'),p('mem','in',status,'bottom','MEM'),p('wb','in',status,'bottom','WB'),p('a','out',bit(2),'right','sel A'),p('b','out',bit(2),'right','sel B')],{notes:['MEM > WB; rd ≠ 0','valid + write + ready'],operation:'forward-control'});
  for(const [id,row] of [['fa',2],['fb',4]] as const) add(id,id==='fa'?'Fwd A':'Fwd B','mux','EX',0,row,[p('original','in',bit(),'left','0',.2),p('mem','in',bit(),'left','1',.5),p('wb','in',bit(),'left','2',.8),p('sel','in',bit(2),'top','sel'),p('out','out')],{operation:'forward-mux'});
  add('branch','Branch compare','block','EX',1,0,[p('a','in',bit(),'left','A'),p('b','in',bit(),'left','B'),p('ctl','in',control,'top','branch / jump'),p('taken','out',bit(1),'top','redirect')],{notes:['BEQ / BNE / BLT ...'],operation:'branch'});
  add('target','Target + / mask','block','EX',1,1,[p('pc','in',bit(),'left','PC'),p('rs1','in',bit(),'left','rs1'),p('imm','in',bit(),'bottom','imm'),p('ctl','in',control,'top','JALR'),p('out','out',bit(),'top','target')],{notes:['PC or rs1 + imm','JALR: clear bit 0'],operation:'target'});
  add('sa','ALU A','mux','EX',1,2,[p('reg','in',bit(),'left','rs1',.2),p('pc','in',bit(),'left','PC',.5),p('zero','in',bit(),'left','0',.8),p('ctl','in',control,'top','src A'),p('out','out')]);
  add('zero','0','block','EX',0,3,[p('out','out')],{operation:'constant-zero'});
  add('sb','ALU B','mux','EX',1,4,[p('reg','in',bit(),'left','rs2'),p('imm','in',bit(),'left','imm'),p('ctl','in',control,'top','src B'),p('out','out')]);
  add('alu','ALU','alu','EX',2,3,[p('a','in',bit(),'left','A',.2),p('b','in',bit(),'left','B',.8),p('ctl','in',control,'top','op'),p('out','out')],{operation:'alu'});
  pipe('exmem','EX / MEM','EX',3,[['ctl',control,0],['pc4',bit(),2],['alu',bit(),3],['store',bit(),4]],
    [p('regs_d','in',indices,'bottom','rd'),p('status','out',status,'bottom','status')]);
  add('ready','Ready','mux','MEM',0,1,[p('alu','in',bit(),'left','ALU'),p('pc4','in',bit(),'left','link'),p('ctl','in',control,'top','result'),p('out','out',bit(),'bottom','MEM value')],{operation:'ready-result'});
  add('dmem','Data memory','block','MEM',0,3,[p('address','in',bit(),'left','addr'),p('write','in',{fields:{data:32,mask:4}},'bottom','data / mask'),p('ctl','in',control,'top','R / W'),p('read','out',bit(),'right','read')]);
  add('store','Store lanes','block','MEM',0,4,[p('data','in',bit(),'left','store data'),p('address','in',bit(),'left','addr'),p('ctl','in',control,'top','size'),p('out','out',{fields:{data:32,mask:4}},'right','data / mask')],{notes:['SB / SH / SW']});
  add('load','Load extend','block','MEM',0,5,[p('data','in',bit(),'left','read'),p('address','in',bit(),'left','addr'),p('ctl','in',control,'top','size / sign'),p('out','out')],{notes:['LB / LH / LW / LBU / LHU']});
  pipe('memwb','MEM / WB','MEM',1,[['ctl',control,0],['ready',bit(),2],['load',bit(),5]],
    [p('status_d','in',status,'bottom','rd / we',.25),p('status_q','out',status,'bottom','rd / we',.75)]);
  add('wb','WB','mux','WB',0,3,[p('ready','in',bit(),'left','ready'),p('load','in',bit(),'left','load'),p('ctl','in',control,'top','result'),p('out','out',bit(),'bottom','WB value')],{operation:'writeback'});

  net('next-pc','npc.out',['pc.d']);
  net('pc','pc.q',['imem.address','inc.pc','ifid.pc_d']);
  net('pc-plus-four','inc.out',['npc.seq','ifid.pc4_d']);
  net('instruction','imem.instruction',['ifid.inst_d']);
  net('id-instruction','ifid.inst_q',['decode.inst','imm.inst']);
  net('id-pc','ifid.pc_q',['idex.pc_d']); net('id-pc4','ifid.pc4_q',['idex.pc4_d']);
  net('decoded-control','decode.ctl',['idex.ctl_d'],{style:'control'});
  net('decoded-registers','decode.regs',['hazard.decode','idex.regs_d'],{style:'control'});
  net('read-address-a','decode.rs1',['rf.rs1'],{style:'control'}); net('read-address-b','decode.rs2',['rf.rs2'],{style:'control'});
  net('read-a','rf.a',['idex.a_d']); net('read-b','rf.b',['idex.b_d']); net('immediate','imm.out',['idex.imm_d']);
  net('execute-control','idex.ctl_q',['branch.ctl','target.ctl','sa.ctl','sb.ctl','alu.ctl','exmem.ctl_d'],{style:'control'});
  net('execute-registers','idex.regs_q',['forward.regs','exmem.regs_d'],{style:'control'});
  net('execute-status','idex.status',['hazard.execute'],{style:'control'});
  net('ex-pc','idex.pc_q',['sa.pc','target.pc']); net('ex-pc4','idex.pc4_q',['exmem.pc4_d']);
  net('operand-a','idex.a_q',['fa.original']); net('operand-b','idex.b_q',['fb.original']);
  net('ex-immediate','idex.imm_q',['sb.imm','target.imm']); net('zero','zero.out',['sa.zero']);
  net('forwarded-a','fa.out',['sa.reg','branch.a','target.rs1'],{label:'rs1'});
  net('forwarded-b','fb.out',['sb.reg','branch.b','exmem.store_d'],{label:'store data'});
  net('alu-a','sa.out',['alu.a']); net('alu-b','sb.out',['alu.b']); net('alu-result','alu.out',['exmem.alu_d']);
  net('select-a','forward.a',['fa.sel'],{style:'control'}); net('select-b','forward.b',['fb.sel'],{style:'control'});
  net('memory-control','exmem.ctl_q',['ready.ctl','dmem.ctl','store.ctl','load.ctl','memwb.ctl_d'],{style:'control'});
  net('memory-status','exmem.status',['forward.mem','memwb.status_d'],{style:'control',corridor:'bottom',label:'MEM: valid / rd / write / load'});
  net('memory-address','exmem.alu_q',['ready.alu','dmem.address','store.address','load.address']);
  net('memory-link','exmem.pc4_q',['ready.pc4']); net('store-data','exmem.store_q',['store.data']);
  net('store-lanes','store.out',['dmem.write']); net('memory-read','dmem.read',['load.data']); net('load-result','load.out',['memwb.load_d']);
  net('mem-forward','ready.out',['fa.mem','fb.mem','memwb.ready_d'],{style:'forward',corridor:'bottom',label:'1  MEM bypass (loads excluded)'});
  net('wb-ready','memwb.ready_q',['wb.ready']); net('wb-load','memwb.load_q',['wb.load']); net('wb-control','memwb.ctl_q',['wb.ctl'],{style:'control'});
  net('wb-value','wb.out',['fa.wb','fb.wb','rf.data'],{style:'writeback',corridor:'bottom',label:'2  WB value / register writeback'});
  net('wb-status','memwb.status_q',['forward.wb','rf.rd'],{style:'control',corridor:'bottom',label:'WB: valid / rd / write'});
  net('redirect','branch.taken',['npc.select','hazard.redirect'],{style:'control',corridor:'top',label:'redirect: taken branch / JAL / JALR'});
  net('redirect-target','target.out',['npc.target'],{corridor:'top',label:'redirect target'});
  net('hold','hazard.hold',['pc.enable','ifid.enable'],{style:'control',corridor:'top',label:'PC / IF-ID enable = !stall OR redirect'});
  net('clear-if','hazard.clearIF',['ifid.clear'],{style:'control',corridor:'top',label:'flush IF/ID'});
  net('clear-ex','hazard.clearEX',['idex.clear'],{style:'control',corridor:'top',label:'flush or load-use bubble'});
  const node=(id:string)=>instances.find(i=>i.id===id)!;
  const pin=(ref:string)=>{const [id,p]=ref.split('.');return node(id!).pins.find(x=>x.id===p)!;};
  // Architectural alignment constraints keep the register operands horizontal.
  node('rf').row=2;node('rf').span=3;
  for(const [id,offset] of [['rs1',.2],['rs2',.4],['rd',.7],['data',.9]] as const){pin('rf.'+id).side='left';pin('rf.'+id).offset=offset;}
  pin('decode.regs').side='left';pin('decode.regs').offset=.9;
  for(const [id,offset] of [['rs1',.25],['rs2',.75]] as const){pin('decode.'+id).side='bottom';pin('decode.'+id).offset=offset;}
  for(const [id,offset] of [['rs1',1/3],['rs2',2/3]] as const){pin('rf.'+id).side='top';pin('rf.'+id).offset=offset;}
  node('forward').row=6;
  for(const ref of ['forward.a','forward.b'])pin(ref).side='top';
  for(const ref of ['fa.sel','fb.sel'])pin(ref).side='bottom';
  for(const ref of ['fa.original','fb.original'])pin(ref).offset=1/3;
  for(const id of ['fa','fb']){pin(id+'.mem').offset=.6;pin(id+'.wb').offset=.85;}
  pin('sa.pc').offset=.2;pin('sa.reg').offset=.5;pin('sb.reg').offset=.5;pin('sb.imm').offset=.8;
  for(const suffix of ['d','q']){pin('ifid.pc_'+suffix).row=0;pin('ifid.pc_'+suffix).offset=.8;pin('ifid.pc4_'+suffix).row=0;pin('ifid.pc4_'+suffix).offset=.95;}
  for(const [a,b] of [
    ['idex.pc_d','ifid.pc_q'],['idex.pc_q','ifid.pc_q'],
    ['idex.pc4_d','ifid.pc4_q'],['idex.pc4_q','ifid.pc4_q'],['exmem.pc4_d','idex.pc4_q'],['exmem.pc4_q','idex.pc4_q'],
    ['rf.a','fa.original'],['rf.b','fb.original'],
    ['idex.a_d','fa.original'],['idex.a_q','fa.original'],['idex.b_d','fb.original'],['idex.b_q','fb.original'],
    ['idex.imm_d','imm.out'],['idex.imm_q','imm.out'],
    ['ifid.inst_d','imem.instruction'],['ifid.inst_q','imem.instruction'],
    ['memwb.load_d','load.out'],['memwb.load_q','load.out']])pin(a!).align=b!;
  node('pc').align={pin:'q',with:'imem.address'};
  node('alu').align={pin:'out',with:'exmem.alu_d'};
  node('dmem').align={pin:'address',with:'exmem.alu_q'};
  pin('ready.out').side='right';
  pin('store.out').side='top';pin('store.out').offset=.5;pin('store.ctl').offset=.15;
  pin('memwb.ready_d').align='ready.out';pin('memwb.ready_q').align='ready.out';
  const names=['PCNext','PC_F','PC4_F','Instr_F','Instr_D','PC_D','PC4_D','Ctrl_D','Idx_D','Rs1_D','Rs2_D','Read1_D','Read2_D','Imm_D',
    'Ctrl_E','Idx_E','Haz_E','PC_E','PC4_E','OpA_E','OpB_E','Imm_E','Zero','FwdA_E','FwdB_E','ALU_A','ALU_B','ALU_E','ForwardA','ForwardB',
    'Ctrl_M','Status_M','Addr_M','PC4_M','Store_M','WrBus','Read_M','Load_M','Bypass_M','Ready_W','Load_W','Ctrl_W','Result_W','Status_W',
    'Redirect','Target_E','PCWrite','IFIDFlush','IDEXClear'];
  const descriptions=[
    "Next PC: select PC+4 or the redirect target computed in EX.",
    "Current IF-stage PC, sent to instruction memory, the incrementer and IF/ID.",
    "IF-stage PC+4 for sequential fetch and the JAL/JALR link value.",
    "Fetched 32-bit instruction and its valid bit.",
    "ID-stage instruction and valid bit, sent to the decoder and immediate generator.",
    "Instruction PC in the ID stage.",
    "PC+4 in the ID stage.",
    "Decoded control bundle, captured by ID/EX.",
    "rs1, rs2, rd and source-use flags for hazard detection and pipeline propagation.",
    "First register-file read address: rs1.",
    "Second register-file read address: rs2.",
    "Value read from rs1 in ID.",
    "Value read from rs2 in ID.",
    "32-bit immediate decoded from the I/S/B/U/J instruction formats.",
    "EX control bundle for branches, jumps, ALU operands and operations; also passed to MEM.",
    "EX register indices and source-use flags for forwarding comparisons and rd propagation.",
    "EX status used by the hazard unit to detect load-use dependencies.",
    "EX-stage instruction PC for AUIPC and PC-relative targets.",
    "EX-stage PC+4 for JAL/JALR writeback.",
    "Original rs1 value entering EX.",
    "Original rs2 value entering EX.",
    "EX immediate for ALU B selection and redirect-target calculation.",
    "Constant zero used by LUI.",
    "Forwarded rs1 value for ALU A, branch comparison and the JALR target.",
    "Forwarded rs2 value for ALU B, branch comparison and store data.",
    "Final ALU A operand: rs1, PC or zero.",
    "Final ALU B operand: rs2 or the immediate.",
    "EX ALU result, also used as the effective load/store address.",
    "Forward A selection: 0=original, 1=MEM, 2=WB; MEM has priority.",
    "Forward B selection: 0=original, 1=MEM, 2=WB; MEM has priority.",
    "MEM control bundle for memory access, width, load extension and result selection.",
    "MEM valid, RegWrite, MemRead and rd for forwarding decisions and propagation to WB.",
    "MEM ALU result/address for the ready result, data memory and byte-lane selection.",
    "MEM-stage PC+4 for the JAL/JALR link value.",
    "Forwarded store data captured by EX/MEM.",
    "Aligned 32-bit store data and four byte-mask bits.",
    "32-bit data read from data memory.",
    "Load result after byte/halfword selection and sign or zero extension.",
    "Forwardable MEM ALU or PC+4 result; a load address is not load data.",
    "ALU/PC+4 result available for WB selection.",
    "Load result available for WB selection.",
    "WB control bundle selecting the final writeback value.",
    "Final WB value, returned to the register file and both forwarding MUXes.",
    "WB valid, RegWrite, MemRead and rd for forwarding and register-file write control.",
    "Taken EX branch or JAL/JALR: redirect instruction fetch and request a flush.",
    "Target calculated in EX; JALR clears bit 0.",
    "PC and IF/ID enable = !stall OR redirect.",
    "Clear IF/ID valid on a redirect.",
    "Clear ID/EX valid on a redirect or load-use dependency, inserting a bubble."
  ];
  if(names.length!==nets.length||descriptions.length!==nets.length)throw new Error('Missing RV32I signal documentation');
  nets.forEach((n,j)=>{const type=pin(n.source).type;n.label=`${names[j]}${'fields' in type?'{'+width(type)+'}':'/'+width(type)}`;n.description=descriptions[j];});
  return structuredClone({version:1,title:'RV32I · five-stage pipeline',subtitle:'EX resolves branches and jumps · forwarding + one-cycle load-use interlock',stages:['IF','ID','EX','MEM','WB'],instances,nets,
    notes:['Name/N = N-bit signal; Name{N} = typed bundle. F / D / E / M / W = pipeline stage. Dot = connection; gap = crossing.',
      '0 = register operand   1 = MEM ready result   2 = WB result; MEM wins when both match.',
      'Load-use: freeze PC + IF/ID, bubble ID/EX. Redirect: flush IF/ID + ID/EX; redirect wins over stall.',
      'Separate zero-wait memories. EX forwards store data; load → store stalls once. WB is visible to ID in the same cycle.',
      'Datapath teaching profile. FENCE / ECALL / EBREAK and execution-environment traps are outside this diagram.']});
}
