import * as T from './three.js';
export function installViewportControls(e){
 const {$,scene,camera,orbit,transform}=e;let single=false;const hooked=new WeakSet(),color=0x21e0ed;
 try{single=localStorage.getItem('popmarkit-single-color')==='true';}catch{}
 let boxes=true;try{boxes=localStorage.getItem('popmarkit-bounding-boxes')!=='false';}catch{}scene.userData.showBoundingBoxes=boxes;
 const boxButton=document.createElement('button');boxButton.id='toggleBoundingBox';boxButton.className='blend';boxButton.style.marginBottom='12px';boxButton.title='Show or hide object and selection bounding boxes';$('.inspector .selected').before(boxButton);
 function updateBoxes(){scene.userData.showBoundingBoxes=boxes;boxButton.textContent='Bounding Box · '+(boxes?'On':'Off');boxButton.setAttribute('aria-pressed',String(boxes));scene.traverse(o=>{if(o.type==='BoxHelper'||o.type==='Box3Helper')o.visible=boxes;});}boxButton.onclick=()=>{boxes=!boxes;try{localStorage.setItem('popmarkit-bounding-boxes',String(boxes));}catch{}updateBoxes();};updateBoxes();
 // Keep the underlying controls available to keyboard shortcuts and CAD commands.
 const toolbar=$('.reference-toolbar'),tools=toolbar.querySelector('.tools');tools.classList.add('property-tools');$('#propertiesTransform>.property-group-content').prepend(tools);toolbar.remove();
 const alignment=$('.alignment-strip'),prompt=$('#alignPrompt');function showAlignment(){alignment.hidden=prompt.textContent.startsWith('Align:');}new MutationObserver(showAlignment).observe(prompt,{childList:true,characterData:true,subtree:true});showAlignment();
 $('#viewport').after($('.workflow-bar'));
 const actions=$('#fit').parentElement,zoom=document.createElement('button');zoom.id='zoomSelected';zoom.textContent='Zoom';zoom.title='Zoom to the selected object or group';zoom.onclick=zoomSelection;actions.insertBefore(zoom,$('#fit'));
 const mode=document.createElement('button');mode.id='singleColor';mode.textContent='Single Color';mode.title='Show model surfaces in one cyan color';mode.onclick=()=>{single=!single;try{localStorage.setItem('popmarkit-single-color',String(single));}catch{}updateButton();};actions.append(mode);
 function updateButton(){mode.classList.toggle('active',single);mode.setAttribute('aria-pressed',String(single));}updateButton();
 function zoomSelection(){
  const meshes=e.selection().filter(e.visible);if(!meshes.length&&e.cad().control.object)meshes.push(e.cad().control.object);if(!meshes.length)return e.say('Select an object to zoom in.');
  const box=new T.Box3();meshes.forEach(m=>{m.updateMatrixWorld(true);box.expandByObject(m,true);});if(box.isEmpty())return;
  const center=box.getCenter(new T.Vector3()),radius=Math.max(box.getSize(new T.Vector3()).length()/2,1e-6),vertical=T.MathUtils.degToRad(camera.fov)/2,horizontal=Math.atan(Math.tan(vertical)*camera.aspect),distance=radius/Math.sin(Math.min(vertical,horizontal))*1.12,direction=camera.position.clone().sub(orbit.target).normalize();if(direction.lengthSq()<.5)direction.set(.6,.5,1).normalize();
  orbit.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);camera.near=Math.max(distance/10000,1e-7);camera.far=Math.max(distance*100,5000);camera.updateProjectionMatrix();orbit.update();e.say('Zoomed to '+(meshes.length===1?meshes[0].name:'selected objects')+'.');
 }
 function hook(object){
  if(hooked.has(object))return;const surface=object.isMesh&&object.material?.isMeshStandardMaterial,wire=object.isLineSegments&&object.parent?.isMesh&&object.parent.material?.isMeshStandardMaterial;if(!surface&&!wire)return;hooked.add(object);
  const before=object.onBeforeRender,after=object.onAfterRender,saved=new T.Color();let material=null;
  object.onBeforeRender=function(...args){before.apply(this,args);const m=args[4];if(single&&m?.color){material=m;saved.copy(m.color);m.color.setHex(color);}};
  object.onAfterRender=function(...args){if(material){material.color.copy(saved);material=null;}after.apply(this,args);};
 }
 return {zoom:zoomSelection,get single(){return single;},update(){scene.traverse(o=>{hook(o);if(o.type==='BoxHelper'||o.type==='Box3Helper')o.visible=boxes;});}};
}

