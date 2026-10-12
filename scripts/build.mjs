// Remove stale compiled files before building; test-only modules must not ship.
import {rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'dist');
if(dirname(out)!==root)throw new Error('Build output must stay inside the repository.');
rmSync(out,{recursive:true,force:true});
const require=createRequire(import.meta.url);
const result=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc')],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
