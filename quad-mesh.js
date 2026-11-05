import * as T from './three.js';
// Conforming triangle-to-quad subdivision: edge midpoints are shared across faces.
export function quadMesh(geometry,matrix=new T.Matrix4()){
 const p=geometry.attributes.position,index=geometry.index,vertices=[],faces=[],map=new Map();
 const id=v=>{const k=v.map(n=>n.toPrecision(12)).join(',');if(!map.has(k)){map.set(k,vertices.length);vertices.push(v);}return map.get(k);};
 for(let i=0;i<(index?index.count:p.count);i+=3){const v=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(matrix).toArray());if(matrix.determinant()<0)[v[1],v[2]]=[v[2],v[1]];const mids=v.map((a,j)=>a.map((n,k)=>(n+v[(j+1)%3][k])/2)),c=v[0].map((n,k)=>(n+v[1][k]+v[2][k])/3),a=v.map(id),b=mids.map(id),center=id(c);faces.push([a[0],b[0],center,b[2]],[a[1],b[1],center,b[0]],[a[2],b[2],center,b[1]]);}
 return {vertices,faces};
}
export function quadEdges(geometry){const q=quadMesh(geometry),seen=new Set(),p=[];for(const f of q.faces)for(let i=0;i<4;i++){const a=f[i],b=f[(i+1)%4],k=a<b?a+':'+b:b+':'+a;if(!seen.has(k)){seen.add(k);p.push(...q.vertices[a],...q.vertices[b]);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));return g;}
