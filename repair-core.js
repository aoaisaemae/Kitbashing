import * as T from './three.js';
import {MeshBVH} from './mesh-bvh.js';

const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const point=(verts,i)=>new T.Vector3(...verts[i]);
export function topology(faces){
 const edges=new Map();faces.forEach((f,i)=>{for(let j=0;j<3;j++){const a=f[j],b=f[(j+1)%3],k=edgeKey(a,b);if(!edges.has(k))edges.set(k,[]);edges.get(k).push({a,b,face:i});}});return edges;
}
export function cleanMesh(meshes,tolerance=.01){
 const verts=[],faces=[],grid=new Map(),exact=new Map(),duplicates=new Set();let welded=0,degenerate=0,duplicateFaces=0;
 for(const {positions} of meshes){for(let k=0;k<positions.length;k+=9){const f=[];for(let j=0;j<3;j++){
 const a=Array.from(positions.subarray(k+j*3,k+j*3+3));if(!a.every(Number.isFinite))throw Error('The mesh contains invalid vertex coordinates.');const key=a.join(',');let id=exact.get(key);
 if(id===undefined){const cell=a.map(v=>Math.floor(v/tolerance));let best=tolerance*tolerance;
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const entries=grid.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','));if(entries)for(const v of entries){const b=verts[v],d=(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;if(d<=best){id=v;best=d;}}}
 if(id===undefined){id=verts.length;verts.push(a);const cellKey=cell.join(',');if(!grid.has(cellKey))grid.set(cellKey,[]);grid.get(cellKey).push(id);}else welded++;exact.set(key,id);}
 f.push(id);}
 if(new Set(f).size<3||point(verts,f[1]).sub(point(verts,f[0])).cross(point(verts,f[2]).sub(point(verts,f[0]))).lengthSq()<1e-24){degenerate++;continue;}
 const key=[...f].sort((a,b)=>a-b).join(',');if(duplicates.has(key)){duplicateFaces++;continue;}duplicates.add(key);faces.push(f);
 }}
 if(!faces.length)throw Error('No usable triangles remain. Increase the model scale or reduce seam tolerance.');
 const edges=topology(faces),adj=faces.map(()=>[]);let boundary=0,nonManifold=0,inconsistent=0;const lines=[];
 for(const es of edges.values()){if(es.length===1)boundary++;if(es.length>2)nonManifold++;if(es.length===2&&es[0].a===es[1].a)inconsistent++;
 if(es.length!==2&&lines.length<18000)lines.push(...verts[es[0].a],...verts[es[0].b]);
 for(let i=1;i<es.length;i++){const a=es[0],b=es[i],same=a.a===b.a;adj[a.face].push([b.face,same]);adj[b.face].push([a.face,same]);}}
 const flips=new Int8Array(faces.length).fill(-1),components=[],faceComponent=new Int32Array(faces.length);let orientationConflicts=0,flipped=0;
 for(let i=0;i<faces.length;i++)if(flips[i]<0){const component=[],queue=[i];flips[i]=0;for(let q=0;q<queue.length;q++){const f=queue[q];component.push(f);faceComponent[f]=components.length;for(const [n,same] of adj[f]){const v=flips[f]^(same?1:0);if(flips[n]<0){flips[n]=v;queue.push(n);}else if(flips[n]!==v)orientationConflicts++;}}
 for(const f of component)if(flips[f]){[faces[f][1],faces[f][2]]=[faces[f][2],faces[f][1]];flipped++;}
 let volume=0;for(const i of component){const [a,b,c]=faces[i].map(i=>point(verts,i));volume+=a.dot(b.cross(c))/6;}if(volume<0)for(const i of component)[faces[i][1],faces[i][2]]=[faces[i][2],faces[i][1]];
 components.push(component);}
 return {verts,faces,components,faceComponent,report:{welded,degenerate,duplicateFaces,boundary,nonManifold,inconsistent,flipped,orientationConflicts,components:components.length,markers:lines}};
}
export function makeBVH(model){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(model.verts.flat(),3));g.setIndex(model.faces.flat());return {g,bvh:new MeshBVH(g,{indirect:true,maxLeafTris:8})};}
export function intersections(model,bvh){
 let count=0,selfCount=0,tests=0,limited=false;const markers=[],line=new T.Line3(),started=performance.now();
 bvh.bvhcast(bvh,new T.Matrix4(),{intersectsTriangles:(a,b,i,j)=>{
 if(i>=j)return false;i=bvh.resolveTriangleIndex(i);j=bvh.resolveTriangleIndex(j);if(++tests>2500000||performance.now()-started>8000){limited=true;return true;}const f=model.faces[i],g=model.faces[j];if(f.some(v=>g.includes(v)))return false;
 if(a.intersectsTriangle(b,line,true)){count++;if(model.faceComponent[i]===model.faceComponent[j])selfCount++;if(markers.length<12000){if(line.distanceSq()<1e-20){a.getMidpoint(line.start);b.getMidpoint(line.end);}markers.push(...line.start.toArray(),...line.end.toArray());}if(count>=10000){limited=true;return true;}}return false;}});
 return {intersectionPairs:count,selfIntersections:selfCount,intersectionLimited:limited,intersectionMarkers:markers};
}
export function capHoles(model){
 const faces=model.faces.map(f=>[...f]),edges=topology(faces),next=new Map();let holes=0;
 for(const es of edges.values()){if(es.length>2)throw Error('Non-manifold junctions require reconstruction.');if(es.length===1){const {a,b}=es[0];if(next.has(a))throw Error('Branching openings require reconstruction.');next.set(a,b);}}
 while(next.size){let v=next.keys().next().value;const start=v,loop=[];do{if(!next.has(v)||loop.length>model.verts.length)throw Error('Broken hole boundary requires reconstruction.');loop.push(v);const n=next.get(v);next.delete(v);v=n;}while(v!==start);loop.reverse();if(loop.length<3)throw Error('Short hole boundary requires reconstruction.');
 const normal=new T.Vector3();for(let i=0;i<loop.length;i++){const a=model.verts[loop[i]],b=model.verts[loop[(i+1)%loop.length]];normal.x+=(a[1]-b[1])*(a[2]+b[2]);normal.y+=(a[2]-b[2])*(a[0]+b[0]);normal.z+=(a[0]-b[0])*(a[1]+b[1]);}
 const values=normal.toArray().map(Math.abs),axis=values.indexOf(Math.max(...values));const contour=loop.map(i=>new T.Vector2(model.verts[i][(axis+1)%3],model.verts[i][(axis+2)%3]));const tris=T.ShapeUtils.triangulateShape(contour,[]);if(tris.length!==loop.length-2)throw Error('Twisted boundary requires reconstruction.');for(const tri of tris){const ids=tri.map(i=>loop[i]),[a,b,c]=ids.map(i=>point(model.verts,i));if(b.sub(a).cross(c.sub(a)).dot(normal)<0)[ids[1],ids[2]]=[ids[2],ids[1]];faces.push(ids);}holes++;}
 return {faces,holes};
}
export function printChecks(model,bvh,minWall=1,overhangAngle=45){
 const box=new T.Box3().setFromPoints(model.verts.map(v=>new T.Vector3(...v))),eps=Math.max(box.getSize(new T.Vector3()).length()*1e-7,1e-6),ray=new T.Ray(),thinMarkers=[],overhangMarkers=[];let thin=0,overhangs=0,samples=0,minThickness=Infinity;
 const stride=Math.max(1,Math.ceil(model.faces.length/1000));for(let i=0;i<model.faces.length;i+=stride){const [a,b,c]=model.faces[i].map(j=>point(model.verts,j)),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),center=a.clone().add(b).add(c).multiplyScalar(1/3);samples++;
 if(normal.y<-Math.cos(overhangAngle*Math.PI/180)&&center.y>box.min.y+minWall*.3){overhangs++;if(overhangMarkers.length<1200)overhangMarkers.push(...center.toArray());}
 ray.set(center.clone().addScaledVector(normal,-eps),normal.clone().negate());const hit=bvh.raycastFirst(ray,T.DoubleSide,eps,minWall*10);if(hit&&hit.distance>eps*2){const thickness=hit.distance+eps;minThickness=Math.min(minThickness,thickness);if(thickness<minWall){thin++;if(thinMarkers.length<1200)thinMarkers.push(...center.toArray());}}
 }
 return {thinSamples:thin,overhangSamples:overhangs,samples,minThickness:Number.isFinite(minThickness)?minThickness:null,minWall,overhangAngle,thinMarkers,overhangMarkers,dimensions:box.getSize(new T.Vector3()).toArray()};
}
// Smooth zero-isosurface via a consistent six-tetrahedra subdivision of each cell.
// Three independent scan directions vote on solid interiors; a surface band gives
// open sheets volume. The result is revalidated by the solid geometry kernel.
export function reconstruct(model,bvh,{resolution=96,minWall=1,shell=true,minimumStep=0},progress=()=>{}){
 const bounds=new T.Box3().setFromPoints(model.verts.map(v=>new T.Vector3(...v))),size=bounds.getSize(new T.Vector3());let step=Math.max(...size.toArray())/resolution;if(!step)throw Error('The mesh has no measurable size.');
 const requestedStep=step;step=Math.max(step,minimumStep);let grid=planReconstructionGrid(size.toArray(),step,minWall,shell),{radius,pad,nx,ny,nz}=grid;step=grid.step;
 if(step>requestedStep*1.001)progress('Adjusting reconstruction detail to '+step.toPrecision(3)+' mm to fit this model…');
 const min=bounds.min.clone().addScalar(-pad),total=nx*ny*nz,votes=new Uint8Array(total),field=new Float32Array(total),idx=(x,y,z)=>x+nx*(y+ny*z),ray=new T.Ray(),pos=new T.Vector3();
 const dims=[nx,ny,nz],mins=min.toArray();
 for(let axis=0;axis<3;axis++){progress('Classifying volume · '+(axis+1)+'/3');const u=(axis+1)%3,v=(axis+2)%3,direction=new T.Vector3().setComponent(axis,1);for(let j=0;j<dims[v];j++)for(let i=0;i<dims[u];i++){
 pos.copy(min).setComponent(u,mins[u]+i*step+step*1e-5).setComponent(v,mins[v]+j*step+step*1.7e-5);ray.set(pos,direction);const hits=bvh.raycast(ray,T.DoubleSide).sort((a,b)=>a.distance-b.distance);let cursor=0,winding=0;
 for(let k=0;k<dims[axis];k++){const t=k*step;while(cursor<hits.length&&hits[cursor].distance<t){const h=hits[cursor],distance=h.distance,sign=Math.sign(h.face.normal.getComponent(axis));winding+=sign;cursor++;while(cursor<hits.length&&Math.abs(hits[cursor].distance-distance)<step*1e-6&&Math.sign(hits[cursor].face.normal.getComponent(axis))===sign)cursor++;}if(winding!==0){const coords=[];coords[axis]=k;coords[u]=i;coords[v]=j;votes[idx(...coords)]++;}}
 }}
 const target={point:new T.Vector3()},band=radius+step*3;let interior=0;
 for(let z=0;z<nz;z++){if(z%8===0)progress('Rebuilding surface · '+Math.round(z/nz*100)+'%');for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=idx(x,y,z);pos.set(min.x+x*step,min.y+y*step,min.z+z*step);const hit=bvh.closestPointToPoint(pos,target,0,band),d=hit?hit.distance:band;let value=(votes[i]>=2?-d:d);if(votes[i]>=2)interior++;if(shell)value=Math.min(value,d-radius);if(x===0||y===0||z===0||x===nx-1||y===ny-1||z===nz-1)value=Math.max(value,step);field[i]=Math.abs(value)<step*1e-3?step*1e-3:value;}}
 if(!interior&&!shell)throw Error('No enclosed volume was detected. Enable “Thicken open surfaces” to turn this surface into a solid.');
 const verts=[],faces=[],cache=new Map(),tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],offsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],ids=new Array(8),coords=new Array(8);
 const edge=(a,b)=>{if(ids[a]>ids[b])[a,b]=[b,a];const key=ids[a]*total+ids[b];if(cache.has(key))return cache.get(key);const va=field[ids[a]],vb=field[ids[b]],t=va/(va-vb),p=coords[a].map((v,i)=>Math.fround(v+(coords[b][i]-v)*t)),id=verts.length;verts.push(p);cache.set(key,id);return id;};
 const triangle=(a,b,c,outward)=>{const normal=point(verts,b).sub(point(verts,a)).cross(point(verts,c).sub(point(verts,a)));if(normal.dot(outward)<0)[b,c]=[c,b];faces.push([a,b,c]);if(faces.length>1500000){const error=Error('Reconstruction needs fewer triangles. Retrying at an adjusted detail…');error.code='REPAIR_COMPLEXITY';error.nextStep=step*1.5;throw error;}};
 for(let z=0;z<nz-1;z++){if(z%16===0)progress('Triangulating · '+Math.round(z/nz*100)+'%');for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){for(let c=0;c<8;c++){const o=offsets[c];ids[c]=idx(x+o[0],y+o[1],z+o[2]);coords[c]=[min.x+(x+o[0])*step,min.y+(y+o[1])*step,min.z+(z+o[2])*step];}for(const tet of tets){const inside=tet.filter(i=>field[ids[i]]<0),outside=tet.filter(i=>field[ids[i]]>=0);if(!inside.length||!outside.length)continue;const inCenter=new T.Vector3(),outCenter=new T.Vector3();inside.forEach(i=>inCenter.add(new T.Vector3(...coords[i])));outside.forEach(i=>outCenter.add(new T.Vector3(...coords[i])));const outward=outCenter.multiplyScalar(1/outside.length).sub(inCenter.multiplyScalar(1/inside.length));if(inside.length===1||inside.length===3){const a=inside.length===1?inside[0]:outside[0],others=inside.length===1?outside:inside;triangle(...others.map(b=>edge(a,b)),outward);}else{const [a,b]=inside,[c,d]=outside,ac=edge(a,c),ad=edge(a,d),bc=edge(b,c),bd=edge(b,d);triangle(ac,bc,bd,outward);triangle(ac,bd,ad,outward);}}}}
 return {verts,faces,step,requestedStep,adjusted:step>requestedStep*1.001,gridNodes:nx*ny*nz,thickened:shell,interiorSamples:interior};
}

// Include surface thickness and padding in the budget, not only the model bounds.
export function planReconstructionGrid(size,requestedStep,minWall=1,shell=true,maxNodes=2600000){
 if(!size.every(v=>Number.isFinite(v)&&v>=0)||!Number.isFinite(requestedStep)||requestedStep<=0||!Number.isFinite(minWall)||minWall<0||maxNodes<1000)throw Error('Invalid reconstruction dimensions or settings.');
 let step=requestedStep;
 for(let attempt=0;attempt<80;attempt++){const radius=shell?Math.max(minWall/2,step*.65):0,pad=radius+step*3,[nx,ny,nz]=size.map(v=>Math.ceil((v+2*pad)/step)+1),nodes=nx*ny*nz;if(nodes<=maxNodes)return {radius,pad,nx,ny,nz,step,nodes};step*=Math.max(1.05,Math.cbrt(nodes/maxNodes)*1.03);if(!Number.isFinite(step))break;}
 throw Error('These dimensions cannot be reconstructed. Check the model units and thickness setting.');
}
