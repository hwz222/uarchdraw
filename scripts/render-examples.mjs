import { readdirSync,mkdirSync,copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
mkdirSync(resolve(root,'docs/images'),{recursive:true});
for(const file of readdirSync(resolve(root,'examples')).filter(f=>f.endsWith('.uarch')).sort()){
  const name=file.slice(0,-6);
  const result=spawnSync(process.execPath,['dist/cli.js','render',`examples/${file}`,'-o',`output/${name}`],{cwd:root,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
  copyFileSync(resolve(root,`output/${name}.png`),resolve(root,`docs/images/${name}.png`));
}
