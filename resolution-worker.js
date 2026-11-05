import {MeshoptSimplifier} from './meshopt_simplifier.js';
import * as T from './three.js';
import {budgetQuads,quadMesh} from './quad-mesh.js';
import {cleanMesh,topology} from './repair-core.js';
self.onmessage=async({data})=>{try{
 await MeshoptSimplifier.ready;const results=[];
 for(const item of data.items){
  const {positions,target}=item,verts=[],indices=[],map=new Map();for(let i=0;i<positions.length;i+=3){const v=Array.from(positions.subarray(i,i+3)),key=v.join(',');if(!map.has(key)){map.set(key,verts.length/3);verts.push(...v);}indices.push(map.get(key));}
  const input=new Uint32Array(indices),v=new Float32Array(verts),targetIndices=Math.max(12,Math.ceil(target/6)*6),[reduced,error]=MeshoptSimplifier.simplify(input,v,3,Math.min(input.length,targetIndices),1,['LockBorder']);
  const triangles=new Float32Array(reduced.length*3);reduced.forEach((id,i)=>triangles.set(v.subarray(id*3,id*3+3),i*3));const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(triangles,3));let q=budgetQuads(g,target);g.dispose();if(target<12||q.faces.length>target*1.5){const box=new T.Box3().setFromArray(positions),a=box.min,b=box.max;q={vertices:[[a.x,a.y,a.z],[b.x,a.y,a.z],[b.x,b.y,a.z],[a.x,b.y,a.z],[a.x,a.y,b.z],[b.x,a.y,b.z],[b.x,b.y,b.z],[a.x,b.y,b.z]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]};}
  const p=new Float32Array(q.faces.length*18);q.faces.forEach((f,i)=>[f[0],f[1],f[2],f[0],f[2],f[3]].forEach((id,j)=>p.set(q.vertices[id],i*18+j*3)));
  const model=cleanMesh([{positions:p}],1e-10),edges=topology(model.faces);if([...edges.values()].some(es=>es.length!==2)||model.report.inconsistent||model.report.orientationConflicts||model.report.degenerate)throw Error('This density cannot retain a closed mesh. Choose a higher face count. The current mesh is unchanged.');
  let volume=0;for(let i=0;i<p.length;i+=9){const a=new T.Vector3(...p.subarray(i,i+3)),b=new T.Vector3(...p.subarray(i+3,i+6)),c=new T.Vector3(...p.subarray(i+6,i+9));volume+=a.dot(b.cross(c))/6;}if(volume<=0)throw Error('The reduced mesh lost its enclosed volume. Choose a higher face count.');
  results.push({positions:p,count:q.faces.length,error,volume});
 }
 self.postMessage({results},results.map(r=>r.positions.buffer));
 }catch(error){self.postMessage({error:error.message||'Could not change the resolution.'});}};
