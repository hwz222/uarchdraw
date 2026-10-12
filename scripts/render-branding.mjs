import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { fontPath } from '../dist/font.js';
const dir=resolve(import.meta.dirname,'../docs/images'),out=resolve(import.meta.dirname,'../output');mkdirSync(dir,{recursive:true});mkdirSync(out,{recursive:true});
const logo=readFileSync(resolve(dir,'logo.svg'),'utf8').replace(/<svg[^>]*>/,'<g transform="translate(68 62) scale(.85)">').replace('</svg>','</g>');
const stages=['IF','ID','EX','MEM','WB'];
const hero=`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="460" viewBox="0 0 1400 460" role="img" aria-labelledby="title desc">
<title id="title">UarchDraw — microarchitecture, made readable.</title><desc id="desc">An original ALU mark and a stylized five-stage datapath. Text to SVG. Every signal has a name.</desc>
<defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#28404f"/></pattern></defs>
<rect width="1400" height="460" rx="24" fill="#102536"/><rect x="710" width="690" height="460" rx="24" fill="url(#grid)"/>
${logo}
<g font-family="DejaVu Sans,sans-serif"><text x="170" y="120" font-size="65" font-weight="bold" fill="#f2fafc">UarchDraw</text>
<text x="72" y="212" font-size="30" fill="#f2fafc">Microarchitecture, made readable.</text>
<text x="72" y="259" font-size="21" fill="#abc4d0">Describe the ports. Follow every signal.</text>
<rect x="72" y="319" width="462" height="56" rx="9" fill="#193749" stroke="#345262"/>
<text x="96" y="354" font-size="19" fill="#80e2d5">.uarch</text><text x="180" y="354" font-size="19" fill="#d4e6ed">→</text><text x="215" y="354" font-size="19" fill="#f2fafc">SVG · PNG · signal inspector</text>
${stages.map((s,j)=>`<text x="${790+j*115}" y="112" text-anchor="middle" font-size="17" fill="#abc4d0">${s}</text>`).join('')}
</g>
<g fill="#193749" stroke="#adc9d6" stroke-width="2.5" stroke-linejoin="round">
<rect x="756" y="204" width="62" height="84" rx="5"/><rect x="872" y="161" width="66" height="160" rx="5"/>
<path d="M988 165L1054 188V274L988 297V250L1006 231L988 211Z"/>
<rect x="1090" y="144" width="12" height="190"/><rect x="1140" y="205" width="63" height="83" rx="5"/>
<path d="M1245 210L1290 221V284L1245 296Z"/>
</g>
<g fill="none" stroke="#68ded0" stroke-width="3" stroke-linejoin="round">
<path d="M729 246H756M818 246H849V215H872M938 193H988M938 275H963V265H988M1054 231H1090M1102 231H1140M1203 246H1245M1290 251H1332"/>
</g>
<path d="M1313 251V367H848V289H872" stroke="#eead60" stroke-width="3" fill="none" stroke-linejoin="round"/>
<g fill="#eead60"><circle cx="1313" cy="251" r="5"/><circle cx="848" cy="367" r="4"/></g>
<g font-family="DejaVu Sans,sans-serif" font-size="15" fill="#abc4d0"><text x="1107" y="217">32</text><text x="1076" y="393" text-anchor="middle" fill="#eead60">TRACEABLE BY DESIGN</text></g>
</svg>`;
writeFileSync(resolve(out,'banner.svg'),hero);
for(const name of ['logo','banner'])writeFileSync(resolve(name==='logo'?out:dir,name+'.png'),new Resvg(name==='logo'?readFileSync(resolve(dir,'logo.svg'),'utf8'):hero,{font:{fontFiles:[fontPath],loadSystemFonts:false},fitTo:{mode:'width',value:name==='logo'?384:1400}}).render().asPng());
console.log('Rendered original logo and README banner.');
