import { validate,type Design,type Layout } from './model.js';
import { place } from './layout.js';
import { route } from './router.js';
import { svg } from './svg.js';
import { audit,type Audit } from './audit.js';
import { textWidth,ceil } from './font.js';

export class DiagramError extends Error {
  constructor(message:string,readonly layout:Layout,readonly drawing:string,readonly audit?:Audit){super(message);this.name='DiagramError';}
}

/** Compile without writing files. Only a fully audited drawing is returned. */
export interface CompileOptions { adaptive?:boolean; maxAttempts?:number }
export interface Planning { attempts:number; expanded:boolean; gap:number; rowSpacing:number }
export function compile(design:Design,options:CompileOptions={}):{layout:Layout;drawing:string;audit:Audit;planning:Planning}{
  validate(design);
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Compile options must be an object');
  if(options.adaptive!==undefined&&typeof options.adaptive!=='boolean')throw new Error('adaptive must be a boolean');
  for(const key of Object.keys(options))if(!['adaptive','maxAttempts'].includes(key))throw new Error(`Unknown compile option ${key}`);
  const adaptive=options.adaptive??design.layout?.adaptive??true;
  const limit=options.maxAttempts??4;
  if(!Number.isInteger(limit)||limit<1||limit>4)throw new Error('maxAttempts must be an integer from 1 to 4');
  const gap=design.layout?.gap??180,rowSpacing=design.layout?.rowSpacing??240;
  const measured=ceil(Math.max(gap,...design.nets.map(n=>textWidth(n.label??n.id,21)+96)));
  const profiles=[{gap,rowSpacing},{gap:Math.max(gap+120,measured),rowSpacing},
    {gap:Math.max(gap+120,measured),rowSpacing:Math.max(rowSpacing+120,360)},
    {gap:Math.max(gap+240,measured+120),rowSpacing:Math.max(rowSpacing+240,480)}];
  let last:DiagramError|undefined;
  for(const [attempt,profile] of profiles.slice(0,adaptive?limit:1).entries()){
    const layout=place(design,profile);
    // Bound grid-search memory even for unusually large sources or labels.
    if((layout.width/12+1)*(layout.height/12+1)>2_000_000)throw new Error('Layout exceeds the routing budget; split the diagram into smaller views');
    try{
      route(design,layout);
      const drawing=svg(design,layout),report=audit(design,layout,drawing);
      if(report.ok)return {layout,drawing,audit:report,planning:{attempts:attempt+1,expanded:attempt>0,...profile}};
      last=new DiagramError(`Geometry rejected: ${report.errors.join('; ')}`,layout,drawing,report);
    }catch(error){
      last=new DiagramError(error instanceof Error?error.message:String(error),layout,svg(design,layout));
    }
    // These are invalid anchors, not spacing problems; do not disguise them.
    if(/Coincident pins|not on the routing grid|Cyclic|Unknown alignment/.test(last.message))break;
  }
  throw last!;
}
