import {installSharedLibrary} from './shared-library.js?v=add-all';
import {installFolderLibrary} from './folder-library.js';
import {installResolutionTools} from './resolution-tools.js?v=restore-outline-points';
import {installProjectMass} from './project-mass.js';
import {installViewportControls} from './viewport-controls.js';
import {installWorkflow} from './workflow-tabs.js?v=iteration-mix';
import {installSplit} from './split-tools.js';
import {organizeProperties} from './properties.js';
import {installLayers} from './layers.js';
import {describeShape,matchReferences} from './shape-features.js';
import {installReferenceLayout} from './reference-layout.js';
import {installCad} from './cad-tools.js';
import {quadMesh} from './quad-mesh.js';
import * as T from 'three';
import {OrbitControls} from './OrbitControls.js';
import {TransformControls} from './TransformControls.js';
import {OBJLoader} from './OBJLoader.js';
import {splitParts} from './geometry.js';
const $=s=>document.querySelector(s), view=$('#viewport'), colors=[0x21e0ed,0xdc24f4,0xff5284], assets=[], pieces=[];
let resolutionTools=null;let massTools=null;let viewTools=null;let workflowTools=null;let layerTools=null,splitTools=null;let layoutTools=null;let cadTools=null;const featureCategories=[{id:'arms',name:'Arms'},{id:'legs',name:'Legs'},{id:'whole',name:'Whole Figures'},{id:'body',name:'Body'},{id:'accessories',name:'Accessories'},{id:'heads',name:'Heads'},{id:'ears',name:'Ears'}];const folders=featureCategories.map(f=>({...f}));let currentFolder='*';let previousSelectionIds=[],lastEditedIds=[];
let selected=null,serial=0,wire=false,busy=false;
const selection=new Set(),selectionPivot=new T.Object3D(),selectionOutlines=[];let pivotMatrix=new T.Matrix4();
const renderer=new T.WebGLRenderer({antialias:true,alpha:true,stencil:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x0b0d10);view.append(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(40,1,.1,5000);camera.position.set(110,105,150);
const programView=()=>['resolution','iterations'].includes(workflowTools?.active);
const floorView=()=>workflowTools?.active==='floor-plates';
const unitsPerFoot=304.8;
const programCamera=new T.OrthographicCamera();
function displayCamera(){
 const flat=programView(),axon=floorView()&&layoutTools?.axonometric;
 if(!flat&&!axon)return camera;
 const distance=Math.max(.01,camera.position.distanceTo(orbit.target));
 const half=distance*Math.tan(T.MathUtils.degToRad(camera.fov/2));
 programCamera.left=-half*camera.aspect;programCamera.right=-programCamera.left;
 programCamera.top=half;programCamera.bottom=-half;programCamera.near=camera.near;programCamera.far=camera.far;
 programCamera.position.copy(camera.position);
 if(flat)programCamera.position.copy(orbit.target).add(new T.Vector3(0,0,distance));
 programCamera.lookAt(orbit.target);programCamera.updateProjectionMatrix();programCamera.updateMatrixWorld(true);
 return programCamera;
}
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,12,0);orbit.enableDamping=true;orbit.dampingFactor=.22;orbit.rotateSpeed=.8;let lastCameraMotion=-Infinity;orbit.addEventListener("change",()=>{lastCameraMotion=performance.now();});
scene.add(selectionPivot);
const transform=new TransformControls(camera,renderer.domElement);scene.add(transform.getHelper());transform.addEventListener('dragging-changed',e=>orbit.enabled=!e.value);transform.addEventListener('objectChange',()=>{updateInputs();refreshStats();});
scene.add(new T.HemisphereLight(0xd6f5ff,0x333045,2.6));const light=new T.DirectionalLight(0xffffff,3);light.position.set(60,100,80);scene.add(light);const rim=new T.DirectionalLight(0xdc24f4,2);rim.position.set(-80,20,-60);scene.add(rim);
const grid=new T.GridHelper(600,60,0x33434b,0x1c252d);grid.position.y=-.15;scene.add(grid);
const observer=new ResizeObserver(()=>{renderer.setSize(view.clientWidth,view.clientHeight);camera.aspect=view.clientWidth/view.clientHeight;camera.updateProjectionMatrix();});observer.observe(view);
renderer.setAnimationLoop(()=>{orbit.update();layerTools?.update();splitTools?.update();workflowTools?.update();cadTools?.update();viewTools?.update();massTools?.update();resolutionTools?.update();layoutTools?.update();selectionOutlines.forEach(({mesh,halo})=>{mesh.updateMatrixWorld(true);halo.geometry=mesh.geometry;halo.matrix.copy(mesh.matrixWorld);halo.matrixWorldNeedsUpdate=true;halo.visible=isVisible(mesh)&&resolutionTools?.allowsMesh(mesh)!==false;halo.material.clippingPlanes=mesh.material.clippingPlanes;});transform.camera=displayCamera();const hidden=pieces.filter(mesh=>mesh.visible&&resolutionTools?.allowsMesh(mesh)===false);
 for(const mesh of hidden)mesh.visible=false;
 try{renderer.render(scene,transform.camera);}finally{for(const mesh of hidden)mesh.visible=true;}});
function say(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(say.timer);say.timer=setTimeout(()=>$('#toast').style.display='none',5500);$('#status').textContent=s;}
function material(i){return new T.MeshStandardMaterial({color:colors[i%3],metalness:.28,roughness:.36,wireframe:false});}
function updateInputs(){for(const el of document.querySelectorAll('[data-prop]')){const p=el.dataset.prop,a=el.dataset.axis;el.disabled=!selected||![...selection].every(canEdit);el.value=selected?(p==='rotation'?T.MathUtils.radToDeg(selected[p][a]):p==='position'?selected[p][a]/unitsPerFoot:selected[p][a]).toFixed(p==='position'?4:2):p==='scale'?'1.00':'0.00';}}
for(const [prop,title] of [['position','Position · ft'],['rotation','Rotation · °'],['scale','Scale']]){$('#transforms').insertAdjacentHTML('beforeend',`<label class="transform-label">${title}</label><div class="inputs">${['x','y','z'].map(axis=>`<label>${axis.toUpperCase()}<input aria-label="${prop} ${axis}" data-prop="${prop}" data-axis="${axis}" type="number" step="${prop==='scale'?'.1':'1'}"></label>`).join('')}</div>`);}
$('#transforms').addEventListener('change',e=>{if(busy||splitTools?.active||!selected||![...selection].every(canEdit)||!e.target.dataset.prop)return;let n=Number(e.target.value);const p=e.target.dataset.prop;if(!Number.isFinite(n)||(p==='scale'&&n<=0)){say('Scale must be positive.');updateInputs();return;}selected[p][e.target.dataset.axis]=p==='rotation'?T.MathUtils.degToRad(n):p==='position'?n*unitsPerFoot:n;syncGroup();updateInputs();});
function select(mesh){setSelection(mesh?[mesh]:[]);}
function selectionGroup(mesh){if(!mesh?.userData.groupId)return mesh?[mesh]:[];return pieces.filter(m=>m.userData.groupId===mesh.userData.groupId&&isVisible(m));}
function setSelection(meshes){meshes=meshes.flatMap(selectionGroup);selection.clear();meshes.filter(m=>pieces.includes(m)&&canEdit(m)).forEach(m=>selection.add(m));selectionOutlines.splice(0).forEach(({halo})=>{scene.remove(halo);halo.material.dispose();});
 for(const mesh of selection){
  const material=new T.ShaderMaterial({
   side:T.BackSide,transparent:true,depthWrite:false,clipping:true,
   uniforms:{},
   vertexShader:`#include <clipping_planes_pars_vertex>
void main(){
 vec4 mvPosition=modelViewMatrix*vec4(position,1.);
 vec2 direction=(normalMatrix*normal).xy;
 vec4 screen=projectionMatrix*mvPosition;
 screen.xy+=direction*screen.w*.008;
 gl_Position=screen;
 #include <clipping_planes_vertex>
}`,
   fragmentShader:`#include <clipping_planes_pars_fragment>
void main(){
 #include <clipping_planes_fragment>
 gl_FragColor=vec4(.24,1.,1.,.82);
}`
  });
  const halo=mesh.isLine?new T.LineSegments(mesh.geometry,new T.LineBasicMaterial({color:0x21e0ed,depthTest:false})):new T.Mesh(mesh.geometry,material);if(mesh.isLine)material.dispose();
  halo.matrixAutoUpdate=false;
  scene.add(halo);
  selectionOutlines.push({mesh,halo});
 }
if(selection.size>1){const bounds=new T.Box3();selection.forEach(m=>bounds.expandByObject(m));selectionPivot.position.copy(bounds.getCenter(new T.Vector3()));selectionPivot.rotation.set(0,0,0);selectionPivot.scale.set(1,1,1);selectionPivot.updateMatrixWorld(true);pivotMatrix.copy(selectionPivot.matrixWorld);selected=selectionPivot;}else selected=[...selection][0]||null;if(programView()&&selected){setModelMode(transform.mode);transform.attach(selected);}else{transform.showX=transform.showY=transform.showZ=true;if(selected&&!programView())transform.attach(selected);else transform.detach();}$('#selectedName').textContent=selection.size>1?selection.size+' objects selected':selected?.name||'Select an object';$('#selectedInfo').textContent=selection.size?([...selection].reduce((n,m)=>n+(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count),0)).toLocaleString()+' quads':'Shift-click to add · Ctrl-click to remove';updateInputs();refreshStats();}
function syncGroup(){if(selected!==selectionPivot)return;selectionPivot.updateMatrixWorld(true);const delta=new T.Matrix4().multiplyMatrices(selectionPivot.matrixWorld,pivotMatrix.clone().invert());for(const m of selection){m.updateMatrix();m.matrix.premultiply(delta);m.matrix.decompose(m.position,m.quaternion,m.scale);m.updateMatrixWorld(true);}pivotMatrix.copy(selectionPivot.matrixWorld);}
function pickSelection(mesh,e){rememberSelection();if(e.ctrlKey||e.metaKey){if(mesh)setSelection([...selection].filter(m=>!selectionGroup(mesh).includes(m)));}else if(e.shiftKey&&mesh?.userData.savedIterationId&&workflowTools?.active==='iterations'&&selection.has(mesh)){setSelection([...selection].filter(m=>!selectionGroup(mesh).includes(m)));}else if(e.shiftKey){if(mesh)setSelection([...selection,mesh]);}else select(mesh);}
function refreshStats(){layerTools?.render();const current=pieces.filter(inStage);$('#stats').textContent=`${current.length} object${current.length===1?'':'s'} / feet`;$('#sceneCount').textContent=current.length;const list=$('#sceneList');list.replaceChildren();current.forEach(m=>{const b=document.createElement('button');b.textContent='◇  '+m.name;b.classList.toggle('active',selection.has(m));b.onclick=e=>pickSelection(m,e);list.append(b);});}
function addPiece(asset){const m=asset.curve?new T.LineSegments(asset.geometry.clone(),new T.LineBasicMaterial({color:0x80ddff})):new T.Mesh(asset.geometry.clone(),material(serial++));if(asset.curve)m.userData.outlineCurve=true;m.name=asset.name;m.studioId=crypto.randomUUID();m.userData.workspaceStage=asset.stage||(workflowTools?.active==='project'?'project':'figures');m.userData.featureCategory=asset.folderId||asset.category||featureCategory(null,asset.name);if(asset.layerId)m.userData.layerId=asset.layerId;layerTools?.newObject(m);if(!busy&&!restoring)lastEditedIds=[m.studioId];m.position.copy(asset.offset||new T.Vector3(0,-asset.geometry.boundingBox.min.y,0));scene.add(m);pieces.push(m);select(m);return m;}
function thumbnail(g,index){const s=new T.Scene();s.background=new T.Color(0x191d23);s.add(new T.HemisphereLight(0xffffff,0x4a465d,3));const l=new T.DirectionalLight(0xffffff,4);l.position.set(2,3,4);s.add(l);const mesh=new T.Mesh(g,material(index));s.add(mesh);const b=g.boundingBox,size=b.getSize(new T.Vector3()).length(),center=b.getCenter(new T.Vector3());const cam=new T.PerspectiveCamera(38,1.2,.01,10000);cam.position.copy(center).add(new T.Vector3(size*.85,size*.65,size));cam.lookAt(center);const old=renderer.getSize(new T.Vector2());renderer.setSize(180,150,false);renderer.render(s,cam);const url=renderer.domElement.toDataURL();renderer.setSize(old.x,old.y,false);mesh.material.dispose();return url;}
function updateLibraryCount(){$('#count').textContent=assets.filter(a=>!a.mass).length;const clear=$('#clearCollection');if(clear)clear.disabled=!assets.some(a=>!a.mass);}
function renderAsset(asset){if(asset.mass||(activeCollection&&asset.collection!==activeCollection))return;if(currentFolder!=='*'&&(asset.folderId||'')!==currentFolder)return;const card=document.createElement('div');card.className='card';const add=document.createElement('button');add.className='asset-add';add.title='Add '+asset.name+' to canvas';const img=document.createElement('img');img.src=asset.thumbnail||(asset.thumbnail=thumbnail(asset.geometry,assets.indexOf(asset)));img.alt=asset.name;const name=document.createElement('b');name.textContent=asset.name;const info=document.createElement('small');info.textContent=asset.geometry.attributes.position.count.toLocaleString()+' quads · + add';add.append(img,name,info);add.onclick=()=>{if(busy||splitTools?.active)return;addPiece(asset);say(asset.name+' added');};const remove=document.createElement('button');remove.className='asset-delete';remove.textContent='×';remove.title='Remove from library · placed objects stay';remove.setAttribute('aria-label','Remove '+asset.name+' from library');remove.onclick=()=>{if(busy)return;const i=assets.indexOf(asset);if(i<0)return;assets.splice(i,1);asset.geometry.dispose();renderAssets();say('Removed '+asset.name+' from library. Undo restores it.');};const move=document.createElement('select');move.className='asset-folder';move.setAttribute('aria-label','Category for '+asset.name);const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;move.append(o);};folders.forEach(f=>option(f.id,f.name));move.value=asset.folderId||'';move.onchange=()=>{if(busy)return;checkpoint();const i=assets.indexOf(asset);if(i<0)return;assets[i]={...asset,folderId:move.value,manualCategory:true};renderAssets();say('Feature category updated. Undo restores it.');};card.append(add,remove,move);addCollectionPicker(card,asset);$('#cards').append(card);}
function renderAssets(){collectionOptions($('#collectionFilter'),activeCollection,'All folders');normalizeCategories();$('#cards').replaceChildren();assets.forEach(renderAsset);if(!$('#cards .card')){const empty=document.createElement('p');empty.className='library-empty hint';empty.textContent=activeCollection?'No parts match this folder and feature category.':currentFolder==='*'?'Your collection is empty. Drop OBJ files above to add pieces.':'This feature category is empty. Import files here or choose this category on an existing item.';$('#cards').append(empty);}updateLibraryCount();syncFolderControls();}
function addAsset(g,name,folderId=currentFolder==='*'?null:currentFolder||null){if(g.index)g=g.toNonIndexed();g.computeVertexNormals();g.computeBoundingBox();const asset={geometry:g,name,folderId:featureCategory(folderId,name),collection:folderFromFilename(name)};assets.push(asset);$('#cards .library-empty')?.remove();renderAsset(asset);updateLibraryCount();syncFolderControls();return asset;}
async function importFiles(files){if(busy||splitTools?.active)return;const importStart=pieces.length;files=Array.from(files);for(const file of files){if(!/\.obj$/i.test(file.name)){say('Choose an OBJ file.');continue;}if(file.size>250*1024*1024){say('Please use OBJ files up to 250 MiB each.');continue;}try{const obj=new OBJLoader().parse(await file.text()),positions=[],parts=[];obj.updateMatrixWorld(true);obj.traverse(m=>{if(m.isMesh){const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld);const vertices=g.attributes.position.array;for(const v of vertices)positions.push(v);for(const part of splitParts(vertices,true))parts.push(part);g.dispose();}});if(!positions.length)throw Error('No mesh faces found');const whole=new T.BufferGeometry();whole.setAttribute('position',new T.Float32BufferAttribute(positions,3));whole.computeBoundingBox();const center=whole.boundingBox.getCenter(new T.Vector3()),floor=whole.boundingBox.min.y;for(const [i,part] of parts.entries()){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(part,3));g.translate(-center.x,-floor,-center.z);g.computeBoundingBox();const offset=g.boundingBox.getCenter(new T.Vector3());g.translate(-offset.x,-offset.y,-offset.z);const name=file.name.replace(/\.obj$/i,'')+(parts.length>1?' · part '+(i+1):'');const a=addAsset(g,name);a.offset=offset;addPiece(a);}whole.dispose();say(file.name+' imported · '+parts.length+' editable part(s)');}catch(e){say('Could not import '+file.name+': '+e.message);}}renderAssets();markEdited(pieces.slice(importStart));fit();}
installFolderLibrary($('#drop'),{importFiles,isBusy:()=>busy||!!splitTools?.active});
installSharedLibrary($('#drop'),{addPiece:addBundledPiece,finish:pieces=>{markEdited(pieces);fit();},canImport:()=>!busy&&!splitTools?.active&&workflowTools?.active==='figures'});
async function exportLocalLibrary(button){
 if(busy||button.disabled)return;
 const library=assets.filter(asset=>!asset.mass);
 if(!library.length)return say('No saved library pieces to export.');
 button.disabled=true;
 try{
  const encoder=new TextEncoder();
  const pieces=library.map(asset=>({name:asset.name,category:asset.folderId,collection:asset.collection,offset:asset.offset?.toArray(),quadLayout:asset.geometry.userData.quadLayout,count:asset.geometry.attributes.position.array.length}));
  const metadata=encoder.encode(JSON.stringify({version:1,pieces}));
  const header=new Uint8Array(4);new DataView(header.buffer).setUint32(0,metadata.length,true);
  const data=new Blob([header,metadata,...library.map(asset=>asset.geometry.attributes.position.array)]);
  const compressed=await new Response(data.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const url=URL.createObjectURL(compressed),link=document.createElement('a');
  link.href=url;link.download='popmarkit-library.pmk.gz';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  say('Exported '+pieces.length+' library pieces.');
 }catch(error){say('Library export failed. '+error.message);}finally{button.disabled=false;}
}
const libraryExport=document.createElement('button');
libraryExport.type='button';libraryExport.textContent='Export Library';
libraryExport.onclick=()=>exportLocalLibrary(libraryExport);
$('#drop').after(libraryExport);
$('#files').onchange=e=>{importFiles(e.target.files);e.target.value='';};for(const type of ['dragover','drop'])$('#drop').addEventListener(type,e=>{e.preventDefault();if(type==='drop')importFiles(e.dataTransfer.files);});
function fit(extra,only=false){
 if(!(extra instanceof T.Box3)&&resolutionTools?.fitGrid())return;
 const bounds=extra instanceof T.Box3?extra.clone():new T.Box3();
 if(!only)pieces.filter(isVisible).forEach(mesh=>bounds.expandByObject(mesh));
 if(bounds.isEmpty())return;
 const center=bounds.getCenter(new T.Vector3());
 const flat=programView()||layoutTools?.flat;
 const direction=flat?new T.Vector3(0,0,1):camera.position.clone().sub(orbit.target).normalize();
 if(!direction.lengthSq())direction.set(0,0,1);
 const right=new T.Vector3().crossVectors(camera.up,direction).normalize();
 const up=new T.Vector3().crossVectors(direction,right);
 const tangent=Math.tan(T.MathUtils.degToRad(camera.fov/2));
 let distance=0,depth=0;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const offset=new T.Vector3(x,y,z).sub(center);
  const forward=offset.dot(direction);
  const frame=Math.max(Math.abs(offset.dot(right))/camera.aspect,Math.abs(offset.dot(up)))/(tangent*.87);
  depth=Math.max(depth,forward);
  distance=Math.max(distance,frame+(flat?0:forward));
 }
 distance=Math.max(distance,depth*1.05,0.01);
 camera.near=Math.max(.00001,Math.min(.1,(distance-depth)*.5));
 camera.far=Math.max(5000,distance*20);
 orbit.target.copy(center);
 camera.position.copy(center).addScaledVector(direction,distance);
 camera.updateProjectionMatrix();
 orbit.update();
}
$('#fit').onclick=fit;
$('#arrange').onclick=()=>{const targets=pieces.filter(canEdit);if(!targets.length)return;let cell=0;targets.forEach(m=>{m.updateMatrixWorld();cell=Math.max(cell,new T.Box3().setFromObject(m).getSize(new T.Vector3()).length());});cell*=.8;const cols=Math.ceil(Math.sqrt(targets.length));targets.forEach((m,i)=>{const b=new T.Box3().setFromObject(m),c=b.getCenter(new T.Vector3());m.position.x+=(i%cols-(cols-1)/2)*cell-c.x;m.position.z+=(Math.floor(i/cols)-(Math.ceil(targets.length/cols)-1)/2)*cell-c.z;m.position.y-=b.min.y;});setSelection([...selection]);fit();say('Objects arranged in a grid');};
function setModelMode(mode){
 transform.setMode(mode);
 const flat=programView();
 transform.showX=transform.showY=!flat||mode!=='rotate';
 transform.showZ=!flat||mode==='rotate';
 if(flat)transform.setSpace('world');
 document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setModelMode(b.dataset.mode));$('#snap').onchange=e=>{transform.setTranslationSnap(e.target.checked?unitsPerFoot:null);transform.setRotationSnap(Number($('#rotationStep')?.value)?T.MathUtils.degToRad(Number($('#rotationStep').value)):null);};
