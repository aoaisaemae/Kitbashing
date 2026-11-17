import {installFloorSpecs,planArea,planInterior,scaleFigure} from './floor-specs.js?v=floor-workspace-save';
import {traceCombinedContour} from './combined-contour.js';
import {splitCurvePaths} from './iteration-workspace.js?v=floor-workspace-save';
import * as T from './three.js';

const foot=304.8;
const floorColors=[0x21e0ed,0xff5284,0xdc24f4,0xee3bbd,0xd6f5ff];
const defaultGaps=[12,12,12,12];

export function stairGeometry(elevations){
 const positions=[];
 const box=(x,y,z,w,h,d)=>{
  const primitive=new T.BoxGeometry(w,h,d).translate(x,y,z);
  const triangles=primitive.toNonIndexed();
  for(const value of triangles.attributes.position.array)positions.push(value);
  triangles.dispose();primitive.dispose();
 };
 const landingDepth=4*foot,run=12*foot,thickness=.5*foot,halfWidth=4*foot;
 const near=-8*foot,far=8*foot;
 for(let level=1;level<elevations.length;level++){
  const bottom=elevations[level-1],top=elevations[level],rise=top-bottom;
  if(!(rise>0))continue;
  const halfRise=rise/2,steps=Math.max(2,Math.ceil(halfRise/(7/12*foot)));
  const tread=run/steps,riser=halfRise/steps;
  for(let step=0;step<steps;step++){
   const distance=(step+.5)*tread;
   const firstDepth=step===0?Math.min(riser,thickness):riser;
   box(-6*foot+distance,bottom+step*riser+(riser-firstDepth)/2,-2*foot,tread,riser+firstDepth,halfWidth);
   box(6*foot-distance,bottom+halfRise+step*riser,2*foot,tread,2*riser,halfWidth);
  }
  box(far,bottom+halfRise-thickness/2,0,landingDepth,thickness,8*foot);
  box(near,bottom-thickness/2,0,landingDepth,thickness,8*foot);
  if(level===elevations.length-1)box(near,top-thickness/2,0,landingDepth,thickness,8*foot);
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geometry.computeVertexNormals();geometry.computeBoundingBox();
 return geometry;
}

export function installFloorAssembly(e,reality,savePanel){
 const section=document.createElement('section');
 section.className='iteration-editor';
 section.innerHTML='<h3>Saved matrix iterations</h3><label>Matrix iteration <select class="floor-matrix-picker"></select></label><label>Assign floor <select class="floor-matrix-level"></select></label><button class="floor-matrix-insert" type="button">Insert matrix iteration</button><button class="floor-outlines" type="button" aria-pressed="false">Show combined outlines only</button><h3>Floor spacing</h3><label>Floor pair <select class="floor-pair"></select></label><label>Height between floors (ft) <input class="floor-gap" type="range" min="1" max="40" step="0.25"><output class="floor-gap-value"></output></label><p class="hint" role="status"></p>';

 const picker=section.querySelector('.floor-matrix-picker'),level=section.querySelector('.floor-matrix-level');
 const pair=section.querySelector('.floor-pair'),height=section.querySelector('.floor-gap'),output=section.querySelector('output');
 const insert=section.querySelector('button'),status=section.querySelector('[role=status]');
 for(let n=1;n<=5;n++){
  level.add(new Option('Floor '+n,String(n)));
  if(n<5)pair.add(new Option('Floor 0'+n+' – Floor 0'+(n+1),String(n-1)));
 }
 reality.firstChild.classList.add('iteration-editor');
 reality.firstChild.insertAdjacentHTML('beforeend','<h3>Stairs</h3><button class="spawn-egress" type="button">Spawn egress stairs · 20 ft × 8 ft</button><button class="stair-walls" type="button" aria-pressed="false">Walls</button><h3>Elevators</h3><label>Width (ft) <input class="elevator-width" type="number" min="1" max="40" step="0.25" value="8"></label><label>Depth (ft) <input class="elevator-depth" type="number" min="1" max="40" step="0.25" value="8"></label><button class="spawn-elevator" type="button">Spawn elevator</button><h3>Restrooms</h3><label>Size <select class="restroom-size"><option value="22">22 ft × 18 ft</option><option value="20">20 ft × 16 ft</option></select></label><label>Floor <select class="restroom-floor"></select></label><button class="spawn-restroom" type="button">Spawn restroom</button><label>Vertical circulation <select class="stair-picker"></select></label><div class="button-pair"><button class="stair-select" type="button">Select stairs</button><button class="stair-lock" type="button">Lock stairs</button></div><button class="snap-core" type="button">Snap to nearest core</button><p class="hint" role="status"></p>');
 const stairPicker=reality.querySelector('.stair-picker'),stairLock=reality.querySelector('.stair-lock'),stairSelect=reality.querySelector('.stair-select'),stairStatus=reality.querySelector('[role=status]');
 const floorMeshes=()=>e.pieces().filter(isPlate);
 const stairs=()=>e.pieces().filter(mesh=>mesh.userData.workspaceStage==='floor-plates'&&(mesh.userData.egressStair||mesh.userData.elevator));
 let storedGaps=null,records=[],store,previousFloor=false,stairKey='';
 const toggle=section.querySelector('.floor-outlines');
 const preview=new T.Group();
 e.scene.add(preview);
 let combinedOnly=false,outlineKey='';
 function setOutlineMode(enabled){
  combinedOnly=enabled;
  toggle.setAttribute('aria-pressed',String(enabled));
  toggle.textContent=enabled?'Show individual pieces':'Show combined outlines only';
 }
 toggle.onclick=()=>setOutlineMode(!combinedOnly);
 const isPlate=mesh=>mesh.isLine&&mesh.userData.workspaceStage==='floor-plates'&&Number.isInteger(mesh.userData.floorLevel);
 const colorFor=level=>floorColors[level-1]??floorColors[0];
 let planKey='',plans=new Map();
 function floorPlans(){
  const plates=floorMeshes().filter(mesh=>mesh.visible);
  for(const mesh of plates)mesh.updateWorldMatrix(true,false);
  const key=JSON.stringify(plates.map(mesh=>[mesh.uuid,mesh.geometry.uuid,mesh.userData.floorLevel,mesh.matrixWorld.elements]));
  if(key===planKey)return plans;
  planKey=key;plans=new Map();
  for(const n of new Set(plates.map(mesh=>mesh.userData.floorLevel))){
   const members=plates.filter(mesh=>mesh.userData.floorLevel===n);
   const parts=members.flatMap(mesh=>splitCurvePaths(mesh.geometry.attributes.position.array).map(({points,closed})=>({
    closed,points:points.map(([x,y])=>{
     const world=new T.Vector3(x,y,0).applyMatrix4(mesh.matrixWorld);return [world.x,world.z];
    })
   })));
   const closed=parts.filter(part=>part.closed);
   const points=closed.length===1&&parts.length===1?closed[0].points:traceCombinedContour(parts);
   plans.set(n,{points,y:members[0].position.y,area:closed.length?planArea(points):0});
  }
  return plans;
 }
 function updateOutlines(){
  const active=e.workflow().active==='floor-plates';
  if(active)for(const mesh of floorMeshes())mesh.material.color.setHex(colorFor(mesh.userData.floorLevel));
  preview.visible=active&&combinedOnly;
  if(!preview.visible)return;
  const outlines=floorPlans();
  if(planKey===outlineKey)return;
  outlineKey=planKey;
  for(const line of [...preview.children]){line.removeFromParent();line.geometry.dispose();line.material.dispose();}
  for(const [n,{points,y}] of outlines){
   if(points.length<2)continue;
   const geometry=new T.BufferGeometry().setFromPoints(points.map(([x,z])=>new T.Vector3(x,y,z)));
   preview.add(new T.LineLoop(geometry,new T.LineBasicMaterial({color:colorFor(n)})));
   if(points.length>=3){
    const shape=new T.Shape(points.map(([x,z])=>new T.Vector2(x,-z)));
    const fill=new T.Mesh(new T.ShapeGeometry(shape).rotateX(-Math.PI/2).translate(0,y,0),
     new T.MeshBasicMaterial({color:colorFor(n),transparent:true,opacity:.14,side:T.DoubleSide,depthWrite:false}));
    preview.add(fill);
   }
  }
 }
 const wallsButton=reality.querySelector('.stair-walls');
 const walls=new Map();
 let wallsOn=false;
 function setWalls(on){wallsOn=on;wallsButton.setAttribute('aria-pressed',String(on));wallsButton.classList.toggle('active',on);}
 wallsButton.onclick=()=>setWalls(!wallsOn);
 function refreshWalls(){
  const live=stairs().filter(mesh=>mesh.userData.egressStair);
  for(const [mesh,wall] of walls){
   if(wallsOn&&live.includes(mesh)&&wall.source===mesh.geometry)continue;
   wall.group.removeFromParent();
   for(const child of wall.group.children)child.geometry.dispose();
   wall.material.dispose();walls.delete(mesh);
  }
  if(!wallsOn)return;
  for(const mesh of live){
   if(walls.has(mesh))continue;
   const {min,max}=mesh.geometry.boundingBox;
   const t=2*foot,wallHeight=max.y-min.y,cy=(min.y+max.y)/2;
   const width=max.x-min.x,depth=max.z-min.z,cx=(min.x+max.x)/2,cz=(min.z+max.z)/2;
   const group=new T.Group();
   const material=new T.MeshBasicMaterial({color:0xd6f5ff,opacity:.19,transparent:true,depthWrite:false});
   const wall=(w,d,x,z)=>{
    const part=new T.Mesh(new T.BoxGeometry(w,wallHeight,d),material);
    part.position.set(x,cy,z);part.raycast=()=>{};group.add(part);
   };
   wall(width+2*t,t,cx,min.z-t/2);wall(width+2*t,t,cx,max.z+t/2);
   wall(t,depth,min.x-t/2,cz);wall(t,depth,max.x+t/2,cz);
   mesh.add(group);walls.set(mesh,{group,material,source:mesh.geometry});
  }
 }
 const restroomFloor=reality.querySelector('.restroom-floor');
 const restroomButton=reality.querySelector('.spawn-restroom');
 let restroomFloorKey='';
 function updateRestroomFloors(){
  const numbers=[...new Set(floorMeshes().map(mesh=>mesh.userData.floorLevel))].sort();
  const key=numbers.join(',');
  if(key===restroomFloorKey&&restroomFloor.options.length)return;
  restroomFloorKey=key;
  const previous=restroomFloor.value;
  restroomFloor.replaceChildren(...numbers.map(n=>new Option('Floor 0'+n,String(n))));
  if(numbers.includes(Number(previous)))restroomFloor.value=previous;
  if(!numbers.length)restroomFloor.add(new Option('No floors placed',''));
  restroomButton.disabled=!numbers.length;
 }
 function placeFloorObject(geometry,n,tag,name){
  const plan=floorPlans().get(n),point=plan?.area>0?planInterior(plan.points):null;
  if(!point){geometry.dispose();return 'Place a closed floor outline first.';}
  const count=e.pieces().filter(mesh=>mesh.userData[tag]).length;
  e.checkpoint();
  const mesh=e.add({geometry,name:name+' '+(count+1)+' · Floor 0'+n,offset:new T.Vector3(point[0],plan.y,point[1]),stage:'floor-plates'});
  geometry.dispose();
  mesh.userData[tag]=true;mesh.userData.floorLevel=n;
  e.select([mesh]);e.mark([mesh]);e.fit();
  return 'Placed '+mesh.name+'.';
 }
 restroomButton.onclick=()=>{
  if(e.isBusy()||!restroomFloor.value)return;
  const width=Number(reality.querySelector('.restroom-size').value),depth=width-4;
  stairStatus.textContent=placeFloorObject(new T.BoxGeometry(width*foot,8*foot,depth*foot).translate(0,4*foot,0),Number(restroomFloor.value),'restroom','Restroom');
 };
 const specs=installFloorSpecs(e,floorPlans,n=>placeFloorObject(scaleFigure(),n,'scalee','Scalee'));
 function gaps(){
  if(storedGaps)return storedGaps;
  const legacy=floorMeshes().find(mesh=>mesh.userData.floorSpacing>0)?.userData.floorSpacing/foot;
  return legacy>0?defaultGaps.map(()=>legacy):defaultGaps;
 }
 const elevation=n=>gaps().slice(0,n-1).reduce((sum,gap)=>sum+gap*foot,0);
 function stackedElevations(){
  const plates=floorMeshes(),occupied=[...new Set(plates.map(mesh=>mesh.userData.floorLevel))].sort((a,b)=>a-b);
  if(occupied.length<2)return [];
  const levels=[];
  for(let n=occupied[0];n<=occupied.at(-1);n++){
   const plate=plates.find(mesh=>mesh.userData.floorLevel===n);
   levels.push(plate?.position.y??elevation(n));
  }
  return [...new Set(levels)].sort((a,b)=>a-b);
 }
 function updateStairs(){
  const levels=stackedElevations();
  if(levels.length<2)return;
  for(const mesh of stairs()){
   const data=mesh.userData.elevator||mesh.userData.egressStair;
   const oldBase=data.base;
   const geometry=mesh.userData.elevator?elevatorGeometry(data.width,data.depth,levels.at(-1)-levels[0]):stairGeometry(levels.map(value=>value-levels[0]));
   mesh.geometry.dispose();mesh.geometry=geometry;
   mesh.position.y+=levels[0]-oldBase;
   mesh.userData[mesh.userData.elevator?'elevator':'egressStair']={...data,base:levels[0]};
  }
 }
 function updateGap(){
  const value=gaps()[Number(pair.value)];
  height.max=String(Math.max(40,Math.ceil(value)));
  height.value=String(value);
  output.value=Number(value.toFixed(2))+' ft';
 }
 pair.onchange=updateGap;
 height.oninput=()=>{output.value=height.value+' ft';};
 height.onchange=()=>{
  if(e.isBusy())return updateGap();
  const index=Number(pair.value),next=height.valueAsNumber,previous=gaps();
  if(!Number.isFinite(next)||next===previous[index])return;
  e.checkpoint();
  storedGaps=[...previous];storedGaps[index]=next;
  for(const mesh of e.pieces())if(mesh.userData.workspaceStage==='floor-plates'&&mesh.userData.floorLevel>index+1&&(isPlate(mesh)||mesh.userData.restroom||mesh.userData.scalee))mesh.position.y+=(next-previous[index])*foot;
  updateStairs();updateGap();
  status.textContent='Updated the height for '+pair.selectedOptions[0].textContent+'.';
 };
 async function refresh(){
  const previous=picker.value;
  records=(await store.list()).filter(item=>item.kind==='matrix-cell').sort((a,b)=>b.savedAt-a.savedAt);
  picker.replaceChildren(...records.map(record=>new Option(record.name,record.id)));
  if(records.some(record=>record.id===previous))picker.value=previous;
  if(!records.length)picker.add(new Option('No saved matrix iterations',''));
  insert.disabled=!picker.value;
  level.value=String(Math.min(5,1+Math.max(0,...floorMeshes().map(mesh=>mesh.userData.floorLevel))));
  updateGap();
 }
 insert.onclick=()=>{
  const record=records.find(item=>item.id===picker.value);
  if(!record||e.isBusy())return;
  e.checkpoint();
  const floorLevel=Number(level.value),groupId=crypto.randomUUID();
  const pieces=record.members.map(member=>{
   const geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.BufferAttribute(member.positions.slice(),3));
   geometry.computeBoundingBox();
   const mesh=e.add({geometry,name:member.name,curve:true,offset:new T.Vector3(0,elevation(floorLevel),0),stage:'floor-plates'});
   geometry.dispose();
   mesh.rotation.x=-Math.PI/2;
   Object.assign(mesh.userData,{floorLevel,groupId,matrixIterationId:record.id,program:member.program});
   return mesh;
  });
  updateStairs();
  e.select(pieces);e.mark(pieces);e.fit();
  status.textContent='Inserted '+record.name+' on Floor '+floorLevel+'.';
  level.value=String(Math.min(5,floorLevel+1));
 };
 function elevatorGeometry(width,depth,rise){
  const geometry=new T.BoxGeometry(width*foot,rise,depth*foot).translate(0,rise/2,0);
  geometry.computeBoundingBox();
  return geometry;
 }
 function spawn(elevator){
  if(e.isBusy())return;
  const levels=stackedElevations();
  if(levels.length<2){stairStatus.textContent='Insert floor plates on at least two floors first.';return;}
  const boxes=new Map(),bounds=new T.Box3();
  for(const mesh of floorMeshes()){
   const box=new T.Box3().setFromObject(mesh),n=mesh.userData.floorLevel;
   if(!boxes.has(n))boxes.set(n,new T.Box3());
   boxes.get(n).union(box);bounds.union(box);
  }
  const center=bounds.getCenter(new T.Vector3());
  const left=Math.max(...[...boxes.values()].map(box=>box.min.x)),right=Math.min(...[...boxes.values()].map(box=>box.max.x));
  const front=Math.max(...[...boxes.values()].map(box=>box.min.z)),back=Math.min(...[...boxes.values()].map(box=>box.max.z));
  if(left<=right&&front<=back){center.x=(left+right)/2;center.z=(front+back)/2;}
  center.y=levels[0];
  const geometry=elevator?elevatorGeometry(elevator.width,elevator.depth,levels.at(-1)-levels[0]):stairGeometry(levels.map(value=>value-levels[0]));
  e.checkpoint();
  const mesh=e.add({geometry,name:(elevator?'Elevator ':'Egress stairs ')+(stairs().length+1),offset:center,stage:'floor-plates'});
  geometry.dispose();mesh.userData[elevator?'elevator':'egressStair']={...elevator,base:levels[0]};
  e.select([mesh]);e.mark([mesh]);e.fit();stairKey='';
  stairPicker.dataset.preferred=mesh.studioId;
  stairStatus.textContent=(elevator?'Elevator':'Stairs')+' placed. Use Move, Rotate, or Scale to edit it.';
 }
 reality.querySelector('.spawn-egress').onclick=()=>spawn(null);
 reality.querySelector('.spawn-elevator').onclick=()=>{
  const width=reality.querySelector('.elevator-width').valueAsNumber,depth=reality.querySelector('.elevator-depth').valueAsNumber;
  if(![width,depth].every(value=>Number.isFinite(value)&&value>=1&&value<=40)){
   stairStatus.textContent='Enter a width and depth between 1 and 40 ft.';return;
  }
  spawn({width,depth});
 };
  const currentStair=()=>stairs().find(mesh=>mesh.studioId===stairPicker.value);
 const snapCore=reality.querySelector('.snap-core');
 snapCore.onclick=()=>{
  const source=currentStair();
  if(!source||!e.canEdit(source)||e.isBusy())return;
  const others=stairs().filter(mesh=>mesh!==source&&mesh.visible);
  if(!others.length)return;
  let best=null;
  for(const target of others){
   const axis=new T.Vector3(1,0,0).applyQuaternion(target.quaternion);
   const yaw=Math.atan2(-axis.z,axis.x);
   const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw);
   const inverse=rotation.clone().invert();
   const center=source.position.clone().sub(target.position).applyQuaternion(inverse);
   target.updateMatrixWorld(true);
   const toTarget=new T.Matrix4().compose(target.position.clone().negate().applyQuaternion(inverse),inverse,new T.Vector3(1,1,1));
   const fixed=target.geometry.boundingBox.clone().applyMatrix4(toTarget.multiply(target.matrixWorld));
   const moving=source.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().makeScale(source.scale.x,source.scale.y,source.scale.z));
   const x=(fixed.min.x+fixed.max.x-moving.min.x-moving.max.x)/2;
   const z=(fixed.min.z+fixed.max.z-moving.min.z-moving.max.z)/2;
   for(const [px,pz] of [[fixed.min.x-moving.max.x,z],[fixed.max.x-moving.min.x,z],[x,fixed.min.z-moving.max.z],[x,fixed.max.z-moving.min.z]]){
    const distance=Math.hypot(px-center.x,pz-center.z);
    if(!best||distance<best.distance)best={distance,rotation,position:new T.Vector3(px,0,pz).applyQuaternion(rotation).add(target.position),target};
   }
  }
  e.checkpoint();
  source.quaternion.copy(best.rotation);
  source.position.x=best.position.x;source.position.z=best.position.z;
  source.updateMatrixWorld(true);
  e.select([source]);e.mark([source]);
  stairStatus.textContent='Snapped '+source.name+' beside '+best.target.name+'.';
 };
  function updateStairButtons(){
  const mesh=currentStair();
  stairLock.disabled=!mesh;
  const noun=mesh?.userData.elevator?'elevator':'stairs';
  stairLock.textContent=(mesh?.userData.objectLocked?'Unlock ':'Lock ')+noun;
  stairSelect.textContent='Select '+noun;
  stairSelect.disabled=!mesh||!e.canEdit(mesh);
  snapCore.disabled=stairSelect.disabled||!stairs().some(target=>target!==mesh&&target.visible);
 }
 stairPicker.onchange=updateStairButtons;
 stairSelect.onclick=()=>{const mesh=currentStair();if(mesh&&e.canEdit(mesh))e.select([mesh]);};
 stairLock.onclick=()=>{
  const mesh=currentStair();
  if(!mesh||e.isBusy())return;
  e.checkpoint();mesh.userData.objectLocked=!mesh.userData.objectLocked;
  e.select(mesh.userData.objectLocked?e.selection().filter(piece=>piece!==mesh):[mesh]);
  updateStairButtons();
  stairStatus.textContent=mesh.name+(mesh.userData.objectLocked?' locked.':' unlocked.');
 };
 savePanel.innerHTML='<div class="section iteration-editor"><h3>Save floor workspace</h3><label>Workspace name <input class="floor-workspace-name" type="text" maxlength="80"></label><button class="floor-workspace-save" type="button">Save workspace</button><label>Saved workspaces <select class="floor-workspace-library"></select></label><button class="floor-workspace-insert" type="button">Insert workspace</button><p class="hint">Inserting replaces the current Floor plates workspace. Undo restores the previous workspace.</p><p class="hint" role="status"></p></div>';
 const workspaceName=savePanel.querySelector('.floor-workspace-name');
 const workspaceLibrary=savePanel.querySelector('.floor-workspace-library');
 const workspaceSave=savePanel.querySelector('.floor-workspace-save'),workspaceInsert=savePanel.querySelector('.floor-workspace-insert');
 const workspaceStatus=savePanel.querySelector('[role=status]');
 const workspacePieces=()=>e.pieces().filter(mesh=>mesh.userData.workspaceStage==='floor-plates');
 const workspaceSettings=()=>({gaps:storedGaps? [...storedGaps]:null,combinedOnly,wallsOn});
 function restoreSettings(value){
  const savedGaps=Array.isArray(value)?value:value?.gaps;
  storedGaps=savedGaps?[...savedGaps]:null;
  setOutlineMode(Boolean(value?.combinedOnly));setWalls(Boolean(value?.wallsOn));updateGap();
 }
 let workspaces=[],saveOpen=false,workspaceBusy=false;
 async function refreshWorkspaces(preferred=workspaceLibrary.value){
  workspaces=(await store.list()).filter(item=>item.kind==='floor-workspace').sort((a,b)=>b.savedAt-a.savedAt);
  workspaceLibrary.replaceChildren(...workspaces.map(item=>new Option(item.name,item.id)));
  if(workspaces.some(item=>item.id===preferred))workspaceLibrary.value=preferred;
  if(!workspaces.length)workspaceLibrary.add(new Option('No saved workspaces',''));
 }
 workspaceSave.onclick=async()=>{
  if(workspaceBusy||e.isBusy())return;
  const name=workspaceName.value.trim(),pieces=workspacePieces();
  if(!name){workspaceName.focus();workspaceStatus.textContent='Enter a workspace name.';return;}
  if(!pieces.length)return;
  workspaceBusy=true;
  try{
   const members=pieces.map(mesh=>{
    const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
    const positions=geometry.attributes.position.array.slice();
    if(geometry!==mesh.geometry)geometry.dispose();
    return {name:mesh.name,positions,curve:mesh.isLine,color:mesh.material.color.getHex(),
     position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),
     quadLayout:mesh.geometry.userData.quadLayout,data:structuredClone(mesh.userData)};
   });
   const id=crypto.randomUUID();
   await store.add({id,name,kind:'floor-workspace',members,settings:workspaceSettings(),savedAt:Date.now()});
   await refreshWorkspaces(id);workspaceStatus.textContent='Saved '+name+' on this device.';
  }catch(error){workspaceStatus.textContent=error.message;}finally{workspaceBusy=false;}
 };
 workspaceInsert.onclick=()=>{
  const record=workspaces.find(item=>item.id===workspaceLibrary.value);
  if(!record||workspaceBusy||e.isBusy())return;
  const current=workspacePieces();
  if(current.length&&!window.confirm('Replace the current Floor plates workspace with "'+record.name+'"?'))return;
  const prepared=[];
  try{
   for(const member of record.members){
    const geometry=new T.BufferGeometry();
    prepared.push({member,geometry});
    geometry.setAttribute('position',new T.BufferAttribute(member.positions.slice(),3));
    if(!member.curve)geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    if(member.quadLayout)geometry.userData.quadLayout=member.quadLayout;
   }
   e.checkpoint();e.select([]);
   for(const mesh of current){
    e.pieces().splice(e.pieces().indexOf(mesh),1);mesh.removeFromParent();
    mesh.geometry.dispose();mesh.material.dispose();
   }
   for(const {member,geometry} of prepared){
    const mesh=e.add({geometry,name:member.name,curve:member.curve,stage:'floor-plates',
     offset:new T.Vector3().fromArray(member.position),layerId:member.data.layerId});
    const layerId=mesh.userData.layerId;
    mesh.userData={...structuredClone(member.data),layerId};
    mesh.quaternion.fromArray(member.rotation);mesh.scale.fromArray(member.scale);
    mesh.material.color.setHex(member.color);
   }
   restoreSettings(record.settings);
   e.select([]);e.fit();
   workspaceName.value=record.name;workspaceStatus.textContent='Inserted '+record.name+'.';
  }catch(error){workspaceStatus.textContent=error.message;}
  finally{for(const {geometry} of prepared)geometry.dispose();}
 };
 function updateWorkspaceSave(){
  const open=!savePanel.hidden;
  if(open&&!saveOpen)refreshWorkspaces().catch(error=>{workspaceStatus.textContent=error.message;});
  saveOpen=open;
  if(!open)return;
  workspaceSave.disabled=workspaceBusy||e.isBusy()||!workspacePieces().length;
  workspaceInsert.disabled=workspaceBusy||e.isBusy()||!workspaceLibrary.value;
 }
  return {
  elevation,updateStairs,mount:parent=>parent.append(section),setStore:value=>{store=value;},
  allowsMesh:mesh=>!combinedOnly||e.workflow().active!=='floor-plates'||!isPlate(mesh),
  save:workspaceSettings,restore:restoreSettings,
  update(active,showReality,showProperties){
   section.hidden=!active;
   updateWorkspaceSave();
   updateOutlines();
   refreshWalls();
   specs.update(showProperties);
   if(active&&!previousFloor)refresh().catch(error=>{status.textContent=error.message;});
   previousFloor=active;
   if(!showReality)return;
   updateRestroomFloors();
   const available=stairs();
   const key=available.map(mesh=>mesh.studioId).join(',');
   if(key!==stairKey||stairPicker.dataset.preferred){
    stairKey=key;
    const preferred=stairPicker.dataset.preferred||stairPicker.value;
    delete stairPicker.dataset.preferred;
    stairPicker.replaceChildren(...available.map(mesh=>new Option(mesh.name,mesh.studioId)));
    if(available.some(mesh=>mesh.studioId===preferred))stairPicker.value=preferred;
    if(!available.length)stairPicker.add(new Option('No objects placed',''));
   }
   updateStairButtons();
  }
 };
}
