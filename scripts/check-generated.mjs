// Check every reviewed viewer without executing browser code.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Script} from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const manifests=['output/review-results.json','output/automation-results.json','output/tutorial-results.json'];
const names=new Set(manifests.flatMap(path=>JSON.parse(readFileSync(resolve(root,path),'utf8')).cases.map(c=>c.name)));
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
for(const name of names){
  const prefix=resolve(root,'output',name);
  for(const suffix of ['.html','.signals.md','.svg','-gray.svg','.json','.uarch','.qa.json','.planning.json']){
    const text=readFileSync(prefix+suffix,'utf8');
    if(cjk.test(text))throw new Error(`${name}${suffix}: generated content contains CJK`);
    if(suffix==='.html'){
      if(!/<html\s+lang="en"/.test(text))throw new Error(`${name}: inspector must declare English`);
      const scripts=[...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
      if(!scripts.length)throw new Error(`${name}: inspector script is missing`);
      scripts.forEach((match,j)=>new Script(match[1],{filename:`${name}:script-${j}`}));
    }
  }
}
console.log(`Generated content check passed: ${names.size} diagrams, English inspectors and JavaScript syntax.`);
