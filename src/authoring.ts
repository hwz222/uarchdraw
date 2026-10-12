/** Version-2 authoring frontend. Expands into the existing typed version-1 model. */
import { validate,pinMap,width,type Design,type Instance,type Pin,type Signal,type Net } from './model.js';
import { automaticPlacement } from './automatic.js';
import { assertOptions } from './schema.js';

interface Token { text:string; line:number; string?:boolean }
type Env=Map<string,number>;
interface Template { params:string[]; kind:Instance['kind']; body:Token[] }
interface Block { id:string; path:string; template:string; args:Token[][]; stage?:string; body:Token[]; line:number }
interface Connection { source:Token[]; sinks:Token[][]; options:Record<string,unknown>; line:number; scope:string }
const kinds=['block','register','pipeline','mux','alu','adder'];

function tokenize(source:string,file:string):Token[]{
  const tokens:Token[]=[];let at=0,line=1;
  while(at<source.length){
    const c=source[at]!;
    if(c==='\n'){tokens.push({text:'\n',line});line++;at++;continue;}
    if(/\s/.test(c)){at++;continue;}
    if(c==='#'||source.slice(at,at+2)==='//'){while(at<source.length&&source[at]!=='\n')at++;continue;}
    if(c==='"'){
      const start=at++;let escaped=false;
      while(at<source.length){const next=source[at++]!;if(next==='\n')throw new Error(`${file}:${line}: String must end on the same line`);if(next==='"'&&!escaped)break;escaped=next==='\\'&&!escaped;}
      try{const text:unknown=JSON.parse(source.slice(start,at));if(typeof text!=='string')throw new Error();tokens.push({text,line,string:true});}
      catch{throw new Error(`${file}:${line}: Invalid quoted string`);}continue;
    }
    const match=source.slice(at).match(/^(?:[A-Za-z_]\w*|\d+(?:\.\d+)?|->)/);
    if(match){tokens.push({text:match[0],line});at+=match[0].length;continue;}
    if('{}()[]:,.=;@+-*/%'.includes(c)){tokens.push({text:c,line});at++;continue;}
    throw new Error(`${file}:${line}: Unexpected character ${JSON.stringify(c)}`);
  }
  return tokens;
}

class Reader {
  at=0;
  constructor(readonly tokens:Token[],readonly file:string){}
  peek(){return this.tokens[this.at]?.text;}
  take(){const t=this.tokens[this.at++];if(!t)this.error('Unexpected end of source');return t!;}
  error(message:string):never{throw new Error(`${this.file}:${this.tokens[this.at]?.line??this.tokens.at(-1)?.line??1}: ${message}`);}
  eat(text:string){if(this.peek()===text){this.at++;return true;}return false;}
  expect(text:string){if(!this.eat(text))this.error(`Expected ${text}, found ${this.peek()??'end of source'}`);}
  separators(){while(this.eat('\n')||this.eat(';')){/* Statement separators. */}}
  name(){const t=this.take();if(t.string||!/^[A-Za-z_]\w*$/.test(t.text))this.error('Expected an identifier');return t.text;}
  quoted(){const t=this.take();if(!t.string)this.error('Expected a quoted string');return t.text;}
  until(stops:string[]):Token[]{
    const out:Token[]=[];let depth=0;
    while(this.peek()!==undefined){const text=this.peek()!;if(depth===0&&stops.includes(text))break;
      if(text==='('||text==='[')depth++;if(text===')'||text===']')depth--;if(depth<0)break;out.push(this.take());}
    return out;
  }
  body():Token[]{
    this.expect('{');let depth=1;const out:Token[]=[];
    while(depth){const token=this.take();if(!token.string&&token.text==='{')depth++;if(!token.string&&token.text==='}')depth--;if(depth)out.push(token);}
    return out;
  }
  args():Token[][]{
    if(!this.eat('('))return [];const out:Token[][]=[];
    if(this.eat(')'))return out;
    do{out.push(this.until([',',')']));}while(this.eat(','));this.expect(')');return out;
  }
}

