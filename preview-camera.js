import * as T from './three.js';
export function previewExtent(box,aspect,elevation,zUp){const s=box.getSize(new T.Vector3());return Math.max(s.x/aspect,zUp?(elevation?s.z:s.y):(elevation?s.y:s.z),.001);}
export function configurePreviewCamera(camera,box,aspect,elevation,zUp,zoom,pan){
 const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),half=previewExtent(box,aspect,elevation,zUp)*.58/zoom;
 camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.near=.01;camera.far=Math.max(size.length()*20,1000);
 const focus=center.clone();focus.x+=pan.x;if(zUp){if(elevation)focus.z+=pan.y;else focus.y+=pan.y;}else if(elevation)focus.y+=pan.y;else focus.z-=pan.y;
 camera.position.copy(focus);const depth=Math.max(size.length()*3,100);
 if(zUp){camera.up.set(0,elevation?0:1,elevation?1:0);if(elevation)camera.position.y-=depth;else camera.position.z+=depth;}
 else{camera.up.set(0,elevation?1:0,elevation?0:-1);if(elevation)camera.position.z+=depth;else camera.position.y+=depth;}
 camera.lookAt(focus);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
