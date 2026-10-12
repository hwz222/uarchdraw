/** Crops the delivered SVG; never draws a second, inconsistent diagram. */
import { readFileSync,writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { fontPath } from '../dist/font.js';
const prefix=process.argv[2]??'output/05-rv32i-forwarding';
const source=readFileSync(prefix+'.svg','utf8'),layout=JSON.parse(readFileSync(prefix+'.layout.json','utf8'));
const ex=layout.stages.find(s=>s.name==='EX'),target=layout.nodes.find(n=>n.instance.id==='target'),pc=layout.nodes.find(n=>n.instance.id==='pc');
const crops=[{name:'forwarding-detail',x:ex.x-168,y:layout.bodyTop-24,w:layout.width-ex.x+168,h:layout.height-layout.bodyTop-132},
  {name:'hazard-detail',x:0,y:96,w:target.x+target.w+60,h:pc.y+pc.h-48}];
for(const c of crops){
  const drawing=source.replace(/width="[^"]+" height="[^"]+" viewBox="[^"]+"/,`width="${c.w}" height="${c.h}" viewBox="${c.x} ${c.y} ${c.w} ${c.h}"`);
  writeFileSync(prefix+'-'+c.name+'.png',new Resvg(drawing,{font:{fontFiles:[fontPath],loadSystemFonts:false},fitTo:{mode:'width',value:1400}}).render().asPng());
}
console.log('Rendered forwarding and hazard crops from the delivered SVG');