$('#reset').onclick=()=>{const targets=[...selection].filter(canEdit);for(const m of targets){m.position.set(0,-m.geometry.boundingBox.min.y,0);m.rotation.set(0,0,0);m.scale.set(1,1,1);}setSelection(targets);};
$('#duplicate').onclick=()=>{const targets=[...selection].filter(canEdit),copies=[];for(const m of targets){const copy=cloneAtCurrentTransform(m);copy.position.add(new T.Vector3(10,0,programView()?0:10));copies.push(copy);}setSelection(copies);};
function remove(){if(splitTools?.active)return;const targets=[...selection].filter(canEdit);select(null);for(const m of targets){scene.remove(m);pieces.splice(pieces.indexOf(m),1);m.geometry.dispose();m.material.dispose();}refreshStats();}$('#remove').onclick=remove;
$('#wire').onclick=()=>{wire=!wire;pieces.forEach(m=>m.material.wireframe=wire);$('#wire').classList.toggle('active',wire);};
document.addEventListener('keydown',e=>{if(busy||/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='Delete')remove();const map={w:'translate',e:'rotate',r:'scale'};if(map[e.key])document.querySelector(`[data-mode="${map[e.key]}"]`).click();});
$('#detail').oninput=e=>$('#detailValue').textContent=['Original','Fine · 4× quads','Ultra · 9× quads'][+e.target.value-1];
function fuse(){
 const targets=[...selection].filter(canEdit);
 if(targets.length<2)return say('Select at least two objects to group.');
 const id=crypto.randomUUID();
 targets.forEach(mesh=>mesh.userData.groupId=id);
 setSelection(targets);markEdited(targets);
 say('Grouped '+targets.length+' objects.');
}
$('#fuse').onclick=fuse;
function exportOBJ(){if(splitTools?.active)return say('Finish or cancel Split before exporting.');if(!pieces.some(isVisible))return say('Add objects before exporting.');if(busy)return say('Wait for the current operation to finish.');const vertices=[],faces=[],map=new Map(),edges=new Map();for(const m of pieces.filter(m=>isVisible(m)&&m.isMesh)){m.updateMatrixWorld(true);const q=quadMesh(m.geometry,m.matrixWorld),ids=q.vertices.map(v=>{const k=m.uuid+':'+v.map(n=>n.toPrecision(12)).join(',');if(!map.has(k)){map.set(k,vertices.length+1);vertices.push(v);}return map.get(k);});for(const f of q.faces){const face=f.map(i=>ids[i]);faces.push(face);for(let j=0;j<4;j++){const x=face[j],y=face[(j+1)%4],k=x<y?x+':'+y:y+':'+x;edges.set(k,(edges.get(k)||0)+1);}}}const bad=[...edges.values()].filter(n=>n!==2).length;if(bad)return say(bad+' open or non-manifold edges found. Run Make watertight before exporting.');const floor=vertices.reduce((n,v)=>Math.min(n,v[1]),Infinity),lines=['# POPMARKIT · quadrangular mesh · millimeters','o POPMARKIT_composition',...vertices.map(v=>'v '+[v[0],v[1]-floor,v[2]].map(n=>n.toPrecision(12)).join(' ')),...faces.map(f=>'f '+f.join(' '))],url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'})),link=document.createElement('a');link.href=url;link.download='popmarkit-composition.obj';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);say('Quad OBJ exported. Clipping views are not baked; use ApplyClippingCut to export a cut.');}
$('#export').onclick=exportOBJ;
updateInputs();
// Scene history shares immutable geometry buffers and stores independent transforms.
const past=[],future=[];let restoring=false;
const snapshot=()=>({workflow:workflowTools?.save(),layers:layerTools?.save(),cad:cadTools?.saveState(),previousSelectionIds:[...previousSelectionIds],lastEditedIds:[...lastEditedIds],folders:folders.map(f=>({...f})),currentFolder,collections:[...collections],activeCollection,assets:assets.map(a=>({...a})),items:pieces.map(m=>({geometry:m.geometry.clone(),name:m.name,id:m.studioId,color:m.material.color.getHex(),position:m.position.toArray(),rotation:m.rotation.toArray(),scale:m.scale.toArray(),data:{...m.userData}})),selected:pieces.indexOf(selected),selectedIndices:[...selection].map(m=>pieces.indexOf(m))});
function release(s){s.items.forEach(m=>m.geometry.dispose());}
function checkpoint(){if(restoring||busy)return;past.push(snapshot());if(past.length>30)release(past.shift());future.splice(0).forEach(release);historyButtons();}
function historyButtons(){$('#undo').disabled=!past.length||busy;$('#redo').disabled=!future.length||busy;}
function restore(s){restoring=true;splitTools?.cancel();workflowTools?.restore(s.workflow);layerTools?.restore(s.layers);previousSelectionIds=s.previousSelectionIds||[];lastEditedIds=s.lastEditedIds||[];if(s.folders){folders.splice(0,folders.length,...s.folders.map(f=>({...f})));collections=s.collections||[];activeCollection=s.activeCollection||"";currentFolder=s.currentFolder??'*';}if(s.assets){assets.splice(0,assets.length,...s.assets);renderAssets();}select(null);pieces.splice(0).forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.dispose();});s.items.forEach(item=>{const m=addPiece({geometry:item.geometry,name:item.name,curve:item.data?.outlineCurve});m.studioId=item.id||m.studioId;m.material.color.setHex(item.color);m.position.fromArray(item.position);m.rotation.fromArray(item.rotation);m.scale.fromArray(item.scale);m.userData={...item.data};});setSelection((s.selectedIndices||[s.selected]).map(i=>pieces[i]).filter(Boolean));cadTools?.restoreState(s.cad);layerTools?.update();cadTools?.wire(wire);restoring=false;release(s);historyButtons();}
function undo(){if(busy||!past.length)return;future.push(snapshot());restore(past.pop());say('Undone');}
function redo(){if(busy||!future.length)return;past.push(snapshot());restore(future.pop());say('Redone');}
const historyUI=document.createElement('div');historyUI.className='canvas-actions';historyUI.innerHTML='<button id="undo" title="Undo · Ctrl/Cmd Z">↶ Undo</button><button id="redo" title="Redo · Ctrl/Cmd Shift Z">↷ Redo</button><button id="shortcuts" title="Keyboard shortcuts">?</button>';
$('.canvas-head').prepend(historyUI);$('#undo').onclick=undo;$('#redo').onclick=redo;
$('#shortcuts').onclick=()=>say('Shift-click: add selection · Ctrl/Cmd-click: deselect · Drag empty space: box select · Ctrl/Cmd Z: undo · Shift Z / Ctrl Y: redo · Ctrl/Cmd D: duplicate · Delete/Backspace: remove · MO/RO/SC or W/E/R: move/rotate/scale · Shift + scale axis: uniform scaling · F: frame selection · A: fit all · Escape: deselect · X: local/world axes');
for(const id of ['arrange','reset','duplicate','remove','fuse']){const el=$('#'+id),fn=el.onclick;el.onclick=async e=>{if(busy||splitTools?.active)return;checkpoint();await fn(e);historyButtons();};}
$('#cards').addEventListener('click',e=>{if(e.target.closest('.asset-add,.asset-delete'))checkpoint();},true);
$('#files').addEventListener('change',checkpoint,true);$('#drop').addEventListener('drop',checkpoint,true);
$('#transforms').addEventListener('change',checkpoint,true);
transform.addEventListener('mouseDown',checkpoint);
// Capture shortcuts before the original W/E/R handler so each edit is recorded once.
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;if(mod&&['z','y','d'].includes(key)){e.preventDefault();e.stopImmediatePropagation();if(key==='z')e.shiftKey?redo():undo();else if(key==='y')redo();else $('#duplicate').click();return;}if(busy)return;if(key==='delete'||key==='backspace'){e.preventDefault();e.stopImmediatePropagation();$('#remove').click();}else if(key==='escape'){rememberSelection();select(null);}else if(key==='a'){e.preventDefault();fit();}else if(key==='f'&&selected){const b=[...selection].reduce((box,m)=>box.expandByObject(m),new T.Box3()),c=b.getCenter(new T.Vector3()),d=Math.max(b.getSize(new T.Vector3()).length(),10);orbit.target.copy(c);camera.position.copy(c).add(new T.Vector3(.75,.65,1).normalize().multiplyScalar(d*1.7));}else if(key==='x'&&!programView()){transform.setSpace(transform.space==='local'?'world':'local');say('Transform axes: '+transform.space);}},true);
historyButtons();

