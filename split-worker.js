import Module from './manifold.js';
import * as T from './three.js';
import {cleanMesh,capHoles,makeBVH,intersections,reconstruct,topology} from './repair-core.js';
import {describeShape,matchReferences} from './shape-features.js';

const positionsOf=model=>{const p=new Float32Array(model.faces.length*9);model.faces.forEach((f,i)=>f.forEach((v,j)=>p.set(model.verts[v],i*9+j*3)));return p;};
const flatten=mesh=>{const p=new Float32Array(mesh.triVerts.length*3);mesh.triVerts.forEach((v,i)=>p.set(mesh.vertProperties.subarray(v*mesh.numProp,v*mesh.numProp+3),i*3));return p;};

self.onmessage=async({data})=>{
 const owned=new Set(),geometries=[],progress=text=>self.postMessage({type:'progress',text});
 const keep=s=>{owned.add(s);return s;};
 try{
  const engine=await Module({locateFile:()=>new URL('./manifold.wasm',import.meta.url).href});engine.setup();
  const {Manifold,Mesh}=engine,{meshes,settings,references=[]}=data,scale=Math.max(...settings.size),tolerance=Math.max(scale*1e-8,1e-10),volumeEps=scale**3*1e-12;
  let repaired=false,reconstructed=false,holes=0;
  const solidOf=model=>{const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(model.verts.flat()),triVerts:new Uint32Array(model.faces.flat())});mesh.merge();const s=keep(new Manifold(mesh));if(!Number.isFinite(s.volume())||s.volume()<=volumeEps)throw Error('The source does not enclose a positive volume.');return s;};
  const union=solids=>solids.length===1?solids[0]:keep(Manifold.union(solids));
  const asModel=p=>{const canonical=p.slice();for(let i=0;i<canonical.length;i++)if(Math.abs(canonical[i])<tolerance)canonical[i]=0;return cleanMesh([{positions:canonical}],tolerance);};
  const toSolid=(p,name)=>{
   let model=asModel(p);
   try{
    const capped=capHoles(model);holes+=capped.holes;if(capped.holes||model.report.flipped||model.report.duplicateFaces||model.report.degenerate)repaired=true;
    model=asModel(positionsOf({verts:model.verts,faces:capped.faces}));
    const built=makeBVH(model);geometries.push(built.g);const cross=intersections(model,built.bvh);
    if(cross.selfIntersections||cross.intersectionLimited||model.report.orientationConflicts)throw Error('Ambiguous intersecting surfaces');
    return union(model.components.map(c=>solidOf({verts:model.verts,faces:c.map(i=>model.faces[i])})));
   }catch(error){
    if(!settings.allowRepair)throw Error(name+': a closed solid could not be validated. Enable automatic repair in Split or use Make watertight. Originals are unchanged.');
    progress('Rebuilding an invalid source surface before splitting…');
    const built=makeBVH(model);geometries.push(built.g);let minimumStep=0;
    for(let attempt=0;attempt<5;attempt++)try{const rebuilt=reconstruct(model,built.bvh,{resolution:96,minWall:scale/240,shell:true,minimumStep},progress);reconstructed=repaired=true;return solidOf(rebuilt);}catch(e){if(e.code!=='REPAIR_COMPLEXITY'||attempt===4)throw e;minimumStep=e.nextStep;}
   }
  };
  progress('Reading mesh volumes and categorized shape references…');
  const solids=meshes.map(m=>({solid:toSolid(m.positions,m.name),category:m.category})),full=union(solids.map(m=>m.solid)),sourceVolume=full.volume();
  let rest=full;const outputs=[],accessorySolids=[];
  if(settings.level===2){
   for(const entry of solids){
    if(entry.category==='accessories'){accessorySolids.push(entry.solid);continue;}
    if(!references.some(r=>r.category==='accessories')||new Set(references.map(r=>r.category)).size<2)continue;
    for(const part of entry.solid.decompose()){
     keep(part);if(part.volume()>sourceVolume*.28)continue;
     const p=flatten(part.getMesh()),g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(p,3));
     const match=matchReferences(describeShape(g),references);g.dispose();
     if(match?.category==='accessories'&&match.distance<.055&&match.margin>.02)accessorySolids.push(part);
    }
   }
   if(settings.accessory){
    const {center,size,quaternion}=settings.accessoryBox,box=keep(Manifold.cube(size,true));
    const matrix=new T.Matrix4().compose(new T.Vector3(...center),new T.Quaternion(...quaternion),new T.Vector3(1,1,1));
    accessorySolids.push(keep(box.transform(matrix.elements)));
   }
   if(accessorySolids.length){const cutter=union(accessorySolids),accessory=keep(full.intersect(cutter));rest=keep(full.subtract(cutter));if(accessory.volume()>volumeEps)outputs.push({solid:accessory,name:'Accessories',category:'accessories'});}
  }
  progress('Separating anatomical regions and closing every cut…');
  const min=settings.min,size=settings.size,neck=min[1]+settings.neck*size[1],hip=min[1]+settings.hip*size[1],armBottom=min[1]+settings.armBottom*size[1],cx=min[0]+size[0]/2,half=settings.halfWidth*size[0],legX=min[0]+settings.legCenter*size[0];
  const trim=(s,n,offset)=>keep(s.trimByPlane(n,offset));
  const take=(solid,name,category)=>{if(solid.volume()>volumeEps)outputs.push({solid,name,category});};
  take(trim(rest,[0,1,0],neck),'Head','heads');rest=trim(rest,[0,-1,0],-neck);
  if(settings.level===1)take(rest,'Body','body');
  else{
   const armBand=trim(rest,[0,1,0],armBottom),left=trim(armBand,[-1,0,0],-(cx-half)),right=trim(armBand,[1,0,0],cx+half);
   take(left,'Left arm','appendages');take(right,'Right arm','appendages');
   const armCutter=sign=>{const box=keep(Manifold.cube([size[0]*2,size[1]*2,size[2]*4],true));return keep(box.translate(cx+sign*(half+size[0]),armBottom+size[1],min[2]+size[2]/2));};
   rest=keep(rest.subtract(union([armCutter(-1),armCutter(1)])));
   const legs=trim(rest,[0,-1,0],-hip);take(trim(legs,[-1,0,0],-legX),'Left leg','appendages');take(trim(legs,[1,0,0],legX),'Right leg','appendages');take(trim(rest,[0,1,0],hip),'Body','body');
  }
  const parts=[];let outputVolume=0;
  for(const output of outputs){
   const components=output.solid.decompose();let number=0;
   for(const solid of components){
    keep(solid);if(solid.volume()<=volumeEps)continue;number++;
    const positions=flatten(solid.getMesh()),model=asModel(positions),edges=topology(model.faces);
    const bad=[...edges.values()].filter(es=>es.length!==2||es[0].a===es[1].a);if(bad.length)throw Error('A split cap failed closed-mesh validation ('+output.name+'). Adjust the guides and preview again. Originals are unchanged.');
    const volume=solid.volume();outputVolume+=volume;
    parts.push({positions,volume,category:output.category,name:output.name+(components.length>1?' '+number:'')});
   }
  }
  if(parts.length<2)throw Error('The guides produced only one part. Move the neck boundary through the model and preview again.');
  if(Math.abs(outputVolume-sourceVolume)>Math.max(sourceVolume*2e-5,volumeEps*100))throw Error('Volume validation found an incomplete split. Adjust the guides and preview again. Originals are unchanged.');
  self.postMessage({type:'result',parts,report:{sourceVolume,outputVolume,repaired,reconstructed,holes,referenceCount:references.length}},parts.map(p=>p.positions.buffer));
 }catch(error){self.postMessage({type:'error',error:error.message||'Split could not complete. Originals are unchanged.'});}
 finally{owned.forEach(s=>s.delete());geometries.forEach(g=>g.dispose());}
};
