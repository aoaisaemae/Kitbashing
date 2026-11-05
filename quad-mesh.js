import * as T from './three.js';
// Conforming triangle-to-quad subdivision: edge midpoints are shared across faces.
export function quadMesh(geometry,matrix=new T.Matrix4()){
 const p=geometry.attributes.position,index=geometry.index,vertices=[],faces=[],map=new Map();
 const id=v=>{const k=v.map(n=>n.toPrecision(12)).join(',');if(!map.has(k)){map.set(k,vertices.length);vertices.push(v);}return map.get(k);};
 if(geometry.userData.quadLayout){for(let i=0;i<p.count;i+=6){const order=geometry.userData.quadLayout==='reversed'?[0,4,1,2]:[0,1,2,5],v=order.map(j=>new T.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(matrix).toArray());if(matrix.determinant()<0)v.reverse();faces.push(v.map(id));}return {vertices,faces};}
 for(let i=0;i<(index?index.count:p.count);i+=3){const v=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(matrix).toArray());if(matrix.determinant()<0)[v[1],v[2]]=[v[2],v[1]];const mids=v.map((a,j)=>a.map((n,k)=>(n+v[(j+1)%3][k])/2)),c=v[0].map((n,k)=>(n+v[1][k]+v[2][k])/3),a=v.map(id),b=mids.map(id),center=id(c);faces.push([a[0],b[0],center,b[2]],[a[1],b[1],center,b[0]],[a[2],b[2],center,b[1]]);}
 return {vertices,faces};
}
// Join a small number of adjacent triangle patches to meet an even quad budget.
export function budgetQuads(geometry,target){
 const p=geometry.attributes.position,verts=[],map=new Map(),tris=[],point=new T.Vector3();const id=i=>{point.fromBufferAttribute(p,i);const v=point.toArray(),key=v.join(',');if(!map.has(key)){map.set(key,verts.length);verts.push(v);}return map.get(key);};for(let i=0;i<p.count;i+=3)tris.push([id(i),id(i+1),id(i+2)]);
 const needed=Math.max(0,Math.floor((tris.length*3-target)/2)),edges=new Map(),candidates=[];
 const normal=t=>new T.Vector3(...verts[t[1]]).sub(new T.Vector3(...verts[t[0]])).cross(new T.Vector3(...verts[t[2]]).sub(new T.Vector3(...verts[t[0]]))).normalize();
 if(needed)tris.forEach((t,i)=>t.forEach((a,j)=>{const b=t[(j+1)%3],key=a<b?a+':'+b:b+':'+a;if(edges.has(key)){const other=edges.get(key),u=tris[other],d=u.find(v=>v!==a&&v!==b),c=t[(j+2)%3],loop=[a,d,b,c],n=normal(t);if(new Set(loop).size!==4)return;for(let k=0;k<4;k++){const x=new T.Vector3(...verts[loop[(k+1)%4]]).sub(new T.Vector3(...verts[loop[k]])),y=new T.Vector3(...verts[loop[(k+2)%4]]).sub(new T.Vector3(...verts[loop[(k+1)%4]]));if(x.cross(y).dot(n)<=1e-15)return;}candidates.push({i,other,loop,score:n.dot(normal(u))});}else edges.set(key,i);}));
 candidates.sort((a,b)=>b.score-a.score);const used=new Set(),patches=[];for(const c of candidates){if(patches.length>=needed)break;if(used.has(c.i)||used.has(c.other))continue;used.add(c.i);used.add(c.other);patches.push(c.loop);}
 const qverts=[],qfaces=[],qmap=new Map(),qid=v=>{const key=v.map(n=>n.toPrecision(12)).join(',');if(!qmap.has(key)){qmap.set(key,qverts.length);qverts.push(v);}return qmap.get(key);};
 const subdivide=ids=>{const v=ids.map(i=>verts[i]),corners=v.map(qid),mids=v.map((a,j)=>qid(a.map((n,k)=>(n+v[(j+1)%v.length][k])/2))),center=qid(v[0].map((_,k)=>v.reduce((s,a)=>s+a[k],0)/v.length));for(let j=0;j<v.length;j++)qfaces.push([corners[j],mids[j],center,mids[(j+v.length-1)%v.length]]);};
 tris.forEach((t,i)=>{if(!used.has(i))subdivide(t);});patches.forEach(subdivide);return {vertices:qverts,faces:qfaces};
}
export function quadEdges(geometry){const q=quadMesh(geometry),seen=new Set(),p=[];for(const f of q.faces)for(let i=0;i<4;i++){const a=f[i],b=f[(i+1)%4],k=a<b?a+':'+b:b+':'+a;if(!seen.has(k)){seen.add(k);p.push(...q.vertices[a],...q.vertices[b]);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));return g;}