// Sequential two-letter commands, with a short timeout between keystrokes.
let command='',commandAt=0,shiftHeld=false;
document.addEventListener('keydown',e=>{if(e.key==='Shift')shiftHeld=true;if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||e.ctrlKey||e.metaKey||e.altKey||busy)return;if(e.key.length!==1)return;const now=performance.now();command=(now-commandAt<1000?command:'')+e.key.toLowerCase();command=command.slice(-2);commandAt=now;if(command==='mi'){e.preventDefault();e.stopImmediatePropagation();command='';mirrorSelection();return;}const modes={ro:'rotate',mo:'translate',sc:'scale'};if(modes[command]){e.preventDefault();e.stopImmediatePropagation();document.querySelector('[data-mode="'+modes[command]+'"]').click();command='';}},true);
document.addEventListener('keyup',e=>{if(e.key==='Shift')shiftHeld=false;});window.addEventListener('blur',()=>shiftHeld=false);
let scaleStart;
transform.addEventListener('mouseDown',()=>{scaleStart=selected?.scale.clone();});
transform.addEventListener('objectChange',()=>{if(transform.mode==='scale'&&transform.dragging&&shiftHeld&&selected&&scaleStart){const axis=transform.axis?.toLowerCase();if(['x','y','z'].includes(axis)){const ratio=selected.scale[axis]/scaleStart[axis];selected.scale.copy(scaleStart).multiplyScalar(ratio);updateInputs();}}});
// Stable browser-local workspace storage survives deployments on this site origin.
let workspaceDB,loaded=false,lastSaved='',saving=false;
const saveLabel=document.querySelector('.project span');
function packGeometry(g){const flat=g.index?g.toNonIndexed():g;return flat.attributes.position.array.slice();}
function workspaceKey(){return JSON.stringify({iterations:resolutionTools?.saveKey(),workflow:workflowTools?.save(),layers:layerTools?.save(),cad:cadTools?.saveState(),previousSelectionIds,lastEditedIds,folders,currentFolder,collections:[...collections],activeCollection,assets:assets.map(a=>[a.geometry.uuid,a.folderId||null,a.collection||null]),items:pieces.map(m=>[m.uuid,m.geometry.uuid,...m.position.toArray(),...m.rotation.toArray(),...m.scale.toArray(),m.material.color.getHex(),Object.fromEntries(Object.entries(m.userData).filter(([key])=>key!=='resolutionOriginal'&&key!=='lattice'))]),selected:pieces.indexOf(selected),selectedIndices:[...selection].map(m=>pieces.indexOf(m)),camera:camera.position.toArray(),target:orbit.target.toArray(),wire,detail:$('#detail').value});}
async function saveWorkspace(){if(!loaded||busy||splitTools?.active||saving||!workspaceDB)return;const key=workspaceKey();if(key===lastSaved)return;saving=true;try{const data={version:1,iterations:resolutionTools?.saveState(),workflow:workflowTools?.save(),layers:layerTools?.save(),cad:cadTools?.saveState(),previousSelectionIds:[...previousSelectionIds],lastEditedIds:[...lastEditedIds],folders:folders.map(f=>({...f})),currentFolder,collections:[...collections],activeCollection,assets:assets.map(a=>({name:a.name,positions:packGeometry(a.geometry),offset:a.offset?.toArray(),folderId:a.folderId||null,manualCategory:!!a.manualCategory,mass:!!a.mass,assetId:a.assetId,collection:a.collection,filenameFolders:true})),items:pieces.map(m=>({name:m.name,id:m.studioId,positions:packGeometry(m.geometry),quadLayout:m.geometry.userData.quadLayout||false,position:m.position.toArray(),rotation:m.rotation.toArray(),scale:m.scale.toArray(),color:m.material.color.getHex(),data:m.userData})),selected:pieces.indexOf(selected),selectedIndices:[...selection].map(m=>pieces.indexOf(m)),camera:camera.position.toArray(),target:orbit.target.toArray(),wire,detail:$('#detail').value};await new Promise((resolve,reject)=>{const tx=workspaceDB.transaction('workspace','readwrite');tx.objectStore('workspace').put(data,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});lastSaved=key;saveLabel.textContent='● SAVED ON THIS DEVICE';}catch(e){saveLabel.textContent='● SAVE FAILED';if(!saveWorkspace.warned){say('Workspace could not be saved. Browser storage may be full or unavailable. Export your work before closing.');saveWorkspace.warned=true;}}finally{saving=false;}}
(async()=>{busy=true;try{workspaceDB=await new Promise((resolve,reject)=>{const request=indexedDB.open('form-studio-workspace',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const data=await new Promise((resolve,reject)=>{const req=workspaceDB.transaction('workspace').objectStore('workspace').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(data){if(data.version!==1)throw Error('Unsupported saved workspace version');const geometry=positions=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingBox();return g;};folders.splice(0,folders.length,...(data.folders||[]));collections=[...automaticFolders,...(data.collections||[]).filter(name=>!automaticFolders.includes(name.toUpperCase()))];activeCollection=data.activeCollection||"";if(automaticFolders.includes(activeCollection.toUpperCase()))activeCollection=activeCollection.toUpperCase();currentFolder=data.currentFolder??'*';if(currentFolder!=='*'&&currentFolder!==''&&!folders.some(f=>f.id===currentFolder))currentFolder='*';previousSelectionIds=data.previousSelectionIds||[];lastEditedIds=data.lastEditedIds||[];workflowTools?.restore(data.workflow);layerTools?.restore(data.layers);wire=!!data.wire;for(const a of data.assets){const asset=a.mass?{geometry:geometry(a.positions),name:a.name,mass:true,assetId:a.assetId||crypto.randomUUID(),folderId:'mass'}:addAsset(geometry(a.positions),a.name,a.folderId||null);if(a.mass)assets.push(asset);asset.manualCategory=!!a.manualCategory;if(!a.mass){asset.collection=a.filenameFolders?(a.collection||""):folderFromFilename(a.name);}if(a.offset)asset.offset=new T.Vector3().fromArray(a.offset);}for(const item of data.items){const g=geometry(item.positions);if(item.quadLayout)g.userData.quadLayout=item.quadLayout;const m=addPiece({geometry:g,name:item.name,curve:item.data?.outlineCurve});g.dispose();m.studioId=item.id||m.studioId;m.position.fromArray(item.position);m.rotation.fromArray(item.rotation);m.scale.fromArray(item.scale);m.material.color.setHex(item.color);m.userData=item.data||{};}setSelection((data.selectedIndices||[data.selected]).map(i=>pieces[i]).filter(Boolean));camera.position.fromArray(data.camera);orbit.target.fromArray(data.target);$('#detail').value=data.detail;$('#detail').oninput({target:$('#detail')});$('#wire').classList.toggle('active',wire);renderAssets();cadTools?.restoreState(data.cad);layerTools?.update();cadTools?.wire(wire);resolutionTools?.restoreState(data.iterations);say('Your saved workspace has been restored.');}lastSaved=data?.assets?.some(a=>!a.mass&&!a.filenameFolders)?"":workspaceKey();loaded=true;saveLabel.textContent='● SAVED ON THIS DEVICE';}catch(e){saveLabel.textContent='● STORAGE UNAVAILABLE';say('Could not load browser workspace storage. '+e.message);}finally{busy=false;historyButtons();}})();
setInterval(()=>{if(performance.now()-lastCameraMotion>250||orbit.autoRotate)saveWorkspace();},350);
window.addEventListener('pagehide',saveWorkspace);
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveWorkspace();});

transform.addEventListener('objectChange',syncGroup);
// Empty-space drag creates a selection window; dragging over an object orbits.
const marquee=document.createElement('div');marquee.className='selection-window';view.append(marquee);let pointerSelection=null;
function hitAt(e){const r=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();const projection=displayCamera();ray.params.Line.threshold=projection.isOrthographicCamera?(projection.top-projection.bottom)/r.height*6:camera.position.distanceTo(orbit.target)/r.height*5;ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),projection);return ray.intersectObjects(pieces.filter(mesh=>canEdit(mesh)&&resolutionTools?.allowsMesh(mesh)!==false),false)[0]?.object||resolutionTools?.pick(e.clientX,e.clientY)||null;}

function cloneAtCurrentTransform(m,suffix=' copy'){const c=addPiece({geometry:m.geometry,name:m.name+suffix,curve:m.isLine});c.position.copy(m.position);c.quaternion.copy(m.quaternion);c.scale.copy(m.scale);c.material.color.copy(m.material.color);c.userData=structuredClone(m.userData);delete c.userData.groupId;c.updateMatrixWorld(true);return c;}
let altHeld=false,altGizmo=null,directAlt=null;
document.addEventListener('keydown',e=>{if(e.key==='Alt')altHeld=true;},true);document.addEventListener('keyup',e=>{if(e.key==='Alt')altHeld=false;},true);window.addEventListener('blur',()=>altHeld=false);
transform.addEventListener('mouseDown',()=>{altGizmo=!programView()&&altHeld&&transform.mode==='translate'?[...selection].map(m=>({m,position:m.position.clone(),quaternion:m.quaternion.clone(),scale:m.scale.clone()})):null;});
transform.addEventListener('objectChange',()=>{if(!altGizmo||!transform.dragging)return;const originals=altGizmo;if(!originals.some(s=>s.m.position.distanceToSquared(s.position)>1e-16))return;altGizmo=null;const copies=originals.map(s=>cloneAtCurrentTransform(s.m));for(const s of originals){s.m.position.copy(s.position);s.m.quaternion.copy(s.quaternion);s.m.scale.copy(s.scale);s.m.updateMatrixWorld(true);}setSelection(copies);say('Alt-drag: moving copies. Originals stay in place.');});
transform.addEventListener('mouseUp',()=>altGizmo=null);
function directDragPoint(e,plane){const r=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);return ray.ray.intersectPlane(plane,new T.Vector3());}
renderer.domElement.addEventListener('pointerdown',e=>{altHeld=e.altKey;if(programView()||busy||massTools?.picking||splitTools?.active||cadTools?.interceptsPointer||e.button!==0||!e.altKey||transform.axis)return;const hit=hitAt(e);if(!hit)return;e.preventDefault();e.stopImmediatePropagation();if(!selection.has(hit))select(hit);const originals=[...selection],plane=new T.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new T.Vector3()),new T.Box3().setFromObject(hit).getCenter(new T.Vector3()));directAlt={id:e.pointerId,x:e.clientX,y:e.clientY,originals,plane,start:directDragPoint(e,plane),copies:null,positions:originals.map(m=>m.position.clone())};orbit.enabled=false;transform.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);},true);
renderer.domElement.addEventListener('pointermove',e=>{const d=directAlt;if(!d||e.pointerId!==d.id)return;e.preventDefault();e.stopImmediatePropagation();if(!d.copies&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<4)return;const point=directDragPoint(e,d.plane);if(!point||!d.start)return;if(!d.copies){checkpoint();d.copies=d.originals.map(m=>cloneAtCurrentTransform(m));setSelection(d.copies);}const delta=point.sub(d.start);d.copies.forEach((m,i)=>{m.position.copy(d.positions[i]).add(delta);m.updateMatrixWorld(true);});setSelection(d.copies);},true);
function endDirectAlt(e){const d=directAlt;if(!d||e.pointerId!==d.id)return;e.preventDefault();e.stopImmediatePropagation();directAlt=null;if(e.type==='pointercancel'&&d.copies){for(const m of d.copies){scene.remove(m);pieces.splice(pieces.indexOf(m),1);m.geometry.dispose();m.material.dispose();}setSelection(d.originals);}orbit.enabled=true;transform.enabled=true;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);if(d.copies&&e.type!=='pointercancel'){markEdited(d.copies);}if(d.copies&&e.type!=='pointercancel')say('Copied '+d.copies.length+' object(s) with Alt-drag.');}
renderer.domElement.addEventListener('pointerup',endDirectAlt,true);renderer.domElement.addEventListener('pointercancel',endDirectAlt,true);

