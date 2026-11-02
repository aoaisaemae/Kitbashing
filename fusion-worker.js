import Module from './manifold.js';
let engine;
self.onmessage=async({data})=>{const owned=[];try{
 engine ||= await Module({locateFile:()=>new URL('./manifold.wasm',import.meta.url).href});engine.setup();
 const {Manifold,Mesh}=engine;
 const solids=data.meshes.map(({positions,name})=>{const map=new Map(),verts=[],ids=[];for(let k=0;k<positions.length;k+=3){const key=[positions[k],positions[k+1],positions[k+2]].join(',');if(!map.has(key)){map.set(key,verts.length/3);verts.push(positions[k],positions[k+1],positions[k+2]);}ids.push(map.get(key));}const mesh=new Mesh({numProp:3,vertProperties:new Float32Array(verts),triVerts:new Uint32Array(ids)});mesh.merge();try{const solid=new Manifold(mesh);owned.push(solid);return solid;}catch{throw Error(name+' must be a closed, consistently oriented solid before precise fusion. Try Make watertight, then fuse again.');}});
 let result=Manifold.union(solids);owned.push(result);
 if(data.refinement>1){if(result.numTri()*data.refinement**2>1500000)throw Error('Refinement would exceed 1.5 million triangles. Choose a lower mesh density.');result=result.refine(data.refinement);owned.push(result);}
 const mesh=result.getMesh(),positions=new Float32Array(mesh.triVerts.length*3);for(let i=0;i<mesh.triVerts.length;i++){const v=mesh.triVerts[i]*mesh.numProp;positions.set(mesh.vertProperties.subarray(v,v+3),i*3);}
 if(!positions.length)throw Error('Fusion produced no volume. Check that the imported meshes are closed solids.');
 self.postMessage({positions},[positions.buffer]);
 }catch(e){self.postMessage({error:e.message||'Unable to fuse these meshes.'});}finally{owned.forEach(s=>s.delete());}};
