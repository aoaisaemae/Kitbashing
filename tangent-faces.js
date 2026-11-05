import * as T from './three.js';

// Mesh-derived normals plus oblique support directions. Contact anchors are
// actual source vertices or points inside a source triangle, never box centers.
export function tangentFaces(mesh,maxFaces=48){
 mesh.updateMatrixWorld(true);const matrix=mesh.matrixWorld.clone(),signature=matrix.elements.join(','),p=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?index.count:p.count;
 const bounds=new T.Box3().setFromBufferAttribute(p).applyMatrix4(matrix),diagonal=bounds.getSize(new T.Vector3()).length(),tolerance=Math.max(diagonal*1e-6,1e-8),normalMatrix=new T.Matrix3().getNormalMatrix(matrix),bins=new Map(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
 const triangles=[],stride=Math.max(1,Math.ceil(count/3/100000));
 for(let i=0;i<count;i+=3*stride){a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);const n=ab.subVectors(b,a).cross(ac.subVectors(c,a));if(n.lengthSq()<1e-24)continue;n.applyMatrix3(normalMatrix);const area=n.length();n.normalize();const k=n.toArray().map(v=>Math.round(v*5)).join(',');if(!bins.has(k))bins.set(k,{normal:new T.Vector3(),area:0});const bin=bins.get(k);bin.normal.addScaledVector(n,area);bin.area+=area;triangles.push(i);}
 const directions=[];function add(normal,label){normal.normalize();if(normal.lengthSq()<.5||directions.some(d=>d.normal.dot(normal)>.994))return;directions.push({normal:normal.clone(),label,projection:-Infinity,center:null,area:0});}
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1])add(new T.Vector3().setComponent(axis,sign).applyMatrix3(normalMatrix),(sign<0?'−':'+')+'XYZ'[axis]);
 for(const bin of [...bins.values()].sort((a,b)=>b.area-a.area)){if(directions.length>=30)break;add(bin.normal,'Surface '+(directions.length+1));}
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)if(x||y||z){if(directions.length>=maxFaces)break;add(new T.Vector3(x,y,z).applyMatrix3(normalMatrix),'Tangent '+(directions.length+1));}
 // All vertices participate in support/contact calculations, including details
 // not sampled during normal clustering.
 for(let i=0;i<p.count;i++){a.fromBufferAttribute(p,i).applyMatrix4(matrix);for(const face of directions){const projection=a.dot(face.normal);if(projection>face.projection){face.projection=projection;face.center=a.clone();}}}
 for(const i of triangles){a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(matrix);b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(matrix);c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(matrix);const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length();for(const face of directions)if(area>face.area&&[a,b,c].every(v=>Math.abs(v.dot(face.normal)-face.projection)<=tolerance)){face.center=a.clone().add(b).add(c).multiplyScalar(1/3);face.area=area;}}
 return directions.filter(f=>f.center).map((face,i)=>({...face,id:i,signature,mesh,displaySize:Math.max(diagonal*.16,tolerance*100)}));
}

export function alignContact(base,baseFace,targetFace){
 base.updateMatrixWorld(true);targetFace.mesh.updateMatrixWorld(true);
 if(base.matrixWorld.elements.join(',')!==baseFace.signature||targetFace.mesh.matrixWorld.elements.join(',')!==targetFace.signature)throw Error('An object changed during Align. Restart Align and select its face again.');
 const delta=new T.Quaternion().setFromUnitVectors(baseFace.normal,targetFace.normal.clone().negate()),anchorOffset=baseFace.center.clone().sub(base.position).applyQuaternion(delta);
 base.position.copy(targetFace.center).sub(anchorOffset);base.quaternion.premultiply(delta);base.updateMatrixWorld(true);
 return {normal:targetFace.normal.clone(),point:targetFace.center.clone()};
}