renderer.domElement.addEventListener('pointerdown',e=>{if(busy||massTools?.picking||splitTools?.active||cadTools?.interceptsPointer||e.button!==0)return;const hit=hitAt(e);if(transform.axis&&!e.ctrlKey&&!e.metaKey&&(!e.shiftKey||transform.mode==='scale'))return;pointerSelection={x:e.clientX,y:e.clientY,hit,box:e.shiftKey||e.ctrlKey||e.metaKey,base:[...selection]};if(pointerSelection.box){e.stopImmediatePropagation();renderer.domElement.setPointerCapture(e.pointerId);orbit.enabled=false;}},true);
renderer.domElement.addEventListener('pointermove',e=>{const p=pointerSelection;if(!p?.box)return;e.stopImmediatePropagation();if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<4)return;const r=view.getBoundingClientRect();Object.assign(marquee.style,{display:'block',left:Math.min(p.x,e.clientX)-r.left+'px',top:Math.min(p.y,e.clientY)-r.top+'px',width:Math.abs(e.clientX-p.x)+'px',height:Math.abs(e.clientY-p.y)+'px'});},true);
function endSelection(e){const p=pointerSelection;if(!p)return;pointerSelection=null;marquee.style.display='none';if(p.box){e.stopImmediatePropagation();orbit.enabled=true;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);}if(e.type==='pointercancel')return;if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<4){pickSelection(p.hit,e);return;}if(!p.box)return;const r=renderer.domElement.getBoundingClientRect(),left=Math.min(p.x,e.clientX),right=Math.max(p.x,e.clientX),top=Math.min(p.y,e.clientY),bottom=Math.max(p.y,e.clientY);const projection=displayCamera();projection.updateMatrixWorld();const hits=pieces.filter(m=>canEdit(m)&&(()=>{const b=new T.Box3().setFromObject(m),points=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const v=new T.Vector3(x,y,z).project(projection);if(v.z>=-1&&v.z<=1)points.push({x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2});}return points.length&&Math.min(...points.map(v=>v.x))<=right&&Math.max(...points.map(v=>v.x))>=left&&Math.min(...points.map(v=>v.y))<=bottom&&Math.max(...points.map(v=>v.y))>=top;})());rememberSelection();setSelection(e.ctrlKey||e.metaKey?p.base.filter(m=>!hits.some(hit=>selectionGroup(hit).includes(m))):e.shiftKey?[...p.base,...hits]:hits);}
renderer.domElement.addEventListener('pointerup',endSelection,true);renderer.domElement.addEventListener('pointercancel',endSelection,true);
$('.nav-hint').textContent='Shift-click: add · Ctrl/Cmd-click: remove · Drag empty space: box select · Drag object: orbit';
// Object clipboard keeps independent geometry so deletion of the source is safe.
let objectClipboard=[],pasteCount=0;
function copyObjects(){if(busy||splitTools?.active||!selection.size)return;objectClipboard.forEach(item=>item.geometry.dispose());objectClipboard=[...selection].map(m=>({geometry:m.geometry.clone(),name:m.name,color:m.material.color.getHex(),position:m.position.clone(),quaternion:m.quaternion.clone(),scale:m.scale.clone(),data:structuredClone(m.userData)}));pasteCount=0;say('Copied '+objectClipboard.length+' object(s). Press Ctrl/Cmd+V to paste.');}
function pasteObjects(){if(busy||splitTools?.active)return;if(!objectClipboard.length)return say('Select objects and press Ctrl/Cmd+C first.');checkpoint();pasteCount++;const offset=new T.Vector3(10*pasteCount,0,programView()?0:10*pasteCount),copies=[],groups=new Map();for(const item of objectClipboard){const m=addPiece({geometry:item.geometry,name:item.name+' copy',curve:item.data?.outlineCurve});m.position.copy(item.position).add(offset);m.quaternion.copy(item.quaternion);m.scale.copy(item.scale);m.material.color.setHex(item.color);m.userData=structuredClone(item.data);if(item.data.groupId){if(!groups.has(item.data.groupId))groups.set(item.data.groupId,crypto.randomUUID());m.userData.groupId=groups.get(item.data.groupId);}m.userData.workspaceStage=workflowTools?.active==='iterations'?'iterations':workflowTools?.active==='floor-plates'?'floor-plates':item.data.workspaceStage==='program-outline'||item.data.workspaceStage==='floor-plates'?'program-outline':workflowTools?.active==='project'?'project':'figures';copies.push(m);}setSelection(copies);markEdited(copies);say('Pasted '+copies.length+' object(s).');}
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||!(e.ctrlKey||e.metaKey)||e.altKey)return;const key=e.key.toLowerCase();if(key==='c'||key==='v'){e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;key==='c'?copyObjects():pasteObjects();}},true);
const clipboardButtons=document.createElement('div');clipboardButtons.className='button-pair';clipboardButtons.style.marginTop='8px';clipboardButtons.innerHTML='<button id="copyObjects" title="Copy selected objects · Ctrl/Cmd+C">Copy</button><button id="pasteObjects" title="Paste objects · Ctrl/Cmd+V">Paste</button>';$('#duplicate').parentElement.after(clipboardButtons);$('#copyObjects').onclick=copyObjects;$('#pasteObjects').onclick=pasteObjects;
const existingGuide=$('#shortcuts').onclick;$('#shortcuts').onclick=()=>{existingGuide();say($('#toast').textContent+' · Ctrl/Cmd C: copy · Ctrl/Cmd V: paste');};

