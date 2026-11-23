// Site surfaces belong only to the perspective 3D view, never plan/aerial renderers.
export function renderSiteView(renderer,scene,camera){
 const surfaces=[];
 if(camera.isOrthographicCamera)scene.traverse(node=>{if(node.userData.siteSurface){surfaces.push([node,node.visible]);node.visible=false;}});
 try{return renderer.render(scene,camera);}finally{for(const [node,visible]of surfaces)node.visible=visible;}
}
