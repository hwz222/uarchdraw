// Public-repository checks; no generated build or network access required.
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,relative,dirname,extname,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';

const root=resolve(import.meta.dirname,'..');
const gitFiles=args=>execFileSync('git',['ls-files','-z',...args],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const tracked=gitFiles(['--cached']);
const files=[...new Set([...tracked,...gitFiles(['--others','--exclude-standard'])])]
  .filter(file=>existsSync(resolve(root,file))).sort();
const fileSet=new Set(files);
const errors=[];
const report=(file,message)=>errors.push(`${file}: ${message}`);
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const textExtensions=new Set(['.md','.ts','.js','.mjs','.json','.yml','.yaml','.uarch','.svg','.html','.txt','.toml']);
const isText=file=>textExtensions.has(extname(file)) || !extname(file);
const anchors=new Map();
const markdownAnchors=file=>{
  if(anchors.has(file))return anchors.get(file);
  const text=readFileSync(file,'utf8').replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm,'');
  const found=new Set(),counts=new Map();
  for(const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)){
    const slug=match[1].toLowerCase().replace(/<[^>]+>/g,'').replace(/[^\p{Letter}\p{Number}_ -]/gu,'').replaceAll(' ','-');
    const count=counts.get(slug)??0;counts.set(slug,count+1);
    found.add(slug+(count?'-'+count:''));
  }
  for(const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g))found.add(match[1]);
  anchors.set(file,found);return found;
};
const localLink=(file,target)=>{
  if(!target || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target))return;
  let path,fragment;
  try{path=decodeURIComponent(target.split(/[?#]/,1)[0]);fragment=decodeURIComponent(target.split('#')[1]??'');}
  catch{report(file,`invalid URL encoding in link ${target}`);return;}
  const absolute=path?resolve(dirname(resolve(root,file)),path):resolve(root,file);
  const rel=relative(root,absolute).replaceAll('\\','/');
  if(isAbsolute(rel) || rel==='..' || rel.startsWith('../')){
    report(file,`local link leaves the repository: ${target}`);return;
  }
  if(!existsSync(absolute))report(file,`missing local link target: ${target}`);
  else if(statSync(absolute).isFile() && !fileSet.has(rel)){
    report(file,`link target is ignored, untracked, or has incorrect letter case: ${target}`);
  }
  else if(fragment&&extname(absolute)==='.md'&&!markdownAnchors(absolute).has(fragment)){
    report(file,`missing Markdown heading anchor: ${target}`);
  }
};

for(const file of tracked){
  if(/^(?:node_modules|dist|output|coverage)\//.test(file) || /\.(?:tgz|log)$/.test(file)){
    report(file,'generated build or local artifact is tracked');
  }
}
let texts=0,links=0;
for(const file of files){
  if(cjk.test(file))report(file,'filename must use English');
  if(!isText(file))continue;
  texts++;
  const content=readFileSync(resolve(root,file),'utf8');
  if(cjk.test(content))report(file,'CJK text found; maintained project content must be in English');
  if(/^(?:docs|examples)\//.test(file) && /\b[A-Za-z]:[\\/]/.test(content)){
    report(file,'machine-specific absolute path found; use a repository-relative path');
  }
  if(!['.md','.html'].includes(extname(file)))continue;
  // Check authored links, not literal syntax shown inside fenced/inline code.
  const prose=content.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm,'')
    .replace(/`+[^`\n]*`+/g,'');
  for(const match of prose.matchAll(/\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)|(?:href|src)=["']([^"']+)["']/g)){
    links++;localLink(file,match[1]??match[2]??match[3]);
  }
}
for(const file of ['README.md','LICENSE','CONTRIBUTING.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','docs/README.md']){
  if(!fileSet.has(file))report(file,'required public-project file missing');
}
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
for(const key of ['name','version']){
  if(pkg[key]!==lock[key])report('package-lock.json',`${key} differs from package.json`);
}
for(const key of ['name','version','license','dependencies','devDependencies','engines','bin']){
  if(!isDeepStrictEqual(pkg[key],lock.packages?.['']?.[key])){
    report('package-lock.json',`root ${key} differs from package.json`);
  }
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`Repository check passed: ${files.length} files, ${texts} text files, ${links} authored links; package metadata and tracked artifacts checked.`);