const repairPanel=document.createElement('section');repairPanel.className='repair-panel';repairPanel.innerHTML=`
<hr><span class="eyebrow">PREPARE FOR PRINT</span><h3 class="blend-title">Repair & print checks</h3>
<p class="hint">Analyze selected objects, close openings and unite overlapping solids. Automatic repair keeps the original surfaces when possible, then rebuilds difficult areas if needed.</p>
<label class="field-label" for="repairMethod">Repair approach</label><select id="repairMethod"><option value="auto">Automatic · clean, close & rebuild if needed</option><option value="preserve">Preserve surfaces · cleanup & solid union</option><option value="rebuild">Rebuild surface · difficult meshes</option></select>
<details class="repair-settings"><summary>Repair settings</summary><label class="field-label" for="repairTolerance">Weld seams closer than · mm</label><input id="repairTolerance" type="number" min="0.000001" max="10" step="0.001" value="0.01"><label class="field-label" for="repairWall">Thin-area threshold / rebuild surface band · mm</label><input id="repairWall" type="number" min="0.05" max="100" step="0.1" value="1"><label class="field-label" for="repairResolution">Rebuild detail</label><select id="repairResolution"><option value="64">Fast · 64 samples across longest side</option><option value="96" selected>Balanced · 96 samples</option><option value="128">Fine · 128 samples</option></select><label class="repair-check"><input id="repairShell" type="checkbox" checked> Thicken open surfaces when rebuilding</label><p class="hint">Rebuilding can round fine details, fill intentional openings and alter dimensions. The surface band adds material around surfaces. Undo restores the original.</p></details>
<div class="button-pair"><button id="analyzeMesh">⌕ Scan selection</button><button id="repair">◇ Make watertight</button></div><button id="cancelRepair" hidden>Cancel repair</button><p id="repairResult" class="hint" role="status">Select objects to inspect or repair. Overlapping selected pieces are repaired together.</p><label class="repair-check"><input type="checkbox" id="showRepairIssues" checked> Show issue locations from last scan</label><div id="repairReport"></div>
<p class="hint">Checks use millimeters and +Y as the print-up direction. Thin-area and overhang checks sample the surface. Review supports, bed adhesion, dimensions and printer settings in your slicer.</p>`;
$('#fuse').parentElement.insertBefore(repairPanel,$('#sceneList').previousElementSibling);
let issueOverlay=null,repairCancel=null,issueReport=null;
function clearIssueOverlay(){if(!issueOverlay)return;issueOverlay.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});scene.remove(issueOverlay);issueOverlay=null;}
function showIssues(report){clearIssueOverlay();issueReport=report;if(!$('#showRepairIssues').checked||!report)return;issueOverlay=new T.Group();const add=(values,color,points=false)=>{if(!values?.length)return;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(values,3));const m=points?new T.Points(g,new T.PointsMaterial({color,size:5,sizeAttenuation:false,depthTest:false})):new T.LineSegments(g,new T.LineBasicMaterial({color,depthTest:false}));m.renderOrder=120;issueOverlay.add(m);};add(report.markers,0xff5284);add(report.intersectionMarkers,0xdc24f4);add(report.thinMarkers,0xffb45c,true);add(report.overhangMarkers,0x21e0ed,true);scene.add(issueOverlay);}
$('#showRepairIssues').onchange=()=>showIssues(issueReport);
function displayRepairReport(report){const before=report.before||report,after=report.after,container=$('#repairReport');container.replaceChildren();const heading=document.createElement('p');heading.className='hint';heading.textContent=report.method||'Selection scan · before repair';container.append(heading);const table=document.createElement('table');table.innerHTML='<thead><tr><th>Check</th><th>'+(after?'Before':'Found')+'</th>'+(after?'<th>After</th>':'')+'</tr></thead>';const body=document.createElement('tbody');for(const [label,key] of [['Open boundary edges','boundary'],['Non-manifold edges','nonManifold'],['Intersecting face pairs','intersectionPairs'],['Face direction conflicts','inconsistent'],['Duplicate faces','duplicateFaces'],['Degenerate faces','degenerate'],['Seam vertices to weld','welded'],['Separate shells','components'],['Thin-area samples','thinSamples'],['Overhang samples >45°','overhangSamples']]){const row=document.createElement('tr');for(const value of [label,before[key]??0,...(after?[after[key]??0]:[])]){const cell=document.createElement(row.children.length?'td':'th');cell.textContent=String(value);row.append(cell);}body.append(row);}table.append(body);container.append(table);const notes=[];if(report.adjusted||report.rebuildRetries)notes.push('Detail was automatically adjusted to fit this model in browser memory. Effective surface spacing: '+report.resolution.toFixed(3)+' mm. Model scale was preserved; finer details may be reduced.');if(before.intersectionLimited)notes.push('Intersection scan reached its limit; counts are a lower bound. Automatic repair uses reconstruction when exact checks are inconclusive.');if(report.usedReconstruction)notes.push('Surface rebuilt at '+report.resolution.toFixed(3)+' mm spacing.'+(report.thickened?' A surface thickness band was added.':'')+' Dimensions and small details may change.');if(after){notes.push('Enclosed volume: '+after.volume.toFixed(2)+' mm³.');notes.push('Dimensions: '+before.dimensions.map(n=>n.toFixed(2)).join(' × ')+' → '+after.dimensions.map(n=>n.toFixed(2)).join(' × ')+' mm.');}const checks=after||before;if(checks.minThickness!==null)notes.push('Smallest sampled thickness: '+checks.minThickness.toFixed(3)+' mm (threshold '+checks.minWall+' mm).');if(checks.components>1)notes.push('Separate shells remain. Check that each has support or joins the intended assembly.');if(checks.thinSamples)notes.push('Orange markers: sampled areas below your thickness threshold. Rebuild with a larger thickness to add material; scan again afterward.');if(checks.overhangSamples)notes.push('Cyan markers: steep downward-facing samples that may require supports.');notes.push('Pink lines: open or non-manifold edges. Purple lines: intersections. Markers show the last scan and do not track later edits.');for(const text of notes){const note=document.createElement('p');note.className='hint';note.textContent=text;container.append(note);}showIssues(checks);repairReportSignature=repairSceneSignature();}
async function advancedRepair(action){if(busy||splitTools?.active)return;const targets=[...selection].filter(canEdit);if(!targets.length)return say('Select one or more objects to scan or repair.');const options={method:$('#repairMethod').value,tolerance:+$('#repairTolerance').value,minWall:+$('#repairWall').value,resolution:+$('#repairResolution').value,shell:$('#repairShell').checked};if(!Number.isFinite(options.tolerance)||options.tolerance<.000001||options.tolerance>10||!Number.isFinite(options.minWall)||options.minWall<.05||options.minWall>100)return say('Set seam tolerance between 0.000001 and 10 mm, and wall threshold between 0.05 and 100 mm.');busy=true;transform.enabled=false;$('#repair').disabled=true;$('#analyzeMesh').disabled=true;$('#cancelRepair').hidden=false;historyButtons();clearIssueOverlay();let worker;try{const meshes=targets.map(m=>{m.updateMatrixWorld(true);const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld),positions=g.attributes.position.array.slice();g.dispose();return {name:m.name,positions};});worker=new Worker('./repair-worker.js',{type:'module'});const message=await new Promise((resolve,reject)=>{repairCancel=()=>reject(Error('Repair canceled. Original objects are unchanged.'));worker.onmessage=e=>{const m=e.data;if(m.type==='progress'){$('#repairResult').textContent=m.text;return;}m.error?reject(Error(m.error)):resolve(m);};worker.onerror=()=>reject(Error('Repair worker could not complete. Try a lower rebuild detail.'));worker.postMessage({meshes,options,action},meshes.map(m=>m.positions.buffer));});if(action==='analyze'){displayRepairReport(message.report);$('#repairResult').textContent='Scan complete. Issue locations are shown in the viewport.';return;}
const parts=splitParts(message.positions),created=parts.map((part,i)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(part,3));g.computeVertexNormals();g.computeBoundingBox();const offset=g.boundingBox.getCenter(new T.Vector3());g.translate(-offset.x,-offset.y,-offset.z);g.computeBoundingBox();return {geometry:g,offset,layerId:targets[0].userData.layerId,folderId:targets.length===1?targets[0].userData.featureCategory:null,name:targets.length===1?targets[0].name+' repaired'+(parts.length>1?' · '+(i+1):''):'Repaired assembly'+(parts.length>1?' · '+(i+1):'')};});busy=false;checkpoint();busy=true;select(null);for(const m of targets){scene.remove(m);pieces.splice(pieces.indexOf(m),1);m.geometry.dispose();m.material.dispose();}const outputs=created.map(a=>{const m=addPiece(a);m.material.color.copy(targets[0].material.color);m.userData.repaired=true;a.geometry.dispose();return m;});setSelection(outputs);displayRepairReport(message.report);$('#repairResult').textContent='Closed solid validated · '+message.report.method+'. Undo restores your originals.';say('Advanced repair complete. Review the print checks below.');
}catch(e){$('#repairResult').textContent=e.message;say(e.message);}finally{worker?.terminate();repairCancel=null;busy=false;transform.enabled=true;$('#repair').disabled=false;$('#analyzeMesh').disabled=false;$('#cancelRepair').hidden=true;historyButtons();}}
$('#repair').onclick=()=>advancedRepair('repair');$('#analyzeMesh').onclick=()=>advancedRepair('analyze');$('#cancelRepair').onclick=()=>repairCancel?.();
const repairSceneSignature=()=>JSON.stringify(pieces.map(m=>[m.uuid,m.geometry.uuid,...m.position.toArray(),...m.quaternion.toArray(),...m.scale.toArray()]));let repairReportSignature=null;
setInterval(()=>{if(!busy&&repairReportSignature&&repairReportSignature!==repairSceneSignature()){clearIssueOverlay();issueReport=null;repairReportSignature=null;$('#repairResult').textContent='Scene changed since the last check. Scan the selection again for current issue locations.';}},700);
let rhinoEngine;
const rhinoButton=document.createElement('button');rhinoButton.id='exportRhino';rhinoButton.textContent='↗ Export to Rhino';rhinoButton.title='Download a Rhino .3dm file · objects, layers and visibility';$('#export').before(rhinoButton);
rhinoButton.onclick=async()=>{if(splitTools?.active)return say('Finish or cancel Split before exporting.');if(busy)return say('Wait for the current operation to finish.');if(!pieces.length)return say('Add objects before exporting to Rhino.');rhinoButton.disabled=true;let doc;try{say('Preparing Rhino file…');const factory=(await import('./rhino3dm.js')).default;rhinoEngine ||= await factory({locateFile:()=>new URL('./rhino3dm.wasm',import.meta.url).href});const r=rhinoEngine;doc=new r.File3dm();doc.settings().modelUnitSystem=r.UnitSystem.Millimeters;const rhinoLayers=layerTools?.exportRhino(r,doc);for(const m of pieces.filter(m=>inStage(m)&&m.isMesh)){m.updateMatrixWorld(true);const mesh=new r.Mesh(),attrs=new r.ObjectAttributes();try{attrs.name=m.name;if(rhinoLayers)attrs.layerIndex=rhinoLayers.get(m.userData.layerId)||0;if(m.userData.objectLocked)attrs.mode=r.ObjectMode.Locked;if(m.userData.objectHidden)attrs.visible=false;const hex=m.material.color.getHex();attrs.objectColor={r:hex>>16&255,g:hex>>8&255,b:hex&255,a:255};attrs.colorSource=r.ObjectColorSource.ColorFromObject;const q=quadMesh(m.geometry,m.matrixWorld);q.vertices.forEach(v=>mesh.vertices().add(v[0],-v[2],v[1]));q.faces.forEach(f=>mesh.faces().addQuadFace(...f));mesh.normals().computeNormals();doc.objects().add(mesh,attrs);}finally{mesh.delete();attrs.delete();}}const bytes=doc.toByteArray();if(!bytes.length)throw Error('Rhino file generation returned no data.');const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download='popmarkit-composition.3dm';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);say('Rhino .3dm exported · millimeters · separate named meshes · Z-up.');}catch(e){say('Rhino export failed: '+e.message);}finally{doc?.delete();rhinoButton.disabled=false;}};