// Integer expressions are parsed, never evaluated as JavaScript.
function expression(tokens:Token[],env:Env,file:string,integerOnly=true):number{
  const r=new Reader(tokens.filter(t=>t.text!=='\n'),file);
  const primary=():number=>{
    if(r.eat('-'))return -primary();if(r.eat('+'))return primary();
    if(r.eat('(')){const n=sum();r.expect(')');return n;}
    const t=r.take();if(t.string)r.error('Expected an integer expression');
    if(/^\d+(?:\.\d+)?$/.test(t.text))return Number(t.text);
    if(r.peek()==='('){
      const args=r.args().map(a=>expression(a,env,file,integerOnly));
      if(t.text==='clog2'&&args.length===1&&args[0]!>0)return Math.max(1,Math.ceil(Math.log2(args[0]!)));
      if(t.text==='max'&&args.length)return Math.max(...args);
      if(t.text==='min'&&args.length)return Math.min(...args);
      r.error(`Unknown integer function ${t.text}`);
    }
    const n=env.get(t.text);if(n===undefined)r.error(`Unknown parameter ${t.text}`);return n!;
  };
  const product=():number=>{let n=primary();while(['*','/','%'].includes(r.peek()??'')){const op=r.take().text,b=primary();if((op==='/'||op==='%')&&b===0)r.error('Division by zero');n=op==='*'?n*b:op==='/'?n/b:n%b;}return n;};
  const sum=():number=>{let n=product();while(['+','-'].includes(r.peek()??'')){const op=r.take().text,b=product();n=op==='+'?n+b:n-b;}return n;};
  const n=sum();if(r.peek()!==undefined)r.error('Unexpected token in integer expression');
  if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER||(integerOnly&&!Number.isSafeInteger(n)))r.error('Expression must produce a safe integer');return n;
}
const interpolate=(text:string,env:Env,file:string)=>text.replace(/\$\{([^}]+)\}/g,(_,s:string)=>String(expression(tokenize(s,file),env,file)));

function options(tokens:Token[],env:Env,file:string,deferStrings=false):Record<string,unknown>{
  const r=new Reader(tokens,file),result:Record<string,unknown>={};r.separators();
  while(r.peek()!==undefined){
    const name=r.name();if(Object.hasOwn(result,name))r.error(`Duplicate option ${name}`);r.eat(':');r.eat('=');
    if(r.tokens[r.at]?.string){const text=r.quoted();result[name]=deferStrings?text:interpolate(text,env,file);}
    else if(r.peek()==='true'||r.peek()==='false')result[name]=r.take().text==='true';
    else if(['column','row','span','gap','rowSpacing','offset'].includes(name))result[name]=expression(r.until(['\n',';',',']),env,file,name!=='offset');
    else result[name]=r.name();
    r.eat(',');r.separators();
  }
  return result;
}

