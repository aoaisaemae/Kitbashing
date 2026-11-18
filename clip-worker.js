import {cleanMesh,capHoles,topology} from './repair-core.js';

function closePart(positions){
 if(!positions.length)return new Float32Array();
 const part=cleanMesh([{positions:new Float32Array(positions)}],1e-8);
 const {faces}=capHoles(part);
 for(const edges of topology(faces).values()){
  if(edges.length!==2||edges[0].a===edges[1].a)throw Error('The split could not close this mesh. Try moving the clipping plane.');
 }
 const output=new Float32Array(faces.length*9);
 faces.forEach((face,i)=>face.forEach((vertex,j)=>output.set(part.verts[vertex],i*9+j*3)));
 return output;
}
function clipPolygon(vertices, distances, sign) {
 const polygon=[];
 for(let i=0;i<3;i++){
  const j=(i+1)%3,a=vertices[i],b=vertices[j],da=distances[i],db=distances[j];
  if(sign*da>=0)polygon.push(a);
  if((da<0&&db>0)||(da>0&&db<0)){
   const t=da/(da-db);
   polygon.push(a.map((v,k)=>v+t*(b[k]-v)));
  }
 }
 return polygon;
}
function emit(polygon,out){
 for(let i=1;i+1<polygon.length;i++)out.push(...polygon[0],...polygon[i],...polygon[i+1]);
}
self.onmessage=({data:{meshes,normal,offset}})=>{
 try{
  const results=meshes.map(positions=>{
   const kept=[],other=[];
   for(let i=0;i<positions.length;i+=9){
    const vertices=[0,3,6].map(j=>Array.from(positions.subarray(i+j,i+j+3)));
    const distances=vertices.map(v=>v[0]*normal[0]+v[1]*normal[1]+v[2]*normal[2]-offset);
    emit(clipPolygon(vertices,distances,1),kept);
    if(distances.some(d=>d<0))emit(clipPolygon(vertices,distances,-1),other);
   }
   return [closePart(kept),closePart(other)];
  });
  self.postMessage({results},results.flat().map(p=>p.buffer));
 }catch(error){self.postMessage({error:error.message});}
};