const clearCollection=document.createElement('button');clearCollection.id='clearCollection';clearCollection.className='text';clearCollection.textContent='Clear collection';clearCollection.title='Remove all library items; placed objects stay in the scene';$('#cards').previousElementSibling.lastElementChild.replaceWith(clearCollection);clearCollection.onclick=()=>{if(busy||!assets.length)return;checkpoint();assets.filter(a=>!a.mass).forEach(a=>{assets.splice(assets.indexOf(a),1);a.geometry.dispose();});renderAssets();say('Collection cleared. Placed objects stay; Undo restores the collection.');};updateLibraryCount();


function limbCategory(name){
 const words=name.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z]+/);
 const arm=words.some(word=>['arm','arms','forearm','forearms','hand','hands','wrist','wrists','elbow','elbows'].includes(word));
 const leg=words.some(word=>['leg','legs','foot','feet','thigh','thighs','shin','shins','calf','calves','ankle','ankles','knee','knees'].includes(word));
 return arm===leg?null:arm?'arms':'legs';
}
function featureCategory(id,name=''){if(featureCategories.some(f=>f.id===id))return id;const limb=limbCategory(name);if(limb)return limb;if(/(?:^|[^a-z])ears?(?:[^a-z]|$)/i.test(name))return 'ears';const old=folders.find(f=>f.id===id)?.name||'',words=(old+' '+name).toLowerCase().split(/[^a-z]+/);if(words.some(w=>['body','bodies','torso','torsos','chest','chests'].includes(w)))return 'body';if(words.some(w=>['head','heads','face','faces','skull','cranium'].includes(w)))return 'heads';if(words.some(w=>['hat','hats','bow','bows','jewelry','jewellery','jewelery','necklace','earring','earrings','crown','helmet','cap','glasses','ring','bracelet','accessories','accessory','bag'].includes(w)))return 'accessories';if(words.some(w=>['appendage','appendages','arm','arms','leg','legs','hand','hands','foot','feet','tail','tails','wing','wings','horn','horns','ear','ears'].includes(w)))return 'whole';return 'whole';}
function normalizeCategories(){for(const asset of assets){if(!asset.mass&&!asset.manualCategory&&featureCategory(null,asset.name)==="ears")asset.folderId="ears";}for(let i=0;i<assets.length;i++){const asset=assets[i];if(asset.mass||asset.manualCategory||![null,undefined,"whole","body","appendages"].includes(asset.folderId))continue;const folderId=limbCategory(asset.name);if(folderId)assets[i]={...asset,folderId};}for(let i=0;i<assets.length;i++){const a=assets[i];if(!a.manualCategory&&a.folderId==='whole'&&featureCategory(null,a.name)==='body')assets[i]={...a,folderId:'body'};}const bodyRefs=assets.filter(a=>!a.mass&&featureCategory(a.folderId,a.name)==='body').map(a=>({category:'body',shape:describeShape(a.geometry)}));if(bodyRefs.length)for(let i=0;i<assets.length;i++){const a=assets[i];if(a.folderId==='whole'&&!a.manualCategory){const match=matchReferences(describeShape(a.geometry),bodyRefs);if(match&&match.distance<.055)assets[i]={...a,folderId:'body'};}}for(let i=0;i<assets.length;i++){if(assets[i].mass)continue;const id=featureCategory(assets[i].folderId,assets[i].name);if(id!==assets[i].folderId)assets[i]={...assets[i],folderId:id};}folders.splice(0,folders.length,...featureCategories.map(f=>({...f})));if(currentFolder!=='*'&&!featureCategories.some(f=>f.id===currentFolder))currentFolder='*';}
function syncFolderControls(){const select=$('#libraryFolder');if(!select)return;select.replaceChildren();for(const f of [{id:'*',name:'All figures'},...featureCategories]){const count=f.id==='*'?assets.filter(a=>!a.mass).length:assets.filter(a=>!a.mass&&a.folderId===f.id).length,o=document.createElement('option');o.value=f.id;o.textContent=f.name+' ('+count+')';select.append(o);}select.value=currentFolder;for(const b of document.querySelectorAll('[data-feature]')){const f=featureCategories.find(f=>f.id===b.dataset.feature);b.textContent=f.name+' · '+assets.filter(a=>!a.mass&&a.folderId===f.id).length;b.classList.toggle('active',currentFolder===f.id);}}
const folderPanel=document.createElement('div');folderPanel.className='library-folders';folderPanel.innerHTML='<div class="row"><label class="eyebrow" for="libraryFolder">FEATURES</label></div><select id="libraryFolder" aria-label="Feature category"></select><div class="feature-grid"></div>';$('#cards').before(folderPanel);for(const f of featureCategories){const button=document.createElement('button');button.dataset.feature=f.id;button.onclick=()=>{currentFolder=f.id;renderAssets();};$('.feature-grid').append(button);}$('#libraryFolder').onchange=ev=>{currentFolder=ev.target.value;renderAssets();};normalizeCategories();syncFolderControls();
const automaticFolders=['SKULLPANDA','LABUBU','CRYBABY','HIRONO','MOLLY','OTHER'];
let collections=[...automaticFolders],activeCollection='';
function folderFromFilename(name){
 const filename=name.toUpperCase();
 return automaticFolders.slice(0,-1).find(folder=>filename.includes(folder))||'OTHER';
}
function collectionOptions(select,value,emptyLabel){
 select.replaceChildren(new Option(emptyLabel,''));
 for(const name of collections)select.add(new Option(name,name));
 select.value=collections.includes(value)?value:'';
}
const collectionControls=document.createElement('form');
collectionControls.className='library-folders';
collectionControls.innerHTML='<label class="eyebrow" for="collectionFilter">FOLDERS</label><select id="collectionFilter"></select><div class="button-pair"><input aria-label="New folder name" placeholder="New folder name" maxlength="60" required><button type="submit">Add folder</button></div>';
$('#cards').before(collectionControls);
$('#collectionFilter').onchange=event=>{activeCollection=event.target.value;renderAssets();};
collectionControls.onsubmit=event=>{
 event.preventDefault();
 if(busy)return;
 const input=collectionControls.querySelector('input'), name=input.value.trim();
 if(!name)return;
 const existing=collections.find(folder=>folder.toLowerCase()===name.toLowerCase());
 if(!existing){checkpoint();collections.push(name);}
 activeCollection=existing||name;
 input.value='';
 renderAssets();
};
function addCollectionPicker(card,asset){
 const picker=document.createElement('select');
 picker.className='asset-folder';
 picker.setAttribute('aria-label','Folder for '+asset.name);
 collectionOptions(picker,asset.collection,'No folder');
 picker.onchange=()=>{
  if(busy)return;
  const index=assets.indexOf(asset);
  if(index<0)return;
  checkpoint();
  assets[index]={...asset,collection:picker.value};
  renderAssets();
 };
 card.append(picker);
}

