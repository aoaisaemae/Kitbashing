import * as T from './three.js';

const foot=304.8;
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

export function installFloorAssembly(e,reality){
 const section=document.createElement('section');
 section.className='iteration-editor';
 section.innerHTML='<h3>Saved matrix iterations</h3><label>Matrix iteration <select class="floor-matrix-picker"></select></label><label>Assign floor <select class="floor-matrix-level"></select></label><button class="floor-matrix-insert" type="button">Insert matrix iteration</button><h3>Floor spacing</h3><label>Floor pair <select class="floor-pair"></select></label><label>Height between floors (ft) <input class="floor-gap" type="range" min="1" max="40" step="0.25"><output class="floor-gap-value"></output></label><p class="hint" role="status"></p>';

 const picker=section.querySelector('.floor-matrix-picker'),level=section.querySelector('.floor-matrix-level');
 const pair=section.querySelector('.floor-pair'),height=section.querySelector('.floor-gap'),output=section.querySelector('output');
 const insert=section.querySelector('button'),status=section.querySelector('[role=status]');
 for(let n=1;n<=5;n++){
  level.add(new Option('Floor '+n,String(n)));
  if(n<5)pair.add(new Option('Floor 0'+n+' – Floor 0'+(n+1),String(n-1)));
 }
 reality.firstChild.classList.add('iteration-editor');
 reality.firstChild.insertAdjacentHTML('beforeend','<button class="spawn-egress" type="button">Spawn egress stairs · 20 ft × 8 ft</button><label>Egress stairs <select class="stair-picker"></select></label><div class="button-pair"><button class="stair-select" type="button">Select stairs</button><button class="stair-lock" type="button">Lock stairs</button></div><p class="hint" role="status"></p>');
 const stairPicker=reality.querySelector('.stair-picker'),stairLock=reality.querySelector('.stair-lock'),stairSelect=reality.querySelector('.stair-select'),stairStatus=reality.querySelector('[role=status]');
 const floorMeshes=()=>e.pieces().filter(mesh=>mesh.userData.workspaceStage==='floor-plates'&&mesh.userData.floorLevel&&!mesh.userData.egressStair);
 const stairs=()=>e.pieces().filter(mesh=>mesh.userData.workspaceStage==='floor-plates'&&mesh.userData.egressStair);
 let storedGaps=null,records=[],store,previousFloor=false,stairKey='';
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
   const oldBase=mesh.userData.egressStair.base;
   const geometry=stairGeometry(levels.map(value=>value-levels[0]));
   mesh.geometry.dispose();mesh.geometry=geometry;
   mesh.position.y+=levels[0]-oldBase;
   mesh.userData.egressStair={base:levels[0]};
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
  for(const mesh of floorMeshes())if(mesh.userData.floorLevel>index+1)mesh.position.y+=(next-previous[index])*foot;
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
 reality.querySelector('.spawn-egress').onclick=()=>{
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
  const geometry=stairGeometry(levels.map(value=>value-levels[0]));
  e.checkpoint();
  const mesh=e.add({geometry,name:'Egress stairs '+(stairs().length+1),offset:center,stage:'floor-plates'});
  geometry.dispose();mesh.userData.egressStair={base:levels[0]};
  e.select([mesh]);e.mark([mesh]);e.fit();stairKey='';
  stairPicker.dataset.preferred=mesh.studioId;
  stairStatus.textContent='Stairs placed. Move, Rotate, and Scale are available from the command line.';
 };
 const currentStair=()=>stairs().find(mesh=>mesh.studioId===stairPicker.value);
 function updateStairButtons(){
  const mesh=currentStair();
  stairLock.disabled=!mesh;
  stairLock.textContent=mesh?.userData.objectLocked?'Unlock stairs':'Lock stairs';
  stairSelect.disabled=!mesh||!e.canEdit(mesh);
 }
 stairPicker.onchange=updateStairButtons;
 stairSelect.onclick=()=>{const mesh=currentStair();if(mesh&&e.canEdit(mesh))e.select([mesh]);};
 stairLock.onclick=()=>{
  const mesh=currentStair();
  if(!mesh||e.isBusy())return;
  e.checkpoint();mesh.userData.objectLocked=!mesh.userData.objectLocked;
  e.select(mesh.userData.objectLocked?e.selection().filter(piece=>piece!==mesh):[mesh]);
  updateStairButtons();
  stairStatus.textContent=mesh.userData.objectLocked?'Stairs locked.':'Stairs unlocked.';
 };
 return {
  elevation,updateStairs,mount:parent=>parent.append(section),setStore:value=>{store=value;},
  save:()=>storedGaps,
  restore(value){storedGaps=value?[...value]:null;updateGap();},
  update(active,showReality){
   section.hidden=!active;
   if(active&&!previousFloor)refresh().catch(error=>{status.textContent=error.message;});
   previousFloor=active;
   if(!showReality)return;
   const available=stairs();
   const key=available.map(mesh=>mesh.studioId).join(',');
   if(key!==stairKey||stairPicker.dataset.preferred){
    stairKey=key;
    const preferred=stairPicker.dataset.preferred||stairPicker.value;
    delete stairPicker.dataset.preferred;
    stairPicker.replaceChildren(...available.map(mesh=>new Option(mesh.name,mesh.studioId)));
    if(available.some(mesh=>mesh.studioId===preferred))stairPicker.value=preferred;
    if(!available.length)stairPicker.add(new Option('No stairs placed',''));
   }
   updateStairButtons();
  }
 };
}
