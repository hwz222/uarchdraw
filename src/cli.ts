#!/usr/bin/env node
import { mkdirSync,writeFileSync,readFileSync,watchFile,unwatchFile } from 'node:fs';
import { basename,dirname,extname,resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Resvg } from '@resvg/resvg-js';
import { compile,DiagramError } from './compile.js';
import { svg } from './svg.js';
import { fontPath } from './font.js';
import { parseUarch,formatUarch } from './dsl.js';
import { inspector,signalTable } from './inspect.js';
import type { Design } from './model.js';
import { createView } from './views.js';

const help=`UarchDraw — text to microarchitecture diagrams

Usage:
  uarchdraw render INPUT.uarch [-o OUTPUT_PREFIX] [--svg-only | --png-only] [--overview | --focus GROUP]
  uarchdraw check INPUT.uarch [--overview | --focus GROUP]
  uarchdraw watch INPUT.uarch [-o OUTPUT_PREFIX]
  uarchdraw init OUTPUT.uarch [--template starter|selector|arbiter|fifo|hierarchy]
  uarchdraw --version

Input: .uarch (uarch 1 or uarch 2), or version-1 design JSON.
Default output prefix: output/<input-name>
Render writes SVG, 2400px PNG, grayscale previews, an offline HTML signal
inspector, a signal index, geometry audit, layout JSON and canonical source.
Check validates the circuit and rendered geometry without writing files.
`;

async function main(){
  const {values,positionals}=parseArgs({options:{help:{type:'boolean',short:'h'},version:{type:'boolean',short:'v'},output:{type:'string',short:'o'},'svg-only':{type:'boolean'},'png-only':{type:'boolean'},overview:{type:'boolean'},focus:{type:'string'},'no-adaptive':{type:'boolean'},template:{type:'string'}},allowPositionals:true});
  if(values.help||(!positionals.length&&!values.version)){console.log(help);return;}
  if(values.version){const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));console.log(`uarchdraw ${pkg.version}`);return;}
  const [command,input,...extra]=positionals;
  if(!['render','check','watch','init'].includes(command??'')||!input||extra.length)throw new Error('Expected: uarchdraw render|check|watch|init INPUT.uarch (use --help for options)');
  if(values.template&&command!=='init')throw new Error('--template belongs to init');
  if(values['svg-only']&&values['png-only'])throw new Error('Choose either --svg-only or --png-only');
  if(command==='check'&&(values.output||values['svg-only']||values['png-only']))throw new Error('check does not accept output options');
  const extension=extname(input).toLowerCase();
  if(!['.uarch','.json'].includes(extension))throw new Error('Expected a .uarch source or .json design');
  if(command==='init'){
    if(extension!=='.uarch')throw new Error('init requires a .uarch output');
    if(values.output||values['svg-only']||values['png-only']||values.overview||values.focus||values['no-adaptive'])throw new Error('init accepts only --template');
    const template=values.template??'starter';
    const files:Record<string,string>={selector:'11-automatic-selector',arbiter:'12-automatic-arbiter',fifo:'13-automatic-fifo',hierarchy:'14-hierarchical-datapath'};
    const starter='uarch 2\nparam W = 32\ntitle "My first datapath"\n\nblock compute {\n  label "Compute"\n  out result: bits(W)\n}\nblock latch: register(W) { label "Result register" }\nconnect compute.result -> latch.d\n';
    if(template!=='starter'&&!Object.hasOwn(files,template))throw new Error('Unknown template; choose starter, selector, arbiter, fifo or hierarchy');
    const text=template==='starter'?starter:readFileSync(new URL('../examples/'+files[template]+'.uarch',import.meta.url),'utf8');
    mkdirSync(dirname(resolve(input)),{recursive:true});writeFileSync(resolve(input),text,{flag:'wx'});
    console.log('Created '+input+'; run uarchdraw watch '+input+' to rebuild on save.');return;
  }
  const render=async()=>{
    const source=readFileSync(resolve(input),'utf8');
    let design:Design=extension==='.uarch'?await parseUarch(source,input):JSON.parse(source);
    if(values.overview||values.focus)design=await createView(design,{overview:values.overview,focus:values.focus});
    const out=resolve(values.output??`output/${basename(input,extname(input))}`).replace(/\.(svg|png)$/i,'');
    let result:ReturnType<typeof compile>;
    try{result=compile(design,{adaptive:values['no-adaptive']?false:undefined});}catch(error){
      if(command!=='check'&&error instanceof DiagramError){
        mkdirSync(dirname(out),{recursive:true});writeFileSync(out+'.rejected.svg',error.drawing);
        writeFileSync(out+'.diagnostic.json',JSON.stringify({error:error.message,audit:error.audit,layout:error.layout},null,2));
      }
      throw error;
    }
    const {layout,drawing,audit,planning}=result;
    if(command==='check'){console.log(JSON.stringify(audit,null,2));return;}
    mkdirSync(dirname(out),{recursive:true});
    for(const gray of [false,true]){
      const image=gray?svg(design,layout,true):drawing,stem=out+(gray?'-gray':'');
      if(!values['png-only'])writeFileSync(stem+'.svg',image);
      if(!values['svg-only'])writeFileSync(stem+'.png',new Resvg(image,{font:{fontFiles:[fontPath],loadSystemFonts:false},fitTo:{mode:'width',value:2400}}).render().asPng());
    }
    writeFileSync(out+'.html',inspector(design,layout,drawing));
    writeFileSync(out+'.signals.md',signalTable(design,layout));
    writeFileSync(out+'.qa.json',JSON.stringify(audit,null,2));
    writeFileSync(out+'.planning.json',JSON.stringify(planning,null,2));
    writeFileSync(out+'.layout.json',JSON.stringify(layout,null,2));
    const canonical=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
    if(canonical(input)!==canonical(out+'.json'))writeFileSync(out+'.json',JSON.stringify(design,null,2));
    if(canonical(input)!==canonical(out+'.uarch'))writeFileSync(out+'.uarch',formatUarch(design));
    console.log(`UarchDraw: ${audit.metrics.symbols} symbols, ${audit.metrics.nets} named nets, ${audit.metrics.crossings} crossings`);
    if(planning.expanded)console.log(`Automatically expanded spacing in ${planning.attempts} planning attempts.`);
    console.log(`Wrote verified diagram: ${out}`);
  };
  if(command==='watch'){
    let timer:ReturnType<typeof setTimeout>|undefined,queue=Promise.resolve();
    const refresh=()=>{queue=queue.then(render).catch(error=>{console.error('uarchdraw: '+(error instanceof Error?error.message:String(error)));});};
    watchFile(resolve(input),{interval:250},()=>{if(timer)clearTimeout(timer);timer=setTimeout(refresh,120);});
    process.once('SIGINT',()=>{unwatchFile(resolve(input));if(timer)clearTimeout(timer);process.exit(0);});
    refresh();await queue;console.log('Watching '+input+'; save to rebuild, Ctrl+C to stop.');
  }else await render();
}
main().catch(error=>{console.error(`uarchdraw: ${error instanceof Error?error.message:error}`);process.exitCode=1;});