const mirrorPanel=document.createElement('div');mirrorPanel.className='mirror-panel';mirrorPanel.innerHTML='<div class="row"><h3>Mirror selection</h3><span class="eyebrow">MI</span></div><div class="button-pair"><select id="mirrorAxis" aria-label="Mirror axis"><option value="x">X · YZ plane</option><option value="y">Y · XZ plane</option><option value="z">Z · XY plane</option></select><select id="mirrorCenter" aria-label="Mirror plane location"><option value="selection">Selection center</option><option value="origin">World origin</option></select></div><label class="repair-check"><input id="mirrorCopy" type="checkbox"> Keep originals (mirror copies)</label><button id="mirror" class="blend">⇋ Mirror</button>';
$('#copyObjects').parentElement.after(mirrorPanel);
function mirrorSelection(){if(busy||splitTools?.active||transform.dragging||directAlt)return;if(!selection.size)return say('Select objects to mirror.');const targets=[...selection].filter(canEdit),axis=programView()&&$('#mirrorAxis').value==='z'?'x':$('#mirrorAxis').value,bounds=new T.Box3();targets.forEach(m=>bounds.expandByObject(m));const center=$('#mirrorCenter').value==='selection'?bounds.getCenter(new T.Vector3())[axis]:0,scale=new T.Vector3(1,1,1);scale[axis]=-1;const reflection=new T.Matrix4().makeScale(scale.x,scale.y,scale.z);reflection.setPosition(new T.Vector3().setComponent({x:0,y:1,z:2}[axis],2*center));const plans=targets.map(m=>{m.updateMatrixWorld(true);const position=m.position.clone().applyMatrix4(reflection),next=new T.Matrix4().compose(position,m.quaternion,m.scale),local=new T.Matrix4().copy(next).invert().multiply(reflection).multiply(m.matrixWorld);const geometry=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(local);if(m.isMesh)for(const attribute of Object.values(geometry.attributes)){for(let i=0;i<attribute.count;i+=3)for(let j=0;j<attribute.itemSize;j++){const a=(i+1)*attribute.itemSize+j,b=(i+2)*attribute.itemSize+j,temp=attribute.array[a];attribute.array[a]=attribute.array[b];attribute.array[b]=temp;}attribute.needsUpdate=true;}if(geometry.userData.quadLayout)geometry.userData.quadLayout=geometry.userData.quadLayout==='reversed'?true:'reversed';geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();const corners=m.userData.outlineCorners?.map(loop=>loop.map(([x,y,amount])=>{const p=new T.Vector3(x,y,0).applyMatrix4(local);return [p.x,p.y,amount];}));return {m,position,geometry,corners};});checkpoint();const outputs=plans.map(({m,position,geometry,corners})=>{const output=$('#mirrorCopy').checked?cloneAtCurrentTransform(m,' mirrored'):m;output.geometry.dispose();output.geometry=geometry;if(corners)output.userData.outlineCorners=corners;output.position.copy(position);output.updateMatrixWorld(true);return output;});setSelection(outputs);markEdited(outputs);say('Mirrored '+outputs.length+' object(s) across '+axis.toUpperCase()+' · '+($('#mirrorCenter').value==='selection'?'selection center':'world origin')+'.');}
$('#mirror').onclick=mirrorSelection;
const mirrorGuide=$('#shortcuts').onclick;$('#shortcuts').onclick=()=>{mirrorGuide();say($('#toast').textContent+' · MI: mirror · Alt-drag: move a copy');};

