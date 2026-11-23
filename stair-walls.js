import * as T from './three.js';
export function installStairWalls(e){
 const tracked=new Map(),thickness=2*304.8;
 function clear(owner,entry){owner.remove(entry.group);entry.group.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});tracked.delete(owner);}
 return ()=>{const stairs=e.pieces().filter(m=>m.userData.realitySpace==='stairs'&&['spaces','spaces-operate'].includes(m.userData.workspaceStage));for(const [owner,entry]of tracked)if(!stairs.includes(owner)||entry.geometry!==owner.geometry)clear(owner,entry);
 for(const owner of stairs){if(tracked.has(owner))continue;owner.geometry.computeBoundingBox();const b=owner.geometry.boundingBox,s=b.getSize(new T.Vector3()),c=b.getCenter(new T.Vector3()),base=Math.max(0,b.min.z),height=Math.max(304.8,b.max.z-base),group=new T.Group();group.name='Ghosted egress enclosure — 2 ft walls';
 for(const [w,d,x,y]of [[s.x+2*thickness,thickness,c.x,b.min.y-thickness/2],[s.x+2*thickness,thickness,c.x,b.max.y+thickness/2],[thickness,s.y,b.min.x-thickness/2,c.y],[thickness,s.y,b.max.x+thickness/2,c.y]]){const wall=new T.Mesh(new T.BoxGeometry(w,d,height),new T.MeshBasicMaterial({color:0xb8fbff,transparent:true,opacity:.14,depthWrite:false,side:T.DoubleSide}));wall.position.set(x,y,base+height/2);wall.userData.egressWall=true;group.add(wall);}owner.add(group);tracked.set(owner,{group,geometry:owner.geometry});}
 };
}