export async function parseAuthoring(source:string,file:string):Promise<Design>{
  const r=new Reader(tokenize(source.replace(/^\uFEFF/,''),file),file),env:Env=new Map();
  const templates=new Map<string,Template>(),types=new Map<string,Signal>();
  const blocks:Block[]=[],connections:Connection[]=[];
  const d:Design={version:1,title:'UarchDraw diagram',subtitle:'',stages:[],instances:[],nets:[],notes:[]};
  r.separators();r.expect('uarch');r.expect('2');r.separators();
  const declarations=(r:Reader,scope='',group?:NonNullable<Design['groups']>[number])=>{while(r.peek()!==undefined){
    const statement=r.take();
    switch(statement.text){
      case 'title':case 'subtitle':d[statement.text]=interpolate(r.quoted(),env,file);break;
      case 'label':if(!group)r.error('label belongs inside a block or group');group!.label=interpolate(r.quoted(),env,file);break;
      case 'note':d.notes.push(interpolate(r.quoted(),env,file));break;
      case 'param':{
        const name=r.name();if(env.has(name))r.error(`Duplicate parameter ${name}`);r.expect('=');env.set(name,expression(r.until(['\n',';']),env,file));break;
      }
      case 'stages':{
        if(d.stages.length)r.error('Specify stages only once');while(r.peek()!==undefined&&!['\n',';'].includes(r.peek()!))d.stages.push(r.name());break;
      }
      case 'type':{
        const name=r.name();if(types.has(name))r.error(`Duplicate type ${name}`);
        const fields:Record<string,number>={},body=new Reader(r.body(),file);body.separators();
        while(body.peek()!==undefined){const key=body.name();if(Object.hasOwn(fields,key))body.error(`Duplicate field ${key}`);body.expect(':');fields[key]=expression(body.until([',','\n',';']),env,file);body.eat(',');body.separators();}
        types.set(name,{fields});break;
      }
      case 'layout':d.layout=options(r.body(),env,file);assertOptions(d.layout,'layout');break;
      case 'template':{
        const name=r.name();if(templates.has(name)||kinds.includes(name))r.error(`Duplicate or reserved template ${name}`);
        const params=r.args().map(a=>{if(a.length!==1||a[0]!.string||!/^[A-Za-z_]\w*$/.test(a[0]!.text))r.error('Template arguments must be parameter names');return a[0]!.text;});
        if(new Set(params).size!==params.length)r.error('Duplicate template parameter');
        const kind=r.eat(':')?r.name():'block';if(!kinds.includes(kind))r.error(`Unknown symbol ${kind}`);
        templates.set(name,{params,kind:kind as Instance['kind'],body:r.body()});break;
      }
      case 'block':{
        const name=r.name();if(name.includes('__'))r.error('Double underscore is reserved for expanded group paths');
        const path=scope+name,id=path.replaceAll('.','__'),template=r.eat(':')?r.name():'block',args=r.args(),stage=r.eat('in')?r.name():undefined;
        const body=r.peek()==='{'?r.body():[];blocks.push({id,path,template,args,stage,body,line:statement.line});break;
      }
      case 'group':{
        if(scope.split('.').length>16)r.error('Group nesting limit is 16');
        const name=r.name();if(name.includes('__'))r.error('Double underscore is reserved for expanded group paths');
        const path=scope+name,id=path.replaceAll('.','__'),child={id,label:name,members:[] as string[],...(group?{parent:group.id}:{})};
        (d.groups??=[]).push(child);const body=new Reader(r.body(),file);body.separators();declarations(body,path+'.',child);
        child.members=blocks.filter(b=>b.path.startsWith(path+'.')).map(b=>b.id);break;
      }
      case 'connect':{
        const src=r.until(['->']);r.expect('->');const sinks:Token[][]=[];
        do{sinks.push(r.until([',','{','\n',';']));}while(r.eat(','));
        const opts=r.peek()==='{'?options(r.body(),env,file,true):{};assertOptions(opts,'net',`${file}:${statement.line}: connect`);connections.push({source:src,sinks,options:opts,line:statement.line,scope});break;
      }
      default:r.error(`Unknown declaration ${statement.text}`);
    }
    r.separators();
  }};declarations(r);
  if(!d.stages.length)d.stages=['DESIGN'];
  if(blocks.length>500)throw new Error(`${file}: Block expansion limit is 500`);
  const arrays=new Map<string,string[]>(),explicitSides=new Set<string>();
  const addPin=(node:Instance,id:string,direction:Pin['direction'],type:Signal,side:Pin['side'])=>node.pins.push({id,direction,type:structuredClone(type),side});
  const portType=(body:Reader,local:Env):Signal=>{
    const name=body.name();
    if(name==='bit')return {bits:1};
    if(name==='bits'){const args=body.args();if(args.length!==1)body.error('bits requires one width');return {bits:expression(args[0]!,local,file)};}
    const type=types.get(name);if(!type)body.error(`Unknown signal type ${name}`);return structuredClone(type!);
  };
  const applyBody=(node:Instance,tokens:Token[],local:Env)=>{
    const body=new Reader(tokens,file);body.separators();
    while(body.peek()!==undefined){
      const command=body.take().text;
      if(command==='in'||command==='out'){
        const id=body.name();let count:number|undefined;
        if(body.eat('[')){count=expression(body.until([']']),local,file);body.expect(']');if(count<1||count>128)body.error('Port array size must be from 1 to 128');}
        body.expect(':');const type=portType(body,local),hasSide=body.eat('@'),side=(hasSide?body.name():command==='in'?'left':'right') as Pin['side'];
        const optionTokens=body.peek()==='{'?body.body():[];
        const ids=count===undefined?[id]:Array.from({length:count},(_,j)=>id+j);
        if(count!==undefined){if(arrays.has(node.id+'.'+id))body.error(`Duplicate port array ${id}`);arrays.set(node.id+'.'+id,ids.map(p=>node.id+'.'+p));}
        for(const [index,pid] of ids.entries()){
          const portEnv=new Map(local);portEnv.set('index',index);const opts=options(optionTokens,portEnv,file);assertOptions(opts,'pin',`${file}:${optionTokens[0]?.line??1}: ${node.id}.${pid}`);
          addPin(node,pid,command,type,side);Object.assign(node.pins.at(-1)!,opts);
          if(hasSide)explicitSides.add(node.id+'.'+pid);
        }
      }else if(command==='label')node.label=interpolate(body.quoted(),local,file);
      else if(command==='note')(node.notes??=[]).push(interpolate(body.quoted(),local,file));
      else if(command==='role')node.role=body.name() as Instance['role'];
      else if(command==='layout'){const opts=options(body.body(),local,file);assertOptions(opts,'node');Object.assign(node,opts);if(opts.column!==undefined||opts.row!==undefined){if(opts.column===undefined||opts.row===undefined)body.error('Specify both column and row');node.placement='fixed';}}
      else body.error(`Unknown block declaration ${command}`);
      body.separators();
    }
  };
  for(const spec of blocks){
    const local=new Map(env),args=spec.args.map(a=>expression(a,env,file)),template=templates.get(spec.template);
    if(!template&&!kinds.includes(spec.template))throw new Error(`${file}:${spec.line}: Unknown template ${spec.template}`);
    const node:Instance={id:spec.id,label:spec.id,kind:template?.kind??spec.template as Instance['kind'],stage:spec.stage??d.stages[0]!,column:0,row:0,pins:[],placement:'auto'};
    if(template){
      if(args.length!==template.params.length)throw new Error(`${file}:${spec.line}: ${spec.template} expects ${template.params.length} arguments`);
      template.params.forEach((p,j)=>local.set(p,args[j]!));applyBody(node,template.body,local);
    }else if(spec.template==='mux'&&args.length){
      if(args.length!==2||args[0]!<1||args[0]!>128||args[1]!<1)throw new Error(`${file}:${spec.line}: mux expects input count 1..128 and positive width`);
      const [n,w]=args as [number,number];node.label=`${n}:1 MUX`;
      const ids=Array.from({length:n},(_,j)=>`${node.id}.d${j}`);arrays.set(node.id+'.d',ids);
      ids.forEach((ref,j)=>{addPin(node,'d'+j,'in',{bits:w},'left');node.pins.at(-1)!.label=String(j);});
      addPin(node,'select','in',{bits:Math.max(1,Math.ceil(Math.log2(n)))},'bottom');explicitSides.add(node.id+'.select');
      addPin(node,'out','out',{bits:w},'right');
    }else if(spec.template==='register'&&args.length){
      if(args.length!==1||args[0]!<1)throw new Error(`${file}:${spec.line}: register expects one positive width`);
      addPin(node,'d','in',{bits:args[0]!},'left');addPin(node,'q','out',{bits:args[0]!},'right');
    }else if(args.length)throw new Error(`${file}:${spec.line}: ${spec.template} takes no arguments`);
    applyBody(node,spec.body,local);d.instances.push(node);
  }
  const aliases=new Map(blocks.map(b=>[b.path,b.id]));
  const reference=(tokens:Token[],scope:string):string[]=>{
    const ref=new Reader(tokens,file),path=[ref.name()];while(ref.eat('.'))path.push(ref.name());
    if(path.length<2)ref.error('Expected block.port');
    const pin=path.pop()!,qualified=path.join('.');
    const node=aliases.get(scope+qualified)??aliases.get(qualified);if(!node)ref.error(`Unknown block ${scope+qualified}`);
    let result=[node+'.'+pin];
    if(ref.eat('[')){
      const array=arrays.get(node+'.'+pin);if(!array)ref.error(`Unknown port array ${node}.${pin}`);
      if(ref.eat('*'))result=array!;
      else{const index=expression(ref.until([']']),env,file);if(index<0||index>=array!.length)ref.error(`Array index out of range: ${node}.${pin}[${index}]`);result=[array![index]!];}
      ref.expect(']');
    }
    if(ref.peek()!==undefined)ref.error('Unexpected token in port reference');return result;
  };
  const pins=pinMap(d);
  for(const c of connections){
    const sources=reference(c.source,c.scope),sinkGroups=c.sinks.map(tokens=>reference(tokens,c.scope));
    for(const [index,src] of sources.entries()){
      const sinks=sinkGroups.flatMap(group=>{if(sources.length===1)return group;if(group.length!==sources.length)throw new Error(`${file}:${c.line}: Connected port arrays must have equal lengths`);return [group[index]!];});
      const netEnv=new Map(env);netEnv.set('index',index);
      const opts=Object.fromEntries(Object.entries(c.options).map(([k,v])=>[k,typeof v==='string'?interpolate(v,netEnv,file):v]));
      const existing=d.nets.find(n=>n.source===src);
      if(existing){for(const [k,v] of Object.entries(opts)){if((existing as unknown as Record<string,unknown>)[k]!==undefined&&(existing as unknown as Record<string,unknown>)[k]!==v)throw new Error(`${file}:${c.line}: Conflicting options for ${src}`);}Object.assign(existing,opts);existing.sinks.push(...sinks);}
      else {
        // Version-2 identifiers cannot contain hyphens, so this separator keeps
        // instance/port identity distinct even when either contains underscores.
        d.nets.push({id:src.replace('.','-'),source:src,sinks,...opts} as Net);
      }
    }
  }
  for(const n of d.nets){
    const source=pins.get(n.source);if(!source)continue;
    if(/^(?:valid|ready|out_valid|out_ready|request|grant|select|index|enable|clk|clock|reset|status|commands)$/.test(source.pin.id))n.style??='control';
    const short=source.instance.id.split('__').at(-1)!;
    const duplicate=d.instances.filter(i=>i.id.split('__').at(-1)===short).length>1;
    const name=duplicate?source.instance.id.replaceAll('__','.')+'.'+source.pin.id:short+'.'+source.pin.id;
    n.label??=name+('fields' in source.pin.type?`{${width(source.pin.type)}}`:`/${width(source.pin.type)}`);
  }
  // Infer control-facing ports from their neighbors; explicit @sides win.
  const isControl=(node:Instance)=>node.role==='control'||(node.role!=='data'&&d.nets.filter(n=>n.source.startsWith(node.id+'.')||n.sinks.some(s=>s.startsWith(node.id+'.'))).every(n=>n.style==='control'));
  for(const n of d.nets){
    if(n.style!=='control')continue;const src=pins.get(n.source);if(!src)continue;
    for(const ref of n.sinks){const dst=pins.get(ref);if(!dst)continue;
      if(isControl(src.instance)!==isControl(dst.instance)){
        const ctrl=isControl(src.instance)?src:dst,data=ctrl===src?dst:src;
        const a=d.stages.indexOf(ctrl.instance.stage),b=d.stages.indexOf(data.instance.stage);
        if(!explicitSides.has(ctrl===src?n.source:ref))ctrl.pin.side=a===b?'top':a>b?'left':'right';
        if(!explicitSides.has(data===src?n.source:ref))data.pin.side='bottom';
      }else if(d.stages.indexOf(src.instance.stage)>d.stages.indexOf(dst.instance.stage)){
        if(!explicitSides.has(n.source))src.pin.side='bottom';if(!explicitSides.has(ref))dst.pin.side='bottom';
        n.corridor??='bottom';
      }else if(!isControl(src.instance)&&/ready/.test(src.pin.id)){
        if(!explicitSides.has(n.source))src.pin.side='bottom';if(!explicitSides.has(ref))dst.pin.side='bottom';
      }
    }
  }
  validate(d);await automaticPlacement(d);validate(d);return d;
}
