import {addProgramText} from './rhino-program-text.js';
let engine;

export async function floorRhinoFile(records){
 const factory=(await import('./rhino3dm.js')).default;
 const rhino=await (engine ||= factory({locateFile:()=>new URL('./rhino3dm.wasm',import.meta.url).href}).catch(error=>{engine=null;throw error;}));
 const doc=new rhino.File3dm();
 try{
  doc.settings().modelUnitSystem=rhino.UnitSystem.Millimeters;
  const layers=new Map(),materials=new Map();
  for(const record of records){
   if(!layers.has(record.layer)){
    const layer=new rhino.Layer();
    try{layer.name=record.layer;layers.set(record.layer,doc.layers().add(layer));}finally{layer.delete();}
   }
   const attributes=new rhino.ObjectAttributes();
   let geometry;
   try{
    attributes.name=record.name;
    attributes.layerIndex=layers.get(record.layer);
    attributes.visible=!record.hidden;
    if(record.locked)attributes.mode=rhino.ObjectMode.Locked;
    const hex=record.color;
    attributes.objectColor={r:hex>>16&255,g:hex>>8&255,b:hex&255,a:255};
    attributes.colorSource=rhino.ObjectColorSource.ColorFromObject;
    if(record.opacity<1){
     const key=record.color+':'+record.opacity;
     if(!materials.has(key)){
      const material=new rhino.Material();
      try{
       material.diffuseColor=attributes.objectColor;
       material.transparency=1-record.opacity;
       materials.set(key,doc.materials().add(material));
      }finally{material.delete();}
     }
     attributes.materialIndex=materials.get(key);
     attributes.materialSource=rhino.ObjectMaterialSource.MaterialFromObject;
    }
    if(record.program)attributes.setUserString('Program',record.program);
    if(record.points)geometry=new rhino.PolylineCurve(record.points.map(([x,y,z])=>[x,-z,y]));
    else{
     geometry=new rhino.Mesh();
     for(const [x,y,z] of record.vertices)geometry.vertices().add(x,-z,y);
     for(const face of record.faces)geometry.faces().addQuadFace(...face);
     geometry.normals().computeNormals();
    }
    doc.objects().add(geometry,attributes);
    if(record.points&&record.program)addProgramText(rhino,doc,record.program,record.points.map(([x,y,z])=>[x,-z,y]),attributes);
   }finally{geometry?.delete();attributes.delete();}
  }
  const bytes=doc.toByteArray();
  if(!bytes.length)throw Error('Rhino file generation returned no data.');
  return bytes;
 }finally{doc.delete();}
}
