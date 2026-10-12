// One verification entry point for Windows, Linux and CI; no shell wrappers.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),npm=process.env.npm_execpath;
if(!npm)throw new Error('Run this command through npm run verify.');
for(const script of ['check:repo','test','review:all','test:package']){
  const result=spawnSync(process.execPath,[npm,'run',script],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log('Verification passed: repository, tests, drawings and installed package.');
