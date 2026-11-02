import Module from './manifold.js';
import {cleanMesh,makeBVH,intersections,capHoles,printChecks,reconstruct} from './repair-core.js';
const positionsOf=model=>{const p=new Float32Array(model.faces.length*9);model.faces.forEach((f,i)=>f.forEach((v,j)=>p.set(model.verts[v],i*9+j*3)));return p;};
const modelFrom=mesh=>{const p=new Float32Array(mesh.triVerts.length*3);mesh.triVerts.forEach((v,i)=>p.set(mesh.vertProperties.subarray(v*mesh.numProp,v*mesh.numProp+3),i*3));return cleanMesh([{positions:p}],1e-9);};
self.onmessage=async({data})=>{const owned=[],geometries=[];const progress=text=>self.postMessage({type:'progress',text});try{
 const {meshes,options={},action='repair'}=data;const tolerance=Math.max(.000001,Number(options.tolerance)||.01),minWall=Math.max(.05,Number(options.minWall)||1);
 progress('Welding seams and checking face directions…');const model=cleanMesh(meshes,tolerance),{g,bvh}=makeBVH(model);geometries.push(g);
 progress('Looking for openings, intersections and thin areas…');const report={...model.report,...intersections(model,bvh),...printChecks(model,bvh,minWall)};
 report.note='Thickness and overhang checks are sampled estimates for printing with +Y up; they do not replace a slicer preview.';
 if(action==='analyze'){self.postMessage({type:'analysis',report});return;}
 const engine=await Module({locateFile:()=>new URL('./manifold.wasm',import.meta.url).href});engine.setup();
 const solidOf=m=>{const mesh=new engine.Mesh({numProp:3,vertProperties:new Float32Array(m.verts.flat()),triVerts:new Uint32Array(m.faces.flat())});mesh.merge();const s=new engine.Manifold(mesh);owned.push(s);if(!Number.isFinite(s.volume())||s.volume()<=1e-12)throw Error('Mesh does not enclose a positive volume.');return s;};
 let result,holes=0,usedReconstruction=false,fallbackReason='',source=model,sourceBVH=bvh,resolution=null,adjusted=false,rebuildRetries=0;
 if(options.method!=='rebuild')try{
 progress('Closing holes and uniting overlapping shells…');const capped=capHoles(model);holes=capped.holes;
 source=cleanMesh([{positions:positionsOf({verts:model.verts,faces:capped.faces})}],1e-9);
 const built=makeBVH(source);geometries.push(built.g);sourceBVH=built.bvh;const cross=intersections(source,sourceBVH);
 if(cross.selfIntersections||cross.intersectionLimited||source.report.orientationConflicts)throw Error('Intersecting or ambiguous surfaces need reconstruction.');
 const solids=source.components.map(component=>solidOf({verts:source.verts,faces:component.map(i=>source.faces[i])}));
 result=engine.Manifold.union(solids);owned.push(result);if(result.volume()<=1e-12){result=null;throw Error('Union did not enclose a volume.');}
 }catch(e){result=null;fallbackReason=e.message||'Exact repair could not validate this mesh.';if(options.method==='preserve')throw Error(fallbackReason+' Choose Automatic or Rebuild to resolve this inside the studio.');}
 if(!result){usedReconstruction=true;progress('Reconstructing a closed triangular surface…');let minimumStep=0;for(let attempt=0;attempt<5;attempt++){try{const rebuilt=reconstruct(source,sourceBVH,{resolution:Number(options.resolution)||96,minWall,shell:options.shell!==false,minimumStep},progress);resolution=rebuilt.step;adjusted=rebuilt.adjusted;result=solidOf(rebuilt);break;}catch(e){if(e.code!=='REPAIR_COMPLEXITY'||attempt===4)throw e;minimumStep=e.nextStep;rebuildRetries++;progress('Automatically reducing surface complexity · attempt '+(attempt+2));}}}
 progress('Validating the repaired solid and checking print risks…');
 const output=modelFrom(result.getMesh()),built=makeBVH(output);geometries.push(built.g);
 if(output.report.boundary||output.report.nonManifold||output.report.inconsistent)throw Error('Output validation found '+output.report.boundary+' open edges and '+output.report.nonManifold+' junctions ('+output.report.degenerate+' collapsed faces). Try another rebuild detail; your originals are unchanged.');
 const after={...output.report,...printChecks(output,built.bvh,minWall),volume:result.volume(),intersectionPairs:0};
 const positions=positionsOf(output);
 self.postMessage({type:'result',positions,report:{before:report,after,holes,usedReconstruction,fallbackReason,resolution,adjusted,rebuildRetries,thickened:usedReconstruction&&options.shell!==false,method:usedReconstruction?'Surface reconstruction':'Surface-preserving repair + solid union',note:report.note}},[positions.buffer]);
 }catch(e){self.postMessage({type:'error',error:e.message||'Repair could not complete. Your originals are unchanged.'});}finally{owned.forEach(s=>s.delete());geometries.forEach(g=>g.dispose());}};
