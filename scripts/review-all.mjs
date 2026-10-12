// Rebuild every published example and successful visual-review variant.
// Reports and variant previews stay in output; only published previews are tracked.
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..'),review=resolve(root,'output');
mkdirSync(review,{recursive:true});
for(const args of [
  ['scripts/render-examples.mjs'],
  ['scripts/render-tutorials.mjs'],
  ['scripts/review-arbiter.mjs'],
  ['scripts/review-cases.mjs'],
  ['scripts/review-automation.mjs'],
  ['scripts/render-rv32i-details.mjs','output/05-rv32i-forwarding'],
]){
  const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(r.status!==0)throw new Error(`Review generation failed: ${args.join(' ')} (${r.error?.message??r.status})`);
}
const variants=['arbiter-auto-fixed','arbiter-six-compact','arbiter-six-input','sixteen-channel'];
const names=readdirSync(resolve(root,'examples')).filter(n=>n.endsWith('.uarch')).sort().map(n=>n.slice(0,-6)).concat(variants);
const read=path=>readFileSync(resolve(root,path));
const hash=path=>createHash('sha256').update(read(path)).digest('hex');
const cases=names.map(name=>{
  const prefix=`output/${name}`,layout=JSON.parse(read(prefix+'.layout.json')),qa=JSON.parse(read(prefix+'.qa.json'));
  if(!qa.ok)throw new Error(`${name}: geometry audit failed`);
  // Reading both files also catches accidentally missing grayscale output.
  return {name,width:layout.width,height:layout.height,geometry:qa,
    sha256:{svg:hash(prefix+'.svg'),png:hash(prefix+'.png'),grayPng:hash(prefix+'-gray.png')}};
});
writeFileSync(resolve(review,'review-results.json'),JSON.stringify({cases},null,2)+'\n');
const checked=spawnSync(process.execPath,['scripts/check-generated.mjs'],{cwd:root,stdio:'inherit'});
if(checked.status!==0)throw new Error('Generated content verification failed');
console.log(`All ${cases.length} diagrams regenerated; geometry and image hashes saved in output/review-results.json`);