function rememberSelection(){if(busy||restoring)return;const ids=[...selection].filter(m=>pieces.includes(m)).map(m=>m.studioId);if(ids.length)previousSelectionIds=ids;}
function markEdited(meshes=[...selection]){if(restoring)return;const ids=meshes.filter(m=>pieces.includes(m)&&canEdit(m)).map(m=>m.studioId);if(ids.length)lastEditedIds=ids;}
function recallSelection(ids,label){if(busy||splitTools?.active||transform.dragging||directAlt)return;const targets=pieces.filter(m=>ids.includes(m.studioId)&&canEdit(m));if(!targets.length)return say('No '+label+' objects remain in the workspace.');rememberSelection();setSelection(targets);say('Reselected '+targets.length+' '+label+' object(s).');}
const workspacePanel=document.createElement('section');workspacePanel.className='workspace-commands';workspacePanel.innerHTML='<div class="row"><h3>Workspace</h3></div><div class="button-pair"><button id="addAllImports" title="Add every imported library item once, in a new grid">＋ Add all imports</button><button id="clearWorkspace" title="Clear placed objects; library imports stay. Undo restores the scene.">Clear workspace</button></div><div class="button-pair"><button id="previousSelection" title="Reselect the group selected before the current selection">Previous selection</button><button id="lastEdited" title="Reselect the most recently edited or created objects">Last edited</button></div><p class="hint">Add all uses the full library, including every feature category. Clear keeps your library and can be undone.</p>';
$('.inspector .section').insertBefore(workspacePanel,$('.selected'));
$('#previousSelection').onclick=()=>recallSelection([...previousSelectionIds],'previously selected');$('#lastEdited').onclick=()=>recallSelection([...lastEditedIds],'last edited');
$('#addAllImports').onclick=()=>{if(splitTools?.active||busy||transform.dragging||directAlt)return;if(!assets.length)return say('Import OBJ files into the library first.');checkpoint();rememberSelection();const created=assets.filter(a=>!a.mass).map(a=>addPiece(a)),cols=Math.ceil(Math.sqrt(created.length)),boxes=created.map(m=>new T.Box3().setFromObject(m)),width=Math.max(...boxes.map(b=>b.max.x-b.min.x)),depth=Math.max(...boxes.map(b=>b.max.z-b.min.z)),gap=Math.max(width,depth)*.2+1,existing=pieces.filter(m=>!created.includes(m)),bounds=new T.Box3();existing.forEach(m=>bounds.expandByObject(m));const start=existing.length?bounds.max.x+gap:0;created.forEach((m,i)=>{const b=boxes[i],c=b.getCenter(new T.Vector3());m.position.x+=start+(i%cols)*(width+gap)+(width/2)-c.x;m.position.z+=Math.floor(i/cols)*(depth+gap)-c.z;m.position.y-=b.min.y;});setSelection(created);markEdited(created);fit();say('Added '+created.length+' library item(s) in a grid.');};
$('#clearWorkspace').onclick=()=>{if(busy||splitTools?.active||transform.dragging||directAlt||!pieces.length)return;checkpoint();rememberSelection();const targets=pieces.filter(canEdit);select(null);targets.forEach(m=>{pieces.splice(pieces.indexOf(m),1);scene.remove(m);m.geometry.dispose();m.material.dispose();});clearIssueOverlay();refreshStats();say('Editable workspace cleared. Locked/hidden objects and library kept. Undo restores the scene.');};
transform.addEventListener('objectChange',()=>markEdited());$('#transforms').addEventListener('change',()=>{if(!busy)markEdited();});
for(const id of ['duplicate','reset','mirror','pasteObjects','repair','fuse','arrange']){const element=$('#'+id),handler=element?.onclick;if(handler)element.onclick=async e=>{if(busy||splitTools?.active)return;const before=[...selection].map(m=>m.studioId);await handler(e);if(before.length&&before.join()!==[...selection].map(m=>m.studioId).join())previousSelectionIds=before;markEdited(id==='arrange'?pieces:[...selection]);};}

cadTools=installCad({T,$,scene,camera,renderer,view,orbit,transform,pieces:()=>pieces,selection:()=>[...selection],select:setSelection,checkpoint,mark:markEdited,add:addPiece,clone:cloneAtCurrentTransform,say,canEdit,isVisible,blocked:()=>!!splitTools?.active||!!massTools?.picking,split:level=>splitTools?.start(level),flow:()=>massTools?.start(),programView,setModelMode,unitsPerFoot,commandBlocked:()=>!!splitTools?.active||!!massTools?.picking,isBusy:()=>busy,busy:value=>{busy=value;historyButtons();}});
$('#wire').onclick=()=>{wire=!wire;cadTools.wire(wire);$('#wire').classList.toggle('active',wire);};$('#wire').title='Show quadrangular mesh edges';

layoutTools=installReferenceLayout({$,program:programView,scene,camera,renderer,orbit,transform,grid,floor:floorView,fit,say,selection:()=>[...selection],pieces:()=>pieces.filter(isVisible),cad:()=>cadTools,boundsPieces:()=>pieces.filter(m=>inStage(m)&&(!layerTools||layerTools.isVisible(m))),blocked:()=>!!splitTools?.active,splitControl:()=>splitTools?.control,select:meshes=>{rememberSelection();setSelection(meshes);}});

function inStage(m){return !workflowTools||workflowTools.inStage(m);}
function canEdit(m){return !!m&&resolutionTools?.inWorkspace(m)!==false&&inStage(m)&&(!layerTools||layerTools.canEdit(m));}
function isVisible(m){return !!m&&resolutionTools?.inWorkspace(m)!==false&&(!(programView()||floorView())||pieces.includes(m))&&inStage(m)&&(!layerTools||layerTools.isVisible(m))&&!splitTools?.isSuppressed(m);}
layerTools=installLayers({$,pieces:()=>pieces.filter(inStage),selection:()=>[...selection],select:setSelection,checkpoint,say,isBusy:()=>busy,layout:()=>layoutTools,cad:()=>cadTools,suppressed:m=>!!splitTools?.isSuppressed(m)});

splitTools=installSplit({$,scene,camera,renderer,orbit,transform,pieces:()=>pieces,assets:()=>assets.filter(a=>!a.mass),selection:()=>[...selection],select:setSelection,canEdit,isLayerVisible:m=>layerTools.isVisible(m),cad:()=>cadTools,checkpoint,mark:markEdited,add:addPiece,say,isBusy:()=>busy,busy:value=>{busy=value;historyButtons();},wire:()=>wire,createLayers:(name,parent,categories)=>layerTools.createSplitLayers(name,parent,categories)});
function installCompositions(panel){
 panel.innerHTML='<label class="field-label">Composition name <input type="text" maxlength="80"></label><button type="button">Save Composition</button><label class="field-label">Saved compositions <select></select></label><button type="button">Insert Composition</button>';
 const input=panel.querySelector('input'),picker=panel.querySelector('select');
 const [save,insert]=panel.querySelectorAll('button');
 function access(mode,operation){
  return new Promise((resolve,reject)=>{
   if(!workspaceDB){reject(Error('Browser storage is unavailable.'));return;}
   const tx=workspaceDB.transaction('workspace',mode);
   const request=operation(tx.objectStore('workspace'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onabort=()=>reject(tx.error);
  });
 }
 function addOption(item){picker.add(new Option(item.name,item.id));}
 picker.add(new Option('Choose a composition',''));
 panel.closest('details').addEventListener('toggle',async event=>{
  if(!event.currentTarget.open||picker.dataset.loaded)return;
  try{
   const items=await access('readonly',store=>store.getAll(IDBKeyRange.bound('composition:','composition;')));
   items.forEach(addOption);picker.dataset.loaded='true';
  }catch(error){say(error.message);}
 });
 save.onclick=async()=>{
  if(busy||save.disabled)return;
  const name=input.value.trim(),targets=[...selection].filter(canEdit);
  if(!targets.length||!name)return say('Select objects and enter a composition name.');
  save.disabled=true;
  try{
   const record={id:'composition:'+crypto.randomUUID(),name,items:targets.map(m=>({
    name:m.name,positions:m.geometry.attributes.position.array.slice(),
    indices:m.geometry.index?.array.slice(),layout:m.geometry.userData.quadLayout,
    position:m.position.toArray(),rotation:m.quaternion.toArray(),scale:m.scale.toArray(),
    color:m.material.color.getHex(),group:m.userData.groupId,curve:m.isLine,category:m.userData.featureCategory
   }))};
   await access('readwrite',store=>store.add(record,record.id));
   addOption(record);picker.value=record.id;input.value='';say('Saved '+name+'.');
  }catch(error){say('Could not save the composition. '+error.message);}finally{save.disabled=false;}
 };
 insert.onclick=async()=>{
  if(busy||insert.disabled||!picker.value)return;
  insert.disabled=true;
  try{
   const stage=workflowTools.active;
   const record=await access('readonly',store=>store.get(picker.value));
   if(!record||busy||stage!==workflowTools.active)return;
   checkpoint();
   const groups=new Map();
   const created=record.items.map(item=>{
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(item.positions,3));
    if(item.indices)geometry.setIndex(new T.BufferAttribute(item.indices,1));
    if(item.layout)geometry.userData.quadLayout=item.layout;
    if(!item.curve)geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const m=addPiece({geometry,name:item.name,curve:item.curve,category:item.category,offset:new T.Vector3().fromArray(item.position),stage:stage==='floor-plates'?stage:undefined});
    geometry.dispose();
    m.quaternion.fromArray(item.rotation);m.scale.fromArray(item.scale);m.material.color.setHex(item.color);
    if(item.group){if(!groups.has(item.group))groups.set(item.group,crypto.randomUUID());m.userData.groupId=groups.get(item.group);}
    return m;
   });
   setSelection(created);markEdited(created);fit();say('Inserted '+record.name+'.');
  }catch(error){say('Could not insert the composition. '+error.message);}finally{insert.disabled=false;}
 };
}
organizeProperties({$,compositions:installCompositions});
$('#ungroupComposition').onclick=()=>{
 if(busy||splitTools?.active)return;
 const ids=new Set([...selection].map(m=>m.userData.groupId).filter(Boolean));
 if(!ids.size)return say('Select a group first.');
 checkpoint();
 for(const m of pieces)if(ids.has(m.userData.groupId))delete m.userData.groupId;
 say('Ungrouped selection.');
};


workflowTools=installWorkflow({$,pieces:()=>pieces,select:setSelection,selection:()=>[...selection],add:addPiece,checkpoint,mark:markEdited,canEdit,layerVisible:m=>!layerTools||layerTools.isVisible(m),cad:()=>cadTools,split:()=>splitTools,locked:m=>layerTools.state(m).locked,isBusy:()=>busy,busy:value=>{busy=value;historyButtons();},say,refresh:refreshStats,fit});

viewTools=installViewportControls({$,scene,camera,orbit,transform,selection:()=>[...selection],visible:isVisible,cad:()=>cadTools,say});

massTools=installProjectMass({$,scene,camera,renderer,pieces:()=>pieces,assets:()=>assets,selection:()=>[...selection],select:setSelection,add:addPiece,canEdit,checkpoint,say,fit,thumbnail,renderFigures:renderAssets,layout:()=>layoutTools,workflow:()=>workflowTools,isBusy:()=>busy,busy:value=>{busy=value;historyButtons();}});

resolutionTools=installResolutionTools({$,scene,get camera(){return displayCamera();},renderer,orbit,transform,pieces:()=>pieces,selection:()=>[...selection],select:setSelection,add:addPiece,checkpoint,mark:markEdited,canEdit,locked:m=>layerTools.state(m).locked,layout:()=>layoutTools,workflow:()=>workflowTools,cad:()=>cadTools,isBusy:()=>busy,busy:value=>{busy=value;historyButtons();},say,fit});



function addBundledPiece(model,positions,first){
 if(busy||splitTools?.active||workflowTools?.active!=='figures')return false;
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
 geometry.userData.quadLayout=model.quadLayout;geometry.computeVertexNormals();geometry.computeBoundingBox();
 if(first)checkpoint();const mesh=addPiece({geometry,name:model.name,category:model.category,offset:model.offset?new T.Vector3().fromArray(model.offset):undefined});geometry.dispose();return mesh;
}
