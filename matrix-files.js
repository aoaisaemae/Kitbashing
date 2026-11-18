import {addProgramText} from './rhino-program-text.js';
export function downloadMatrix(content,name,type){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const link=document.createElement('a');
 link.href=url;link.download=name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}

export function illustratorMatrix(curves,bounds){
 const width=bounds.max.x-bounds.min.x,height=bounds.max.y-bounds.min.y;
 const scale=960/Math.max(width,height,1);
 const w=Math.ceil(width*scale)+32,h=Math.ceil(height*scale)+32;
 const xy=([x,y])=>[(x-bounds.min.x)*scale+16,(y-bounds.min.y)*scale+16].map(n=>n.toFixed(3)).join(' ');
 const stream=['1 J 1 j',...curves.map(({points,closed,kind,color})=>{
  const stroke=color|| (kind==='Grid'?[.64,.72,.75]:kind==='Outline'?[0,.38,.57]:[0,.25,.32]);
  return stroke.join(' ')+' RG '+(kind==='Outline'?1.3:.55)+' w '+points.map((point,i)=>xy(point)+(i?' l':' m')).join(' ')+(closed?' h':'')+' S';
 })].join('\n')+'\n';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << >> /Contents 4 0 R >>',
  '<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream'
 ];
 let pdf='%PDF-1.4\n';
 const offsets=objects.map((object,i)=>{
  const offset=pdf.length;pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';return offset;
 });
 const xref=pdf.length;
 return pdf+'xref\n0 5\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+
  'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
}

let rhinoEngine;
export async function rhinoMatrix(curves){
 const factory=(await import('./rhino3dm.js')).default;
 const rhino=await (rhinoEngine ||= factory({locateFile:()=>new URL('./rhino3dm.wasm',import.meta.url).href}).catch(error=>{rhinoEngine=null;throw error;}));
 const doc=new rhino.File3dm();
 try{
  doc.settings().modelUnitSystem=rhino.UnitSystem.Millimeters;
  const layers=new Map();
  for(const {points,closed,kind,name,color,program} of curves){
   if(!layers.has(kind)){
    const layer=new rhino.Layer();
    try{layer.name=kind;layers.set(kind,doc.layers().add(layer));}finally{layer.delete();}
   }
   const xyz=points.map(([x,y])=>[x,y,0]);
   if(closed&&(xyz[0][0]!==xyz.at(-1)[0]||xyz[0][1]!==xyz.at(-1)[1]))xyz.push(xyz[0]);
   const shape=new rhino.PolylineCurve(xyz),attributes=new rhino.ObjectAttributes();
   try{
    attributes.name=name||kind;
    attributes.layerIndex=layers.get(kind);
    if(color){
     const [r,g,b]=color.map(value=>Math.round(value*255));
     attributes.objectColor={r,g,b,a:255};
     attributes.colorSource=rhino.ObjectColorSource.ColorFromObject;
    }
    doc.objects().add(shape,attributes);
    addProgramText(rhino,doc,program,xyz,attributes);
   }finally{shape.delete();attributes.delete();}
  }
  return doc.toByteArray();
 }finally{doc.delete();}
}
