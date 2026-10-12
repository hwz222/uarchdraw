// Render the exact lesson checkpoints and solutions through the installed-style CLI.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseUarch,createView,compile} from '../dist/index.js';
import {root,directory,course,checkpoints,readSource,viewFlags,verifyCheckpoint} from './tutorial-support.mjs';

mkdirSync(resolve(directory,'images'),{recursive:true});
const cases=[];
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
for(const entry of checkpoints){
  const source=readSource(entry),parsed=await parseUarch(source,entry.source);
  const design=entry.view?await createView(parsed,entry.view):parsed;
  const result=compile(design);
  verifyCheckpoint(design,result,entry);
  const name='tutorial-'+entry.id,prefix=resolve(root,'output',name);
  const rendered=spawnSync(process.execPath,['dist/cli.js','render',resolve(directory,entry.source),'-o',prefix,...viewFlags(entry)],{cwd:root,encoding:'utf8'});
  if(rendered.status!==0)throw new Error(rendered.stderr||rendered.stdout);
  copyFileSync(prefix+'.png',resolve(directory,'images',entry.id+'.png'));
  cases.push({name,id:entry.id,source:entry.source,...(entry.view?{view:entry.view}:{}),
    geometry:result.audit,planning:result.planning,width:result.layout.width,height:result.layout.height,
    sha256:{source:createHash('sha256').update(source).digest('hex'),png:hash(prefix+'.png'),grayPng:hash(prefix+'-gray.png'),svg:hash(prefix+'.svg')}});
  console.log(`${entry.id}: ${result.audit.metrics.symbols} symbols, ${result.audit.metrics.nets} nets`);
}
for(const lesson of course.lessons)for(const entry of lesson.errors){
  const checked=spawnSync(process.execPath,['dist/cli.js','check',resolve(directory,entry.source),...entry.flags],{cwd:root,encoding:'utf8'});
  if(checked.status!==1||!checked.stderr.includes(entry.expected))throw new Error(`${entry.id}: expected rejection containing ${entry.expected}; got ${checked.stderr||checked.stdout}`);
}
writeFileSync(resolve(root,'output/tutorial-results.json'),JSON.stringify({cases},null,2)+'\n');
const docs=spawnSync(process.execPath,['scripts/write-tutorial-docs.mjs'],{cwd:root,stdio:'inherit'});
if(docs.status!==0)throw new Error('Lesson documentation generation failed');
console.log(`${cases.length} checkpoint/solution images and ${course.lessons.reduce((n,l)=>n+l.errors.length,0)} deliberate failures verified.`);
