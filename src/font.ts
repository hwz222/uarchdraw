import opentype from 'opentype.js';
import { fileURLToPath } from 'node:url';
export const fontPath = fileURLToPath(new URL('../assets/DejaVuSans.ttf',import.meta.url));
const font = opentype.loadSync(fontPath);
export function textWidth(s: string, size = 18): number { return font.getAdvanceWidth(s,size); }
export function glyphBounds(s:string,size:number):{x:number;y:number;w:number;h:number}{
  const b=font.getPath(s,0,0,size).getBoundingBox();return{x:b.x1,y:b.y1,w:b.x2-b.x1,h:b.y2-b.y1};
}
export const GRID = 12;
export const snap = (v: number): number => Math.round(v / GRID) * GRID;
export const ceil = (v: number): number => Math.ceil(v / GRID) * GRID;
