import {installSavedPicker} from './saved-picker.js?v=site-live';
import {programBoundaryGap} from './program-continuity.js?v=piece-rotate-scale';
import {downloadMatrix,illustratorMatrix,rhinoMatrix} from './matrix-files.js?v=rhino-program-text';
import * as T from './three.js';
import {traceCombinedContour} from './combined-contour.js';

const foot=304.8,anchorCyan='#70ffff',cyan='#21e0ed',ns='http://www.w3.org/2000/svg';
const outlineCache=new WeakMap();

export function splitCurvePaths(array){
 const paths=[];
 let points=[];
 const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7;
 for(let i=0;i+5<array.length;i+=6){
  const a=[array[i],array[i+1]],b=[array[i+3],array[i+4]];
  if(points.length&&!same(points.at(-1),a)){paths.push(points);points=[];}
  if(!points.length)points.push(a);
  points.push(b);
  if(points.length>=4&&same(points[0],b)){paths.push(points);points=[];}
 }
 if(points.length)paths.push(points);
 return paths.map(points=>({points,closed:points.length>=4&&same(points[0],points.at(-1))}));
}
function pathsOf(mesh){
 const geometry=mesh.geometry;
 if(!outlineCache.has(geometry))outlineCache.set(geometry,splitCurvePaths(geometry.attributes.position.array));
 return outlineCache.get(geometry);
}
export function curveArea(paths,sx,sy){
 if(!paths.length||paths.some(path=>!path.closed))return null;
 const total=paths.reduce((sum,{points})=>{
  const [ox,oy]=points[0];
  let twice=0;
  for(let i=1;i<points.length;i++){
   const [a,b]=points[i-1],[c,d]=points[i];
   twice+=(a-ox)*(d-oy)-(c-ox)*(b-oy);
  }
  return sum+Math.abs(twice)/2;
 },0);
 return total*Math.abs(sx*sy)/(foot*foot);
}

function labelSpace(paths){
 const edges=paths.filter(path=>path.closed).flatMap(({points})=>points.slice(1).map((end,i)=>[points[i],end]));
 if(!edges.length)return null;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const [[x,y]] of edges){
  minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
 }
 let best=null;
 for(let row=0;row<11;row++)for(let col=0;col<11;col++){
  const x=T.MathUtils.lerp(minX,maxX,(col+.5)/11),y=T.MathUtils.lerp(minY,maxY,(row+.5)/11);
  let inside=false,radius=Infinity;
  for(const [[ax,ay],[bx,by]] of edges){
   const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
   if((ay>y)!==(by>y)&&x<ax+dx*(y-ay)/dy)inside=!inside;
   const t=length?T.MathUtils.clamp(((x-ax)*dx+(y-ay)*dy)/length,0,1):0;
   radius=Math.min(radius,Math.hypot(x-ax-t*dx,y-ay-t*dy));
  }
  if(inside&&radius>(best?.radius||0))best={x,y,radius};
 }
 return best;
}
export function installIterationWorkspace(e,curves,mix,ranking,savePanel,store,anchorPanel,inputSection,workspaceStage='iterations'){
 const controls=document.createElement('section');controls.className='iteration-editor';
 controls.innerHTML='<h3>Assign program</h3><label>Program name <input class="iteration-program" type="text" maxlength="80"></label><label>Floor <select class="iteration-floor"></select></label><h3>Square footage</h3><label>Target area (ft²) <input class="iteration-target" type="number" min="0" step="any"></label><p class="hint" aria-live="polite"></p><label>Iteration name <input class="iteration-group-name" type="text" maxlength="80"></label><button type="button">Save</button><p class="hint" role="status"></p>';
 curves.append(controls);
 const program=controls.querySelector('.iteration-program'),floor=controls.querySelector('select'),target=controls.querySelector('.iteration-target'),name=controls.querySelector('.iteration-group-name'),save=controls.querySelector('button');
 const [area,status]=controls.querySelectorAll('p');
 for(let i=1;i<=5;i++)floor.add(new Option('Floor '+i,String(i)));
 mix.innerHTML='<div class="section iteration-editor"><button class="saved-iteration-toggle" type="button" aria-expanded="false">Saved iteration</button><div class="saved-iteration-picker" hidden><label>Saved iteration <select></select></label><div class="button-pair"><button class="insert-saved-iteration" type="button">Insert</button><button class="delete-saved-iteration" type="button" disabled>Delete</button></div></div><label class="ranking-option"><input class="mix-program-titles" type="checkbox" checked> Show program titles</label><h3>Grid</h3><label>Columns <input class="iteration-grid-size" type="number" min="1" max="10" step="1" value="5"></label><label>Rows <input class="iteration-cell-size" type="number" min="1" max="10" step="1" value="5"></label><button class="make-iteration-grid" type="button">Create grid</button><h3>Mix</h3><label>Overlapping parts <input class="mix-overlap" type="range" min="0" max="100" value="50"></label><label>Centrality <input class="mix-centrality" type="range" min="0" max="100" value="50"></label><label>Rhythm <input aria-label="Rhythm, even to pronounced peaks and recesses" class="mix-rhythm" type="range" min="0" max="100" value="50"></label><button class="mix-iterations" type="button">MIX</button><button class="lock-variation" type="button" hidden disabled>Lock variation</button><button class="show-grid" type="button">Return to full grid</button><p class="hint" role="status"></p></div>';
 const savedToggle=mix.querySelector('.saved-iteration-toggle'),savedPanel=mix.querySelector('.saved-iteration-picker'),picker=mix.querySelector('select'),insert=mix.querySelector('.insert-saved-iteration'),mixStatus=mix.querySelector('[role=status]');
 const viewport=e.$('#viewport'),overlay=document.createElementNS(ns,'svg');
 overlay.classList.add('iteration-overlay');viewport.append(overlay);
 const labelMeasure=document.createElement('canvas').getContext('2d');
 labelMeasure.font='600 12px "Helvetica Neue", Arial, sans-serif';
 function fittedTitle(name,radius,maxSize){
  const width=labelMeasure.measureText(name).width/12;
  const text=document.createElementNS(ns,'text');
  text.style.fontSize=Math.min(maxSize,1.6*radius/Math.hypot(width,1.5))+'px';
  text.style.strokeWidth='0';
  text.textContent=name;
  return text;
 }
 const titles=mix.querySelector('.mix-program-titles');
 titles.onchange=()=>overlay.classList.toggle('hide-program-titles',e.scene.userData.spacesDisplay?.text===false||(isolationActive&&!titles.checked));
 let activeMesh=null,selectionKey='',visualKey='',grid=null,saving=false,opening=false,projectedRegions=[];
 const iterationMeshes=()=>e.pieces().filter(m=>m.isLine&&m.visible&&m.userData.workspaceStage===workspaceStage);
 const selected=()=>e.selection().filter(m=>m.isLine&&m.visible&&m.userData.workspaceStage===workspaceStage&&e.canEdit(m));
 const inIterations=()=>e.workflow().active===workspaceStage;
 function updateArea(){
  const value=activeMesh?curveArea(pathsOf(activeMesh),activeMesh.scale.x,activeMesh.scale.y):null;
  area.textContent=activeMesh?(value===null?'Open curves have no enclosed area.':'Curve area: '+value.toLocaleString(undefined,{maximumFractionDigits:6})+' ft²'):'Select one curve to edit its program and area.';
  target.disabled=!activeMesh||!(value>0);
  if(document.activeElement!==target)target.value=value>0?String(Number(value.toPrecision(10))):'';
 }
 function applyAssignment(){
  if(!inIterations()||!activeMesh||selected().length!==1||selected()[0]!==activeMesh||e.isBusy())return;
  const next=program.value.trim(),level=Number(floor.value);
  if((activeMesh.userData.program||'')===next&&(activeMesh.userData.floorLevel||1)===level)return;
  e.checkpoint();
  activeMesh.userData.program=next;activeMesh.userData.floorLevel=level;e.mark([activeMesh]);
  updateArea();
 }
 program.onchange=floor.onchange=applyAssignment;
 target.onchange=()=>{
  if(!inIterations()||!activeMesh||target.disabled||selected().length!==1||selected()[0]!==activeMesh||e.isBusy())return;
  const wanted=Number(target.value),current=curveArea(pathsOf(activeMesh),activeMesh.scale.x,activeMesh.scale.y),factor=Math.sqrt(wanted/current);
  if(!(wanted>0)||!Number.isFinite(factor)||!(factor>0)||!Number.isFinite(activeMesh.scale.x*factor)||!Number.isFinite(activeMesh.scale.y*factor)){
   status.textContent='Enter a positive area in square feet.';updateArea();return;
  }
  if(Math.abs(wanted-current)<=Math.abs(current)*1e-9){updateArea();return;}
  e.checkpoint();
  const center=new T.Box3().setFromObject(activeMesh).getCenter(new T.Vector3());
  activeMesh.scale.x*=factor;activeMesh.scale.y*=factor;
  const resized=new T.Box3().setFromObject(activeMesh).getCenter(new T.Vector3());
  activeMesh.position.x+=center.x-resized.x;activeMesh.position.y+=center.y-resized.y;
  activeMesh.updateMatrixWorld(true);e.select([activeMesh]);e.mark([activeMesh]);e.fit();updateArea();
 };
 save.onclick=async()=>{
  if(saving||e.isBusy()||!inIterations())return;
  applyAssignment();
  const meshes=selected(),label=name.value.trim();
  if(!meshes.length||!label){status.textContent='Select curves and enter an iteration name.';return;}
  saving=true;save.disabled=true;
  try{
   const members=meshes.map(mesh=>({
    name:mesh.name,positions:mesh.geometry.attributes.position.array.slice(),position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),color:mesh.material.color.getHex(),program:mesh.userData.program||'',floorLevel:mesh.userData.floorLevel||1,anchored:Boolean(mesh.userData.iterationAnchor),area:curveArea(pathsOf(mesh),mesh.scale.x,mesh.scale.y)
   }));
   const id=crypto.randomUUID();await store.add({id,name:label,members,savedAt:Date.now()});
   name.value='';status.textContent='Saved '+label+' · '+members.length+' '+(members.length===1?'curve.':'curves.');
   await refreshSaved(id);
  }catch(error){status.textContent='Could not save the iteration. '+error.message;}
  finally{saving=false;save.disabled=!selected().length;}
 };
 const curvesLibrary=document.createElement('section');curvesLibrary.className='saved-curves-reinsert';
 curvesLibrary.innerHTML='<h3>Save / insert iteration</h3><label>Saved iteration <select class="curves-iteration-picker" aria-label="Saved iteration to reinsert"></select></label><button class="curves-iteration-insert" type="button" disabled>Insert iteration</button>';
 controls.append(curvesLibrary);
 const savedLabel=curvesLibrary.querySelector('label');savedLabel.before(name.closest('label'),save,status);save.textContent='Save iteration';
 const curvesPicker=curvesLibrary.querySelector('select'),curvesInsert=curvesLibrary.querySelector('.curves-iteration-insert');
 const inputDetails=document.createElement('details');inputDetails.className='property-group iteration-curves-group iteration-input-group';
 inputDetails.innerHTML='<summary>BASE</summary><div class="property-group-content"></div>';
 const saveDetails=document.createElement('details');saveDetails.className='property-group iteration-curves-group iteration-save-group';
 saveDetails.innerHTML='<summary>SAVE</summary><div class="property-group-content"></div>';
 const inputContent=inputDetails.lastElementChild,saveContent=saveDetails.lastElementChild;
 for(const child of [...controls.children])if(child!==curvesLibrary)inputContent.append(child);
 curvesLibrary.querySelector('h3').hidden=true;saveContent.append(curvesLibrary);controls.append(inputDetails,saveDetails);
 const inputHome=inputSection?document.createComment('shared curve input library'):null;
 if(inputHome)inputSection.after(inputHome);
 function positionInputSection(inCurves){
  if(!inputSection)return;
  if(inCurves&&inputSection.parentElement!==inputContent)inputContent.prepend(inputSection);
  else if(!inCurves&&inputSection.parentNode!==inputHome.parentNode)inputHome.before(inputSection);
 }

 curvesInsert.onclick=()=>insertSaved(saved.find(record=>record.id===curvesPicker.value),false);

 let anchorPicker,anchorSpace,anchorSelection=null,anchorOptionsKey='';
 if(anchorPanel){
  anchorPanel.innerHTML='<div class="section iteration-editor"><h3>Anchor</h3><label>Saved iteration <select class="anchor-iteration-picker"></select></label><button class="anchor-iteration-insert" type="button">Insert</button><h3>Choose space</h3><label>Anchoring space <select class="anchor-space"><option value="">None</option></select></label><p class="anchor-status hint" role="status"></p></div>';
  anchorPicker=anchorPanel.querySelector('select');anchorSpace=anchorPanel.querySelector('.anchor-space');
  if(workspaceStage==='spaces'){anchorSpace.multiple=true;anchorSpace.size=6;anchorSpace.setAttribute('aria-label','Anchoring spaces');anchorSpace.closest('label').firstChild.textContent='Anchoring spaces ';const hint=document.createElement('small');hint.textContent='Ctrl/Cmd-click or Shift-click to select multiple. None clears the anchors.';anchorSpace.after(hint);}
  anchorSpace.onchange=()=>{
   if(workspaceStage==='spaces'){applySpaceAnchors();return;}
   e.checkpoint();const choice=anchorSpace.value;
   const mesh=e.pieces().find(mesh=>mesh.studioId===choice);
   anchorSelection={iterationId:anchorPicker.value,index:choice?(mesh?anchorMeshes().indexOf(mesh):Number(choice.split(':').at(-1))):-1};
   for(const part of e.pieces())if(part.userData.workspaceStage===workspaceStage)part.userData.iterationAnchor=part===mesh;
   if(grid){grid.seed.parts.forEach((part,i)=>part.anchored=Boolean(grid.seed.meshes[i]?.userData.iterationAnchor));grid.ver++;}
   anchorOptionsKey='';visualKey='';e.mark(mesh?[mesh]:[]);
   anchorPanel.querySelector('.anchor-status').textContent=choice?'Anchoring '+anchorSpace.selectedOptions[0].textContent+'.':'No anchoring space selected.';
  };
  installSavedPicker(anchorPicker,{insertButton:anchorPanel.querySelector('button'),status:anchorPanel.querySelector('.anchor-status'),isBusy:e.isBusy,onInsert:ids=>{if(workspaceStage==='spaces'){
 applySpaceAnchors();return;
 }insertIterations(ids,true);grid=null;gridArt=null;isolated=null;selectedPiece=null;clearRanking();visualKey='';anchorPanel.querySelector('.anchor-status').textContent='Inserted '+ids.length+' saved iterations.';},onDelete:async ids=>{await deleteIterations(ids);anchorPanel.querySelector('.anchor-status').textContent='Deleted '+ids.length+' saved iterations.';}});
 }

 function applySpaceAnchors(){
 const values=[...anchorSpace.selectedOptions].map(o=>o.value).filter(Boolean),record=saved.find(item=>item.id===anchorPicker.value),meshes=anchorMeshes(),chosen=new Set(),indices=[];
 for(const value of values){const index=value.startsWith('saved:')?Number(value.split(':')[1]):meshes.findIndex(m=>m.studioId===value);if(index<0)continue;indices.push(index);const member=record?.members[index];const mesh=meshes[index]||e.pieces().filter(m=>m.visible&&m.userData.workspaceStage===workspaceStage&&m.userData.program===member?.program&&member?.positions?.length===m.geometry.attributes.position.array.length&&member.positions.every((v,i)=>Math.abs(v-m.geometry.attributes.position.array[i])<1e-5)).at(-1);if(mesh)chosen.add(mesh);}
 e.checkpoint();anchorSelection={iterationId:anchorPicker.value,index:indices[0]??-1,indices};for(const mesh of e.pieces())if(mesh.userData.workspaceStage===workspaceStage)mesh.userData.iterationAnchor=chosen.has(mesh);
 if(grid){grid.seed.parts.forEach((part,i)=>part.anchored=chosen.has(grid.seed.meshes[i]));grid.ver++;}visualKey='';anchorOptionsKey='';e.mark([...chosen]);anchorPanel.querySelector('.anchor-status').textContent=indices.length?'Anchored '+indices.length+' space(s).':'No anchoring spaces selected.';
 }
 function anchorMeshes(){
  const matches=e.pieces().filter(mesh=>mesh.userData.workspaceStage===workspaceStage&&(mesh.userData.savedIterationId===anchorPicker?.value||mesh.userData.sourceIterationId===anchorPicker?.value));
  const group=matches.at(-1)?.userData.groupId;return group?matches.filter(mesh=>mesh.userData.groupId===group):matches;
 }
 function refreshAnchorSpaces(){
  if(!anchorSpace)return;
  const meshes=anchorMeshes(),record=saved.find(item=>item.id===anchorPicker.value);
  const choices=meshes.length?meshes.map((mesh,i)=>({value:mesh.studioId,name:mesh.userData.program||mesh.name,anchored:mesh.userData.iterationAnchor,index:i})):record?.members.map((member,i)=>({value:'saved:'+i,name:member.program||member.name,anchored:member.anchored,index:i}))||[];
  const key=JSON.stringify([anchorPicker.value,anchorSelection,choices]);if(key===anchorOptionsKey)return;anchorOptionsKey=key;
  anchorSpace.replaceChildren(new Option('None',''),...choices.map(choice=>new Option(choice.name,choice.value)));
  if(workspaceStage==='spaces'){
   const indices=anchorSelection?.iterationId===anchorPicker.value?(anchorSelection.indices||[anchorSelection.index]):choices.filter(c=>c.anchored).map(c=>c.index);
   for(const option of anchorSpace.options){const choice=choices.find(c=>c.value===option.value);option.selected=choice?indices.includes(choice.index):!indices.length;}return;
  }
  const pending=anchorSelection?.iterationId===anchorPicker.value?choices.find(choice=>choice.index===anchorSelection.index):null;
  anchorSpace.value=(anchorSelection?.iterationId===anchorPicker.value?pending:choices.find(choice=>choice.anchored))?.value||'';
 }
 let curvesWasOpen=false;
 const deleteSaved=mix.querySelector('.delete-saved-iteration');
 let deleting=false,saved=[],mixWasOpen=false;
 deleteSaved.onclick=async()=>{
  const item=saved.find(record=>record.id===picker.value);
  if(!item||deleting||!window.confirm('Delete saved iteration "'+item.name+'"?'))return;
  deleting=true;deleteSaved.disabled=true;
  try{
   await store.remove(item.id);
   await refreshSaved();
   mixStatus.textContent='Deleted '+item.name+'.';
  }catch(error){mixStatus.textContent='Could not delete the iteration. '+error.message;}
  finally{deleting=false;deleteSaved.disabled=!saved.length;}
 };
 async function refreshSaved(preferred=picker.value){
  try{
   saved=(await store.list()).filter(item=>Array.isArray(item.members)&&!item.kind).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
   picker.replaceChildren();
   for(const item of saved)picker.add(new Option(item.name,item.id));
   if(saved.some(item=>item.id===preferred))picker.value=preferred;
   const previous=curvesPicker.value;
   curvesPicker.replaceChildren(...saved.map(item=>new Option(item.name,item.id)));
   if(saved.some(item=>item.id===previous))curvesPicker.value=previous;
   else if(saved.some(item=>item.id===preferred))curvesPicker.value=preferred;
   if(!saved.length)curvesPicker.add(new Option('No saved iterations',''));
   if(anchorPicker){const previous=anchorPicker.value;anchorPicker.replaceChildren(...saved.map(item=>new Option(item.name,item.id)));if(saved.some(item=>item.id===previous))anchorPicker.value=previous;refreshAnchorSpaces();}
   curvesInsert.disabled=!saved.length;
   insert.disabled=!saved.length;
   deleteSaved.disabled=deleting||!saved.length;
   if(!saved.length)mixStatus.textContent='Save a named selection in Curves first.';
   else if(mixStatus.textContent==='Save a named selection in Curves first.')mixStatus.textContent='';
  }catch(error){mixStatus.textContent='Could not read saved iterations. '+error.message;}
 }
 savedToggle.onclick=()=>{
  savedPanel.hidden=!savedPanel.hidden;savedToggle.setAttribute('aria-expanded',String(!savedPanel.hidden));
  if(!savedPanel.hidden)refreshSaved();
 };
 insert.onclick=()=>insertSaved(saved.find(record=>record.id===picker.value),true);
 function insertSaved(item,forMix){
  if(!item||opening||e.isBusy()||!inIterations())return;
  opening=true;
  try{
   const group=crypto.randomUUID();e.checkpoint();
   const meshes=item.members.map((member,memberIndex)=>{
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(member.positions.slice(),3));geometry.computeBoundingBox();
    const mesh=e.add({geometry,name:member.name,curve:true,offset:new T.Vector3().fromArray(member.position),stage:workspaceStage});
    geometry.dispose();
    mesh.quaternion.fromArray(member.rotation);mesh.scale.fromArray(member.scale);mesh.material.color.setHex(member.color);
    Object.assign(mesh.userData,{groupId:group,...(forMix?{savedIterationId:item.id}:{sourceIterationId:item.id}),program:member.program,floorLevel:member.floorLevel,iterationAnchor:anchorSelection?.iterationId===item.id?(anchorSelection.indices||[anchorSelection.index]).includes(memberIndex):Boolean(member.anchored)});
    return mesh;
   });
   e.select(meshes);e.mark(meshes);e.fit();refreshAnchorSpaces();mixStatus.textContent=status.textContent='Inserted '+item.name+'.';
  }finally{opening=false;}
 };


 async function deleteIterations(ids){for(const id of ids)await store.remove(id);await refreshSaved();status.textContent=mixStatus.textContent='Deleted '+ids.length+' saved iterations.';}
 function insertIterations(ids,forMix){
  const before=new Set(e.pieces());for(const id of ids)insertSaved(saved.find(item=>item.id===id),forMix);
  const added=e.pieces().filter(mesh=>!before.has(mesh));e.select(added);e.mark(added);e.fit();
 }
 installSavedPicker(picker,{insertButton:insert,deleteButton:deleteSaved,status:mixStatus,isBusy:e.isBusy,onInsert:ids=>insertIterations(ids,true),onDelete:deleteIterations});
 installSavedPicker(curvesPicker,{insertButton:curvesInsert,status,isBusy:e.isBusy,onInsert:ids=>insertIterations(ids,false),onDelete:deleteIterations});
 const gridSize=mix.querySelector('.iteration-grid-size'),cellSize=mix.querySelector('.iteration-cell-size');
 const maxGridDimension=10;
 function clampGridDimension(input){
  const value=input.valueAsNumber;
  input.value=String(Number.isFinite(value)?Math.min(maxGridDimension,Math.max(1,Math.round(value))):Number(input.defaultValue));
  return input.valueAsNumber;
 }
 for(const input of [gridSize,cellSize]){
  input.addEventListener('input',()=>{
   if(input.valueAsNumber>maxGridDimension)clampGridDimension(input);
  });
  input.addEventListener('change',()=>clampGridDimension(input));
 }
 let isolated=null,isolationActive=false,pickingSaveCell=false,chosenSaveCell=null;
 let orientationRows=[],siteBoundary=[],boundaryVisible=false,orientationButton;
 const lockButton=mix.querySelector('.lock-variation');
 const showGridButton=mix.querySelector('.show-grid');
 ranking.innerHTML='<div class="section iteration-editor"><h3>Ranking</h3><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Separation"> Separation</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Overlapping"> Overlapping</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Continuity"> Continuity</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Rhythm"> Rhythm</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Centrality"> Centrality</label><section class="program-continuity"><h3>Program continuity</h3><div class="spec-distance-pair"><select class="continuity-from" aria-label="First program"></select><span>next to</span><select class="continuity-to" aria-label="Second program"></select></div><button class="continuity-select" type="button">Select adjacent programs</button><p class="hint">Select variations where these program boundaries touch or are within 1 ft.</p></section><button class="rank-select" type="button">Select</button><div class="button-pair"><button class="rank-keep" type="button" disabled>KEEP</button><button class="rank-delete" type="button" disabled>DELETE</button></div><div class="button-pair"><button class="rank-lock-all" type="button" disabled>Lock all</button><button class="rank-unlock-all" type="button" disabled>Unlock all</button></div><button class="rank-outline" type="button" aria-pressed="false">Draw Outline</button><button class="rank-points" type="button" aria-pressed="false">PointsOn</button><label>Outline detail <input class="rank-detail" type="range" min="0" max="100" value="100"></label><label>Curvature <input class="rank-curvature" type="range" min="0" max="100" value="50"></label><p class="hint">Drag pieces inside an isolated variation to move them. With PointsOn, double-click a corner to fillet it or an edge to restore a hidden point.</p><button class="rank-show-grid" type="button">Return to full grid</button><p class="hint" role="status"></p></div>';
 const manualDelete=document.createElement('button');manualDelete.type='button';manualDelete.className='delete-isolated-iteration';manualDelete.textContent='Delete this iteration';manualDelete.disabled=true;
 ranking.querySelector('.rank-show-grid').before(manualDelete);
 manualDelete.onclick=()=>{
  if(!grid||!isolated||grid.locked.has(isolated)||e.isBusy())return;
  e.checkpoint();grid.deleted.add(isolated);grid.layouts.delete(isolated);grid.ver++;
  fitGrid();setGridStatus('Deleted the isolated iteration. Undo restores it.');
 };
 viewport.addEventListener('click',event=>{
  if(!isolationActive||isolated!==null||ranking.hidden||!grid?.mixed||event.button!==0||event.shiftKey||event.altKey||event.ctrlKey||event.metaKey||e.isBusy())return;
  const point=pointerXY(event),row=Math.floor((grid.top-point.y)/grid.cell),column=Math.floor((point.x-grid.left)/grid.cell);
  if(row<0||column<0||row>=grid.rows||column>=grid.columns)return;
  const index=row*grid.columns+column;
  if(!index||grid.deleted.has(index)||grid.locked.has(index)||!grid.layouts.has(index))return;
  if(!ranked.delete(index))ranked.add(index);
  keep.disabled=discard.disabled=!ranked.size;visualKey='';
  setGridStatus('Selected '+ranked.size+' iterations. Click DELETE to remove them, or click a selected iteration to deselect it.');
 });
 const rankingStatus=ranking.querySelector('[role=status]');
 const setGridStatus=message=>{mixStatus.textContent=rankingStatus.textContent=message;};
 function cellBounds(index){
  const x=grid.left+(index%grid.columns)*grid.cell,y=grid.top-Math.floor(index/grid.columns)*grid.cell;
  return new T.Box3(new T.Vector3(x,y-grid.cell,0),new T.Vector3(x+grid.cell,y,0));
 }
 viewport.addEventListener('dblclick',event=>{
  if(!isolationActive||!grid?.placed||event.button!==0||e.isBusy())return;
  const bounds=viewport.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const point=pointerXY(event);
  const row=Math.floor((grid.top-point.y)/grid.cell),column=Math.floor((point.x-grid.left)/grid.cell);
  if(row<0||column<0||row>=grid.rows||column>=grid.columns)return;
  const index=row*grid.columns+column;
  if(grid.deleted.has(index))return;
  if(index&&!grid.mixed){setGridStatus('Click MIX to generate that cell first.');return;}
  event.preventDefault();
  isolateCell(index);
 });
 let selectedPiece=null,pieceDrag=null;
 let pieceMode='translate',editMode=false;
 const editBar=document.createElement('div');editBar.className='iteration-edit-bar';editBar.innerHTML='<button type="button" class="iteration-edit-toggle" aria-pressed="false">Edit mode</button><span hidden><button type="button" data-edit-mode="translate">Move</button><button type="button" data-edit-mode="rotate">Rotate</button><button type="button" data-edit-mode="scale">Scale</button></span>';viewport.append(editBar);editBar.hidden=true;
 editBar.firstElementChild.onclick=()=>{editMode=!editMode;selectedPiece=null;visualKey='';updateGridArt(true);updatePieceControls();};
 for(const button of editBar.querySelectorAll('[data-edit-mode]'))button.onclick=()=>{pieceMode=button.dataset.editMode;visualKey='';updatePieceControls();};
 const pieceControls=document.createElement('section');pieceControls.className='piece-transform';
 pieceControls.innerHTML='<h3>Edit isolated piece</h3><div class="button-pair"><button type="button" data-piece-mode="translate">Move (W)</button><button type="button" data-piece-mode="rotate">Rotate (E)</button><button type="button" data-piece-mode="scale">Scale (R)</button></div><p class="hint">Click a piece, then drag its workspace handles. Shift snaps rotation to 15° or scale to 10%. Drag the piece itself to move it.</p>';
 ranking.querySelector('.rank-outline').before(pieceControls);
 function updatePieceControls(){
  editBar.hidden=workspaceStage!=='spaces'||!isolationActive||isolated===null;editBar.firstElementChild.setAttribute('aria-pressed',String(editMode));editBar.lastElementChild.hidden=!editMode;for(const button of editBar.querySelectorAll('[data-edit-mode]'))button.setAttribute('aria-pressed',String(button.dataset.editMode===pieceMode));
  pieceControls.hidden=!isolationActive||isolated===null||(workspaceStage==='spaces'&&!editMode);
  for(const button of pieceControls.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.pieceMode===pieceMode));
 }
 for(const button of pieceControls.querySelectorAll('button'))button.onclick=()=>{pieceMode=button.dataset.pieceMode;visualKey='';updatePieceControls();};
 document.addEventListener('keydown',event=>{
  if(!isolationActive||!selectedPiece||isolated===null||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const mode={w:'translate',e:'rotate',r:'scale'}[event.key.toLowerCase()];
  if(!mode)return;event.preventDefault();event.stopImmediatePropagation();pieceMode=mode;visualKey='';updatePieceControls();
 },true);
 function pointerXY(event){
  const bounds=viewport.getBoundingClientRect();
  const ndc=new T.Vector2((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);const ray=new T.Raycaster();ray.setFromCamera(ndc,e.camera);return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,0,1),0),new T.Vector3())||new T.Vector3(Infinity,Infinity,0);
 }
 function startPieceDrag(event,index,part,mesh=null,mode='translate'){
  if((workspaceStage==='spaces'&&!editMode)||event.button!==0||!isolationActive||isolated!==index||e.isBusy()||event.altKey||event.ctrlKey||event.metaKey)return;
  event.preventDefault();event.stopPropagation();
  if(grid.locked.has(index)||(mesh&&!e.canEdit(mesh))){
   setGridStatus('Unlock this variation before moving its pieces.');return;
  }
  if(!(workspaceStage==='spaces'&&editMode)&&(index||workspaceStage==='spaces')&&(grid.seed.parts[part]?.anchored||mesh?.userData.iterationAnchor)){setGridStatus('Choose another anchoring space or None before editing this piece.');return;}
  selectedPiece={index,part};updatePieceControls();
  updateGridArt(true);
  e.select([]);
  const center=mesh?new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()):new T.Vector3(...grid.layouts.get(index)[part].slice(0,2),0);
  pieceDrag={id:event.pointerId,index,part,mesh,mode:mode.startsWith('translate')?'translate':mode,axis:mode.split('-')[1],center,start:pointerXY(event),layout:mesh?null:grid.layouts.get(index),
   rotation:mesh?.quaternion.clone(),scale:mesh?.scale.clone(),
   position:mesh?.position.clone(),orbit:e.orbit.enabled,transform:e.transform.enabled,changed:false};
  e.orbit.enabled=false;e.transform.enabled=false;
  viewport.setPointerCapture(event.pointerId);
  visualKey='';
 }
 function pieceHits(parent,d,index,part,mesh=null){
  const hit=document.createElementNS(ns,'path');
  hit.setAttribute('d',d);hit.setAttribute('fill','transparent');hit.setAttribute('fill-rule','evenodd');
  hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','10');hit.setAttribute('vector-effect','non-scaling-stroke');
  hit.dataset.editPiece=String(part);
  hit.style.pointerEvents=workspaceStage==='spaces'&&!editMode?'none':'all';hit.style.cursor=pieceMode==='translate'?'move':'grab';
  hit.addEventListener('pointerdown',event=>startPieceDrag(event,index,part,mesh,pieceMode));
  hit.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});
  parent.append(hit);
 }
 viewport.addEventListener('pointermove',event=>{
  const drag=pieceDrag;
  if(!drag||drag.id!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();
  const current=pointerXY(event),delta=current.clone().sub(drag.start);
  if(drag.axis==='x')delta.y=0;if(drag.axis==='y')delta.x=0;
  if(!drag.changed&&delta.lengthSq()<1e-10)return;
  if(!drag.changed){e.checkpoint();drag.changed=true;}
  const origin=drag.start.clone().sub(drag.center),now=current.clone().sub(drag.center);
  let angle=Math.atan2(now.y,now.x)-Math.atan2(origin.y,origin.x);
  let factor=Math.max(.01,Math.min(100,now.length()/Math.max(origin.length(),1e-8)));
  if(event.shiftKey){angle=Math.round(angle/(Math.PI/12))*Math.PI/12;factor=Math.max(.1,Math.round(factor*10)/10);}
  if(drag.mesh){
   drag.mesh.position.copy(drag.position);drag.mesh.quaternion.copy(drag.rotation);drag.mesh.scale.copy(drag.scale);
   if(drag.mode==='translate')drag.mesh.position.add(new T.Vector3(delta.x,delta.y,0));
   else if(drag.mode==='rotate'){
    const rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle);
    drag.mesh.quaternion.premultiply(rotation);drag.mesh.position.sub(drag.center).applyQuaternion(rotation).add(drag.center);
   }else{drag.mesh.scale.x*=factor;drag.mesh.scale.y*=factor;drag.mesh.position.sub(drag.center).multiplyScalar(factor).add(drag.center);}
   drag.mesh.updateMatrixWorld(true);
  }else{
   const layout=drag.layout.map(row=>[...row]),part=layout[drag.part];
   if(drag.mode==='translate'){part[0]+=delta.x;part[1]+=delta.y;}
   else if(drag.mode==='rotate')part[2]+=angle*180/Math.PI;
   else part[3]=(part[3]??1)*factor;
   grid.layouts.set(drag.index,layout);updateGridArt(true);
  }
  grid.ver++;visualKey='';
 });
 function endPieceDrag(event){
  const drag=pieceDrag;
  if(!drag||drag.id!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();
  pieceDrag=null;
  e.orbit.enabled=drag.orbit;e.transform.enabled=drag.transform;
  if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
  if(event.type!=='pointerup'&&drag.changed){
   if(drag.mesh){drag.mesh.position.copy(drag.position);drag.mesh.quaternion.copy(drag.rotation);drag.mesh.scale.copy(drag.scale);drag.mesh.updateMatrixWorld(true);}
   else{grid.layouts.set(drag.index,drag.layout);updateGridArt(true);}
   grid.ver++;visualKey='';
  }else if(drag.changed){
   if(drag.mesh){e.mark([drag.mesh]);grid.seed=getSeed()||grid.seed;}
   setGridStatus('Edited a piece in this variation. Lock the variation to keep it during MIX.');
  }
 }
 for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,endPieceDrag);
  function updateLockButton(){
  updatePieceControls();
  lockButton.hidden=lockButton.disabled=!isolated||!grid?.layouts.has(isolated);
  lockButton.textContent=grid?.locked.has(isolated)?'Unlock variation':'Lock variation';
 }
 lockButton.onclick=()=>{
  if(lockButton.disabled)return;
  if(grid.locked.delete(isolated))setGridStatus('Variation unlocked.');
  else{grid.locked.add(isolated);setGridStatus('Variation locked. MIX will keep this cell.');}
  updateLockButton();
  const cell=gridArt.querySelector('[data-cell="'+isolated+'"]');
  if(cell)colorVariation(cell,grid.locked.has(isolated));
 };
 function isolateCell(index){

  selectedPiece=null;editMode=false;
  isolated=index;updateGridArt(true);refreshOutlines();updateLockButton();
  if(index)e.select([]);
  e.fit(cellBounds(index),true);
  setGridStatus('Isolated row '+(Math.floor(index/grid.columns)+1)+', column '+(index%grid.columns+1)+'. Use arrow keys to browse.');
 }
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||!isolationActive||isolated===null||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  event.preventDefault();
  event.stopPropagation();
  fitGrid();
 },true);
  document.addEventListener('keydown',event=>{
  if(!isolationActive||isolated===null||!grid?.mixed||e.isBusy()||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const directions={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};
  const delta=directions[event.key];if(!delta)return;
  event.preventDefault();
  const row=Math.floor(isolated/grid.columns)+delta[0],column=isolated%grid.columns+delta[1];
  if(row>=0&&row<grid.rows&&column>=0&&column<grid.columns&&!grid.deleted.has(row*grid.columns+column))isolateCell(row*grid.columns+column);
 });
 viewport.addEventListener('click',event=>{
  if(!event.shiftKey||event.button!==0||!isolationActive||ranking.hidden||!ranked.size)return;
  const bounds=viewport.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const point=pointerXY(event);
  const row=Math.floor((grid.top-point.y)/grid.cell),col=Math.floor((point.x-grid.left)/grid.cell);
  if(row<0||row>=grid.rows||col<0||col>=grid.columns)return;
  if(!ranked.delete(row*grid.columns+col))return;
  keep.disabled=discard.disabled=!ranked.size;
  visualKey='';
  setGridStatus(ranked.size+' variations selected.');
 });
  const ranked=new Set();
 const lockAll=ranking.querySelector('.rank-lock-all'),unlockAll=ranking.querySelector('.rank-unlock-all');
 lockAll.onclick=()=>{
  if(!grid?.layouts.size)return;
  for(const index of grid.layouts.keys())grid.locked.add(index);
  clearRanking();updateLockButton();setGridStatus('Locked all '+grid.locked.size+' variations.');
 };
 unlockAll.onclick=()=>{
  if(!grid?.locked.size)return;
  grid.locked.clear();
  clearRanking();updateLockButton();setGridStatus('Unlocked all variations.');
 };
 const outlineButton=ranking.querySelector('.rank-outline');
 const detail=ranking.querySelector('.rank-detail'),curvature=ranking.querySelector('.rank-curvature');
 const filletsByLayout=new WeakMap(),restoredByLayout=new WeakMap();
 const pointsButton=ranking.querySelector('.rank-points');
 let showOutlines=false,showPoints=false;
 pointsButton.onclick=()=>{
  showPoints=!showPoints;
  pointsButton.setAttribute('aria-pressed',String(showPoints));
  pointsButton.textContent=showPoints?'PointsOff':'PointsOn';
  if(showPoints&&!showOutlines)outlineButton.click();
  refreshOutlines();
 };
 function refreshOutlines(){
  gridArt?.querySelectorAll('[data-variation-outline]').forEach(outline=>outline.remove());
  visualKey='';
 }
 detail.oninput=curvature.oninput=refreshOutlines;
 outlineButton.onclick=()=>{
  if(!grid?.mixed)return setGridStatus('Run MIX to generate variations first.');
  showOutlines=!showOutlines;
  outlineButton.setAttribute('aria-pressed',String(showOutlines));
  outlineButton.textContent=showOutlines?'Hide Outline':'Draw Outline';
  visualKey='';
 };
 const contoursByLayout=new WeakMap();
 function variationContour(index){
  const layout=grid.layouts.get(index);
  if(contoursByLayout.has(layout))return contoursByLayout.get(layout);
  const parts=grid.seed.parts.map(({paths,center},i)=>{
   const [x,y,degrees,scale=1]=layout[i];
   const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
   return paths.map(({points,closed})=>({closed,points:points.map(([px,py])=>{
    const dx=(px-center.x)*scale,dy=(py-center.y)*scale;
    return [x+c*dx-s*dy,y+s*dx+c*dy];
   })}));
  }).flat();
  const contour=traceCombinedContour(parts);
  contoursByLayout.set(layout,contour);
  return contour;
 }
 function drawVariationOutline(index,group){
  const hull=variationContour(index);
  if(hull.length<3)return;
  const layout=grid.layouts.get(index);
  if(!restoredByLayout.has(layout))restoredByLayout.set(layout,new Set());
  const restored=restoredByLayout.get(layout);
  const corners=hull.map((point,id)=>({point,id}));
  const remaining=Math.max(3,Math.round(3+(corners.length-3)*detail.valueAsNumber/100));
  while(corners.length>remaining){
   let smallest=Infinity,remove=-1;
   for(let i=0;i<corners.length;i++){
    if(restored.has(corners[i].id))continue;
    const [x,y]=corners[i].point;
    const [ax,ay]=corners[(i+corners.length-1)%corners.length].point;
    const [bx,by]=corners[(i+1)%corners.length].point;
    const area=Math.abs((x-ax)*(by-ay)-(y-ay)*(bx-ax));
    if(area<smallest){smallest=area;remove=i;}
   }
   if(remove<0)break;
   corners.splice(remove,1);
  }
  if(!filletsByLayout.has(layout))filletsByLayout.set(layout,new Set());
  const fillets=filletsByLayout.get(layout);
  const outline=document.createElementNS(ns,'g');
  const path=document.createElementNS(ns,'path');
  const commands=corners.map(({point,id},i)=>{
   const amount=fillets.has(id)?curvature.valueAsNumber*.0045:0;
   const interpolate=other=>point.map((value,j)=>T.MathUtils.lerp(value,other[j],amount)).join(',');
   const entry=interpolate(corners[(i+corners.length-1)%corners.length].point);
   const exit=interpolate(corners[(i+1)%corners.length].point);
   return (i?'L':'M')+entry+(amount?' Q'+point.join(',')+' '+exit:'');
  });
  path.setAttribute('d',commands.join(' ')+' Z');
  path.setAttribute('fill','none');
  path.setAttribute('stroke','var(--variation-outline-stroke, #80ddff)');
  path.setAttribute('stroke-width','2.5');
  path.setAttribute('stroke-linejoin','round');
  path.setAttribute('vector-effect','non-scaling-stroke');
  outline.dataset.variationOutline='';
  outline.append(path);
  if(showPoints&&isolated===index){
   const edgeTarget=path.cloneNode();
   edgeTarget.setAttribute('stroke','transparent');
   edgeTarget.setAttribute('stroke-width','16');
   edgeTarget.style.pointerEvents='stroke';
   edgeTarget.style.cursor='copy';
   for(const type of ['pointerdown','pointerup','click'])edgeTarget.addEventListener(type,event=>event.stopPropagation());
   edgeTarget.addEventListener('dblclick',event=>{
    event.preventDefault();event.stopPropagation();
    const bounds=viewport.getBoundingClientRect();
    const point=pointerXY(event);
    const distance=(x,y,[ax,ay],[bx,by])=>{
     const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
     const t=length?T.MathUtils.clamp(((x-ax)*dx+(y-ay)*dy)/length,0,1):0;
     return Math.hypot(x-ax-t*dx,y-ay-t*dy);
    };
    let closest=0,min=Infinity;
    for(const [i,{point:a}] of corners.entries()){
     const b=corners[(i+1)%corners.length].point,d=distance(point.x,point.y,a,b);
     if(d<min){min=d;closest=i;}
    }
    const a=corners[closest],b=corners[(closest+1)%corners.length];
    let best=-1,offset=-1;
    for(let id=(a.id+1)%hull.length;id!==b.id;id=(id+1)%hull.length){
     const d=distance(...hull[id],a.point,b.point);
     if(d>offset){offset=d;best=id;}
    }
    if(best<0){setGridStatus('This edge has no hidden outline points.');return;}
    restored.add(best);refreshOutlines();setGridStatus('Restored a point from the original outline.');
   });
   outline.append(edgeTarget);
   for(const [i,{point:[x,y],id}] of corners.entries()){
    const [ax,ay]=corners[(i+corners.length-1)%corners.length].point;
    const [bx,by]=corners[(i+1)%corners.length].point;
    const cosine=((ax-x)*(bx-x)+(ay-y)*(by-y))/(Math.hypot(ax-x,ay-y)*Math.hypot(bx-x,by-y));
    if(cosine<-.82&&!fillets.has(id)&&!restored.has(id))continue;
    const handle=document.createElementNS(ns,'circle');
    handle.setAttribute('cx',x);handle.setAttribute('cy',y);
    handle.setAttribute('r',grid.cell*.008);
    handle.setAttribute('fill',fillets.has(id)?'#e020ff':cyan);
    handle.style.pointerEvents='all';
    handle.style.cursor='pointer';
    for(const type of ['pointerdown','pointerup','click'])handle.addEventListener(type,event=>event.stopPropagation());
    handle.addEventListener('dblclick',event=>{
     event.preventDefault();event.stopPropagation();
     if(!fillets.delete(id))fillets.add(id);
     refreshOutlines();
    });
    outline.append(handle);
   }
  }
  group.append(outline);
 }
 const continuitySection=ranking.querySelector('.program-continuity');
 const firstPair=continuitySection.querySelector('.spec-distance-pair');
 for(let i=1;i<3;i++)firstPair.after(firstPair.cloneNode(true));
 const continuityRows=[...continuitySection.querySelectorAll('.spec-distance-pair')].map((row,i)=>{
  row.classList.add('continuity-pair');
  const enabled=document.createElement('input');
  enabled.type='checkbox';enabled.checked=true;enabled.className='continuity-enabled';
  enabled.setAttribute('aria-label','Enable continuity pair '+(i+1));
  row.prepend(enabled);
  const selects=[...row.querySelectorAll('select')];
  selects[0].setAttribute('aria-label','First program, pair '+(i+1));
  selects[1].setAttribute('aria-label','Second program, pair '+(i+1));
  return selects;
 });
 const continuityChecks=[...continuitySection.querySelectorAll('.continuity-enabled')];
 const continuityButton=ranking.querySelector('.continuity-select');
 continuitySection.querySelector('p').textContent='Select variations satisfying every checked pair. Boundaries must touch or be within 1 ft.';
 let continuityKey='';
 function refreshPrograms(preferred){
  const names=[...new Set((grid?.seed.parts||[]).map(part=>part.program?.trim()).filter(Boolean))].sort();
  const key=JSON.stringify(names);
  refreshOrientationPrograms(names);
  if(key===continuityKey&&!preferred)return;
  continuityKey=key;
  const values=typeof preferred?.[0]==='string'?[preferred]:preferred;
  for(const [i,row] of continuityRows.entries())for(const [j,select] of row.entries()){
   const previous=values?.[i]?.[j]??select.value;
   select.replaceChildren(new Option('Choose program',''),...names.map(name=>new Option(name,name)));
   if(names.includes(previous))select.value=previous;
  }
 }
 const programPairs=()=>continuityRows.filter((_,i)=>continuityChecks[i].checked).map(row=>row.map(select=>select.value)).filter(([a,b])=>a&&b&&a!==b);
 const validPairs=()=>continuityRows.every(([a,b],i)=>!continuityChecks[i].checked||(!a.value&&!b.value)||(a.value&&b.value&&a.value!==b.value));
 for(const input of [...continuityRows.flat(),...continuityChecks])input.onchange=clearRanking;
 continuityButton.onclick=()=>{
  if(!grid?.mixed)return setGridStatus('Run MIX to generate variations first.');
  const pairs=programPairs();
  if(!pairs.length||!validPairs())return setGridStatus('Complete each chosen pair with two different programs.');
  fitGrid();
  let reviewed=0;
  for(const [index,layout] of grid.layouts){
   if(grid.deleted.has(index)||grid.locked.has(index))continue;
   reviewed++;
   if(pairs.every(([a,b])=>programBoundaryGap(grid.seed.parts,layout,a,b)<=foot+1e-7))ranked.add(index);
  }
  keep.disabled=discard.disabled=!ranked.size;
  visualKey='';
  setGridStatus('Selected '+ranked.size+' of '+reviewed+' variations satisfying '+pairs.length+' program '+(pairs.length===1?'pair.':'pairs.'));
 };
  const criteria=[...ranking.querySelectorAll('[name=ranking-criterion]')];
 const keep=ranking.querySelector('.rank-keep'),discard=ranking.querySelector('.rank-delete');
 function clearRanking(){
  ranked.clear();keep.disabled=discard.disabled=true;visualKey='';
 }
 for(const input of criteria)input.onchange=clearRanking;
 function separationScore(layout){
  const shapes=grid.seed.parts.map(({paths,center},i)=>{
   const [x,y,degrees,scale=1]=layout[i],angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
   return paths.map(({points,closed})=>({closed,points:points.map(([px,py])=>{
    const dx=(px-center.x)*scale,dy=(py-center.y)*scale;
    return [x+c*dx-s*dy,y+s*dx+c*dy];
   })}));
  });
  if(shapes.length<2)return 0;
  const clearance=shapes.map((source,i)=>{
   let nearest=Infinity;
   for(const [j,target] of shapes.entries()){
    if(i===j)continue;
    for(const {points} of source)for(const [x,y] of points.filter((_,k)=>k%Math.max(1,Math.ceil(points.length/48))===0)){
     let inside=false,distance=Infinity;
     for(const path of target)for(let k=1;k<path.points.length;k++){
      const [ax,ay]=path.points[k-1],[bx,by]=path.points[k];
      const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
      if(path.closed&&(ay>y)!==(by>y)&&x<ax+dx*(y-ay)/dy)inside=!inside;
      const t=length?T.MathUtils.clamp(((x-ax)*dx+(y-ay)*dy)/length,0,1):0;
      distance=Math.min(distance,Math.hypot(x-ax-t*dx,y-ay-t*dy));
     }
     nearest=Math.min(nearest,inside?-distance:distance);
    }
   }
   return Number.isFinite(nearest)?nearest:0;
  });
  return clearance.reduce((sum,gap)=>sum+gap,0)/clearance.length;
 }
  function scoreVariation(layout,criterion){
  const nearest=layout.map(([x,y],i)=>layout.reduce((distance,[px,py],j)=>i===j?distance:Math.min(distance,Math.hypot(x-px,y-py)-grid.seed.parts[i].radius-grid.seed.parts[j].radius),Infinity));
  const gaps=nearest.map(gap=>Number.isFinite(gap)?gap:0);
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  switch(criterion){
   case 'Separation':return separationScore(layout);
   case 'Overlapping':return mean(gaps.map(gap=>Math.max(0,-gap)));
   case 'Continuity':return programPairs().length?-Math.max(...programPairs().map(([a,b])=>programBoundaryGap(grid.seed.parts,layout,a,b))):-mean(gaps.map(Math.abs));
   case 'Rhythm':return Math.max(...gaps)-Math.min(...gaps);
   case 'Centrality':{
    const x=mean(layout.map(point=>point[0]));
    return -mean(layout.map(point=>Math.abs(point[0]-x)));
   }
  }
 }
 ranking.querySelector('.rank-select').onclick=()=>{
  if(!grid?.mixed)return setGridStatus('Run MIX to generate variations first.');
  const checked=criteria.filter(input=>input.checked);
  if(!checked.length)return setGridStatus('Check at least one ranking criterion.');
  const candidates=[...grid.layouts].filter(([index])=>!grid.deleted.has(index)&&!grid.locked.has(index));
  fitGrid();
  for(const input of checked){
   const scores=candidates.map(([index,layout])=>[index,scoreVariation(layout,input.value)]).sort((a,b)=>b[1]-a[1]);
   const cutoff=scores[Math.ceil(scores.length/4)-1]?.[1];
   for(const [index,score] of scores)if(score>=cutoff)ranked.add(index);
  }
  if(!ranked.size)return setGridStatus('No unreviewed variations remain.');
  keep.disabled=discard.disabled=false;
  setGridStatus('Selected '+ranked.size+' of '+candidates.length+' unreviewed variations.');
 };
 keep.onclick=()=>{
  const count=ranked.size;
  for(const index of ranked){
   grid.locked.add(index);
   const cell=gridArt.querySelector('[data-cell="'+index+'"]');
   if(cell)colorVariation(cell,true);
  }
  clearRanking();updateLockButton();setGridStatus('Kept and locked '+count+' variations.');
 };
 discard.onclick=()=>{
  if(!grid||!ranked.size||e.isBusy())return;
  e.checkpoint();
  const count=ranked.size;
  for(const index of ranked){
   if(grid.locked.has(index))continue;
   grid.deleted.add(index);grid.layouts.delete(index);
   gridArt.querySelector('[data-cell="'+index+'"]')?.remove();
  }
  grid.ver++;clearRanking();fitGrid();setGridStatus('Deleted '+count+' variations. Undo restores them.');
 };
  function fitGrid(){
  if(!isolationActive||!grid)return false;
  selectedPiece=null;editMode=false;
  isolated=null;updateGridArt(true);refreshOutlines();updateLockButton();clearRanking();
  e.fit(gridBounds(),true);setGridStatus('Showing the full grid.');
  return true;
 }
 showGridButton.onclick=ranking.querySelector('.rank-show-grid').onclick=fitGrid;
 const inWorkspace=mesh=>!inIterations()||mesh.userData.workspaceStage!==workspaceStage||!!mesh.userData.realitySpace||workspaceStage==='spaces'||Boolean(mesh.userData.savedIterationId)===isolationActive;
 const allowsMesh=mesh=>(workspaceStage!=='spaces'||(mesh.userData.iterationAnchor?e.scene.userData.spacesDisplay?.anchors:mesh.userData.spaceKind==='outline'?e.scene.userData.spacesDisplay?.outline:e.scene.userData.spacesDisplay?.programs)!==false)&&inWorkspace(mesh)&&(!isolationActive||isolated===null||(isolated===0&&grid.seed.meshes.includes(mesh)));
 function gridBounds(){
  if(!grid)return new T.Box3();
  return new T.Box3(new T.Vector3(grid.left,grid.top-grid.rows*grid.cell,0),new T.Vector3(grid.left+grid.columns*grid.cell,grid.top,0));
 }
 function getSeed(){
  const visible=iterationMeshes().filter(inWorkspace);
  const chosen=selected().find(mesh=>visible.includes(mesh));
  const first=chosen||visible.find(mesh=>mesh.userData.savedIterationId===picker.value)||visible.at(-1);
  if(!first)return null;
  const meshes=visible.filter(mesh=>mesh.userData.groupId===first.userData.groupId);
  const source=meshes.map(mesh=>({
   positions:mesh.geometry.attributes.position.array,position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),program:mesh.userData.program,anchored:Boolean(mesh.userData.iterationAnchor)
  }));
  const bounds=new T.Box3();
  const parts=source.map(member=>{
   const matrix=new T.Matrix4().compose(new T.Vector3().fromArray(member.position),new T.Quaternion().fromArray(member.rotation),new T.Vector3().fromArray(member.scale));
   const box=new T.Box3();
   const paths=splitCurvePaths(member.positions).map(path=>({...path,points:path.points.map(([x,y])=>{
    const v=new T.Vector3(x,y,0).applyMatrix4(matrix);v.z=0;box.expandByPoint(v);bounds.expandByPoint(v);return [v.x,v.y];
   })}));
   const center=box.getCenter(new T.Vector3());
   const radius=paths.reduce((largest,path)=>path.points.reduce((max,[x,y])=>Math.max(max,Math.hypot(x-center.x,y-center.y)),largest),0);
   return {paths,center,radius,box,program:member.program,anchored:member.anchored};
  }).filter(part=>part.paths.length);
  if(bounds.isEmpty()||!parts.length)return null;
  return {parts,meshes,center:bounds.getCenter(new T.Vector3()),size:bounds.getSize(new T.Vector3())};
 }
 function createGrid(place){
  if(!inIterations()||e.isBusy())return;
  const columns=clampGridDimension(gridSize),rows=clampGridDimension(cellSize);
  if(![columns,rows].every(n=>Number.isInteger(n)&&n>=1&&n<=maxGridDimension))return mixStatus.textContent='Enter 1 to '+maxGridDimension+' columns and rows.';
  const seed=getSeed();
  if(!seed)return mixStatus.textContent='Insert a saved iteration before creating a grid.';
  if(place&&seed.meshes.some(mesh=>!e.canEdit(mesh)))return mixStatus.textContent='Unlock the composition before moving it.';
  const packingColumns=Math.ceil(Math.sqrt(seed.parts.length));
  const packingRows=[];
  for(let i=0;i<seed.parts.length;i+=packingColumns){
   const row=seed.parts.slice(i,i+packingColumns);
   packingRows.push({width:2*row.reduce((sum,part)=>sum+part.radius,0),height:2*Math.max(...row.map(part=>part.radius))});
  }
  const packingHeight=packingRows.reduce((sum,row)=>sum+row.height,0);
  const packingWidth=Math.max(...packingRows.map(row=>row.width));
  let y=packingHeight/2;
  const packed=packingRows.flatMap((row,index)=>{
   let x=-row.width/2;
   const centers=seed.parts.slice(index*packingColumns,(index+1)*packingColumns).map(({radius})=>{
    const center=[x+radius,y-row.height/2];
    x+=2*radius;
    return center;
   });
   y-=row.height;
   return centers;
  });
  const areas=seed.parts.reduce((sum,{paths})=>sum+(curveArea(paths.filter(path=>path.closed),1,1)||0)*foot*foot,0);
  function compactLayout(amount){
   return seed.parts.map(({center},i)=>[
    T.MathUtils.lerp(center.x-seed.center.x,packed[i][0],amount),
    T.MathUtils.lerp(center.y-seed.center.y,packed[i][1],amount)
   ]);
  }
  function overlapBound(layout){
   const boxes=seed.parts.map(({box,center},i)=>{
    const [x,y]=layout[i];
    return [box.min.x-center.x+x,box.min.y-center.y+y,box.max.x-center.x+x,box.max.y-center.y+y];
   });
   let overlap=0;
   for(let i=0;i<boxes.length;i++){
    const [left,bottom,right,top]=boxes[i];
    for(const [x0,y0,x1,y1] of boxes.slice(0,i)){
     overlap+=Math.max(0,Math.min(right,x1)-Math.max(left,x0))*Math.max(0,Math.min(top,y1)-Math.max(bottom,y0));
    }
   }
   return overlap;
  }
  let compact=packed;
  for(let step=0;step<24;step++){
   const candidate=compactLayout(step/24);
   if(overlapBound(candidate)<=areas*.2){compact=candidate;break;}
  }
  const cell=Math.max(seed.size.x*1.15,seed.size.y*1.15,packingWidth*1.06,packingHeight*1.06,.01);
  const reuse=grid&&grid.columns===columns&&grid.rows===rows&&Math.abs(grid.cell-cell)<cell*1e-6;
  const left=workspaceStage==='spaces'?seed.center.x-cell/2:reuse?grid.left:seed.center.x-columns*cell/2,top=workspaceStage==='spaces'?seed.center.y+cell/2:reuse?grid.top:seed.center.y+rows*cell/2;
  grid={columns,rows,cell,left,top,seed,placed:place,compact,packed,deleted:new Set(),locked:new Set(),layouts:new Map(),mixed:false,ver:Date.now()};
  isolated=null;chosenSaveCell=null;pickingSaveCell=false;updateLockButton();clearRanking();
  if(place&&workspaceStage!=='spaces'){
   const dx=left+cell/2-seed.center.x,dy=top-cell/2-seed.center.y;
   if(dx||dy)e.checkpoint();
   for(const mesh of seed.meshes){mesh.position.x+=dx;mesh.position.y+=dy;mesh.updateMatrixWorld(true);}
   e.select(seed.meshes);e.mark(seed.meshes);
  }
  updateGridArt();
  e.fit(gridBounds(),true);
  mixStatus.textContent=place?(workspaceStage==='spaces'?'Grid created around the original composition.':'Composition moved to the top-left cell.'):'Created a '+columns+' × '+rows+' grid with '+(cell/foot).toLocaleString(undefined,{maximumFractionDigits:4})+' ft cells.';
 }
 mix.querySelector('.make-iteration-grid').onclick=()=>createGrid(true);
 mix.querySelector('.mix-iterations').onclick=()=>{
  if(!inIterations()||e.isBusy())return;
  if(!grid?.placed)createGrid(true);
  if(!grid?.placed)return;
  grid.settings=['overlap','centrality','rhythm'].map(key=>mix.querySelector('.mix-'+key).valueAsNumber/100);
  const kept=grid.locked.size;
  grid.deleted.clear();
  clearRanking();
  grid.mixed=true;grid.ver++;
  updateGridArt();
  fitGrid();
  mixStatus.textContent='Generated '+(grid.columns*grid.rows-1-kept)+' variations. Kept '+kept+' locked variations and the original.';
 };
 let gridArt=null;
 function colorVariation(cell,locked){
  cell.style.setProperty('--variation-stroke',locked?'#e020ff':'');
  cell.style.setProperty('--variation-outline-stroke',locked?'#e020ff':'');
  cell.style.setProperty('--variation-fill',locked?'#e020ff28':'');
 }
 function updateGridArt(restoreLayouts=false){
  const {columns,rows,cell,left,top,seed,placed,mixed}=grid;
  const svg=tag=>document.createElementNS(ns,tag);
  const art=svg('g'),defs=svg('defs');art.append(defs);
  const lines=svg('path'),segments=[];
  for(let x=0;x<=columns;x++)segments.push('M'+(left+x*cell)+','+top+'v'+(-rows*cell));
  for(let y=0;y<=rows;y++)segments.push('M'+left+','+(top-y*cell)+'h'+(columns*cell));
  lines.setAttribute('d',segments.join(' '));lines.setAttribute('stroke','#21e0ed55');lines.setAttribute('fill','none');lines.setAttribute('vector-effect','non-scaling-stroke');art.append(lines);
  if(placed){
   const parts=seed.parts.map(({paths,center,program,radius},i)=>{
    const id=workspaceStage+'-iteration-grid-part-'+i,shape=svg('path');
    shape.id=id;shape.setAttribute('d',paths.map(({points,closed})=>'M'+points.map(([x,y])=>[x-seed.center.x,y-seed.center.y].join(',')).join(' L')+(closed?' Z':'')).join(' '));
    shape.setAttribute('stroke','var(--variation-stroke, '+cyan+')');shape.setAttribute('stroke-width','1');shape.setAttribute('vector-effect','non-scaling-stroke');
    shape.setAttribute('fill',program&&paths.every(p=>p.closed)?'var(--variation-fill, #21e0ed28)':'none');shape.setAttribute('fill-rule','evenodd');defs.append(shape);
    return {id,center,program,radius,anchored:seed.parts[i].anchored,label:program?labelSpace(paths):null};
   });
   const anchorPart=parts.find(part=>part.anchored);
   const total=mixed?rows*columns:1;
   for(let index=1;index<total;index++){
    if(grid.deleted.has(index))continue;
    const row=Math.floor(index/columns),column=index%columns;
    const cx=left+(column+.5)*cell,cy=top-(row+.5)*cell;
    const anchorX=anchorPart?anchorPart.center.x-seed.center.x:0,anchorY=anchorPart?anchorPart.center.y-seed.center.y:0,originX=cx+anchorX,originY=cy+anchorY;
    const strength=(row+column)/Math.max(1,rows+columns-2);
    const order=parts.map((_,i)=>i);
    for(let i=order.length-1;i>0;i--){
     const j=Math.floor(Math.random()*(i+1));
     [order[i],order[j]]=[order[j],order[i]];
    }
    if(order.length>1&&order.every((slot,i)=>slot===i))order.push(order.shift());
    const group=svg('g');group.dataset.cell=index;art.append(group);
    colorVariation(group,grid.locked.has(index));
    const [overlap,centrality,rhythm]=grid.settings;
    const phase=Math.random()*Math.PI*2,mode=(row+2*column)%4;
    const spread=mode===0?.68:mode===1?1.18:1;
    const rotations=parts.map(()=> (Math.random()<.5?-1:1)*(35+Math.random()*145));

    const layout=(restoreLayouts||grid.locked.has(index))?grid.layouts.get(index)||[]:[];
    const quarterTurn=(index+Math.floor(Math.random()*4))%4;
    const rearrange=strength>.25&&index%3!==0;
    const turn=quarterTurn*Math.PI/2;
    const cosTurn=Math.cos(turn),sinTurn=Math.sin(turn);
    for(const [i,{id,center,program,radius,label:space,anchored}] of parts.entries()){
     const slot=parts[order[i]].center,ox=center.x-seed.center.x,oy=center.y-seed.center.y;
     const limit=Math.max(0,cell/2-radius-cell*.025);
     const relativeX=ox-anchorX,relativeY=oy-anchorY;
     const blend=(a,b)=>a+(b*spread*(1.45-.9*overlap)-a)*strength;
     const drift=cell*.36*strength**1.2*(1.4-centrality);
     const direction=phase+i*2*Math.PI/parts.length;
     const reach=.28+rhythm*(i%2===0?.72:-.20);
     const offset=cell*.12*strength*(1-centrality);
     const freeX=blend(relativeX,slot.x-seed.center.x-anchorX)+Math.cos(direction)*drift*reach+Math.cos(phase)*offset;
     const axialX=relativeX*.22+Math.cos(direction)*drift*reach*.15;
     const nextX=originX+T.MathUtils.clamp(T.MathUtils.lerp(freeX,axialX,centrality),-limit,limit);
     const freeY=blend(relativeY,slot.y-seed.center.y-anchorY)+Math.sin(direction)*drift*reach+Math.sin(phase)*offset;
     const axialY=relativeY*.78+Math.sin(direction)*drift*reach*.25;
     const nextY=originY+T.MathUtils.clamp(T.MathUtils.lerp(freeY,axialY,centrality),-limit,limit);
     const nextAngle=(rotations[i]*(.35+.65*rhythm))*strength**1.25*(1-.8*centrality);
     const [compactX,compactY]=(rearrange?grid.packed:grid.compact)[i];
     const looseX=compactX*(rearrange?(row%2?-.9:.9):1);
     const looseY=compactY*(rearrange?(column%2?-.9:.9):1);
     const looseAngle=(quarterTurn===3?-1:quarterTurn)*90+(rearrange?rotations[i]*strength*.85:0);
     const overlapBlend=overlap*.72;
     const xMix=T.MathUtils.clamp(T.MathUtils.lerp(originX+cosTurn*(looseX-anchorX)-sinTurn*(looseY-anchorY),nextX,overlapBlend),cx-limit,cx+limit);
     const yMix=T.MathUtils.clamp(T.MathUtils.lerp(originY+sinTurn*(looseX-anchorX)+cosTurn*(looseY-anchorY),nextY,overlapBlend),cy-limit,cy+limit);
     if(anchored&&((!restoreLayouts&&!grid.locked.has(index))||!layout[i]))layout[i]=[cx+ox,cy+oy,0,1];
     const [x,y,angle,scale=1]=layout[i]??(layout[i]=[xMix,yMix,T.MathUtils.lerp(looseAngle,nextAngle,overlapBlend)]);
     const use=svg('use');use.setAttribute('href','#'+id);use.dataset.variationPiece='';
     use.setAttribute('transform','translate('+x+','+y+') rotate('+angle+') scale('+scale+') translate('+(-ox)+','+(-oy)+')');
     use.dataset.anchoredPiece=String(Boolean(anchored));
     if(anchored){use.style.setProperty('--variation-stroke',anchorCyan);use.style.setProperty('--variation-fill','#37ffff66');use.style.strokeWidth='2.5';}
     const selected=isolated===index&&selectedPiece?.index===index&&selectedPiece.part===i;
     if(selected){
      use.style.setProperty('--variation-stroke','#dc24f4');
      use.style.setProperty('--variation-fill','#dc24f450');
      use.style.strokeWidth='2.5';
     }
     use.dataset.selectedPiece=String(selected);
     group.append(use);
     if(space){
      const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
      const dx=(space.x-center.x)*scale,dy=(space.y-center.y)*scale;
      const label=fittedTitle(program,space.radius*scale,cell*.035);label.dataset.programLabel='true';label.dataset.anchorLabel=String(Boolean(anchored));
      if(anchored)label.style.fill=anchorCyan;
      if(selected)label.style.fill='#dc24f4';
      label.setAttribute('transform','translate('+(x+c*dx-s*dy)+','+(y+s*dx+c*dy)+') scale(1,-1)');
      group.append(label);
     }
    }
    grid.layouts.set(index,layout);
    if(isolated===index){
     for(const [i,{id,center}] of parts.entries()){
      const [x,y,angle,scale=1]=layout[i],ox=center.x-seed.center.x,oy=center.y-seed.center.y;
      const hitGroup=svg('g');
      hitGroup.setAttribute('transform','translate('+x+','+y+') rotate('+angle+') scale('+scale+') translate('+(-ox)+','+(-oy)+')');
      pieceHits(hitGroup,defs.querySelector('#'+id).getAttribute('d'),index,i);
      group.append(hitGroup);
     }
    }
   }
  }
  gridArt=art;visualKey='';
 }

 function redraw(showGrid){
  const meshes=iterationMeshes().filter(allowsMesh),selectedSet=new Set(selected()),camera=e.camera,w=viewport.clientWidth,h=viewport.clientHeight;
  for(const mesh of meshes)mesh.updateWorldMatrix(true,false);
  const key=JSON.stringify([e.scene.userData.spacesDisplay,pieceMode,editMode,selectedPiece,w,h,camera.projectionMatrix.elements,camera.matrixWorld.elements,showGrid?grid?.ver:null,isolated,chosenSaveCell,boundaryVisible,siteBoundary,meshes.map(m=>[m.uuid,m.geometry.uuid,m.userData.program,m.userData.iterationAnchor,m.matrixWorld.elements,selectedSet.has(m)])]);
  if(key===visualKey)return;
  visualKey=key;overlay.replaceChildren();projectedRegions=[];
  if(!w||!h)return;
  overlay.setAttribute('viewBox','0 0 '+w+' '+h);
  const v=new T.Vector3();
  const point=(x,y,matrix)=>{v.set(x,y,0);if(matrix)v.applyMatrix4(matrix);v.project(camera);return [(v.x+1)*w/2,(1-v.y)*h/2];};
  const path=(d,stroke,width,fill='none')=>{
   const el=document.createElementNS(ns,'path');
   el.setAttribute('d',d);el.setAttribute('stroke',stroke);el.setAttribute('stroke-width',width);el.setAttribute('stroke-linejoin','round');
   el.setAttribute('fill',fill);el.setAttribute('fill-rule','evenodd');overlay.append(el);
  };
  const command=coords=>'M'+coords.map(p=>p.join(',')).join(' L');
  if(showGrid&&gridArt){
   const [x,y]=point(0,0),[rx,ry]=point(1,0),[ux,uy]=point(0,1);
   gridArt.setAttribute('transform','matrix('+(rx-x)+' '+(ry-y)+' '+(ux-x)+' '+(uy-y)+' '+x+' '+y+')');
   for(const cell of gridArt.querySelectorAll('[data-cell]')){
    const index=Number(cell.dataset.cell);
    cell.style.display=isolated===null||index===isolated?'':'none';
    colorVariation(cell,grid.locked.has(index)||ranked.has(index));
    cell.style.opacity=isolated===null&&ranked.size&&!ranked.has(index)?'.25':'';
    for(const label of cell.querySelectorAll('[data-program-label]')){const d=e.scene.userData.spacesDisplay;label.style.display=(label.dataset.anchorLabel==='true'?d?.anchors:d?.programs)===false?'none':'';}
    const outline=cell.querySelector('[data-variation-outline]');
    const outlined=e.scene.userData.spacesDisplay?.outline!==false&&showOutlines&&(isolated===index||!ranked.size||ranked.has(index));
    if(outlined&&!outline)drawVariationOutline(index,cell);
    if(!outlined)outline?.remove();
    const dimPieces=Boolean(cell.querySelector('[data-variation-outline]'));
    for(const piece of cell.querySelectorAll('[data-variation-piece]')){const display=e.scene.userData.spacesDisplay;piece.style.display=(piece.dataset.anchoredPiece==='true'?display?.anchors:display?.programs)===false?'none':'';piece.style.opacity=(piece.dataset.selectedPiece==='true'||piece.dataset.anchoredPiece==='true')?'1':dimPieces?'0.28':'';}
   }
   gridArt.querySelector(':scope > path').style.display=isolated===null?'':'none';
   overlay.append(gridArt);
   if(boundaryVisible&&siteBoundary.length){
    const xs=siteBoundary.map(p=>p[0]),ys=siteBoundary.map(p=>p[1]),mx=(Math.max(...xs)+Math.min(...xs))/2,my=(Math.max(...ys)+Math.min(...ys))/2;
    const scale=grid.cell*.88/Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
    const indices=isolated===null?[0,...grid.layouts.keys()]:[isolated];
    for(const index of indices){if(grid.deleted.has(index))continue;const cx=grid.left+(index%grid.columns+.5)*grid.cell,cy=grid.top-(Math.floor(index/grid.columns)+.5)*grid.cell;
     path(command(siteBoundary.map(([x,y])=>point(cx+(x-mx)*scale,cy+(y-my)*scale)))+' Z','#70ffff88',1);overlay.lastElementChild.dataset.siteBoundary=String(index);
     for(const [label,dx,dy] of [['N',0,.45],['E',.45,0],['S',0,-.45],['W',-.45,0]]){const [x,y]=point(cx+grid.cell*dx,cy+grid.cell*dy),text=document.createElementNS(ns,'text');text.textContent=label;text.setAttribute('x',x);text.setAttribute('y',y);text.style.fontSize='10px';text.dataset.siteCompass=label;overlay.append(text);}
    }
   }

   if(chosenSaveCell!==null&&isolated===null&&workspaceStage==='spaces'&&!grid.deleted.has(chosenSaveCell)){const box=cellBounds(chosenSaveCell);path(command([point(box.min.x,box.min.y),point(box.max.x,box.min.y),point(box.max.x,box.max.y),point(box.min.x,box.max.y)])+' Z','#70ffff',3);overlay.lastElementChild.dataset.saveCellHighlight=String(chosenSaveCell);}
   if(isolated!==null){const box=cellBounds(isolated);path(command([point(box.min.x,box.min.y),point(box.max.x,box.min.y),point(box.max.x,box.max.y),point(box.min.x,box.max.y)])+' Z','#21e0ed55',1);}
  }
  for(const mesh of meshes){
   const focused=selectedSet.has(mesh),label=mesh.userData.program,anchored=Boolean(mesh.userData.iterationAnchor);
   const selectedOriginal=isolationActive&&isolated===0&&selectedPiece?.index===0&&grid.seed.meshes[selectedPiece.part]===mesh;
   if(!focused&&!label&&!anchored&&!(isolationActive&&isolated===0&&grid.seed.meshes.includes(mesh)))continue;
   const paths=pathsOf(mesh).map(({points,closed})=>({points:points.map(([x,y])=>point(x,y,mesh.matrixWorld)),closed}));
   if(label){
    const closed=paths.filter(p=>p.closed);
    if(closed.length){path(closed.map(p=>command(p.points)+' Z').join(' '),'none',0,selectedOriginal?'#dc24f450':anchored?'#37ffff66':'#21e0ed28');projectedRegions.push({mesh,paths:closed});}
    const space=labelSpace(closed);
    if(space){
     const text=fittedTitle(label,space.radius,12);
     if(anchored)text.style.fill=anchorCyan;
     if(selectedOriginal)text.style.fill='#dc24f4';
     text.setAttribute('x',space.x);text.setAttribute('y',space.y);
     overlay.append(text);
    }
   }
   if(anchored&&paths.length){path(paths.map(p=>command(p.points)+(p.closed?' Z':'')).join(' '),anchorCyan,2.5);overlay.lastElementChild.dataset.anchoredSource='true';}
   if(isolationActive&&isolated===0&&grid.seed.meshes.includes(mesh)){
    const part=grid.seed.meshes.indexOf(mesh);
    pieceHits(overlay,paths.map(p=>command(p.points)+(p.closed?' Z':'')).join(' '),0,part,mesh);
    if(selectedPiece?.index===0&&selectedPiece.part===part)path(paths.map(p=>command(p.points)+(p.closed?' Z':'')).join(' '),'#dc24f4',2.5);
   }
   if(focused&&paths.length)path(paths.map(p=>command(p.points)+(p.closed?' Z':'')).join(' '),anchored?anchorCyan:cyan,2.5);
  }
  if((workspaceStage!=='spaces'||editMode)&&isolationActive&&selectedPiece&&selectedPiece.index===isolated&&!grid.locked.has(isolated)){
   const {index,part}=selectedPiece,mesh=index===0?grid.seed.meshes[part]:null;
   const center=mesh?new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()):new T.Vector3(...grid.layouts.get(index)[part].slice(0,2),0);
   const [cx,cy]=point(center.x,center.y);
   const handle=(tag,attrs,mode)=>{
    const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);
    el.style.pointerEvents='all';el.style.cursor=mode==='rotate'?'grab':mode==='scale'?'nwse-resize':'move';
    el.addEventListener('pointerdown',event=>startPieceDrag(event,index,part,mesh,mode));
    el.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();});overlay.append(el);
   };
   if(pieceMode==='rotate')handle('circle',{cx,cy,r:62,fill:'none',stroke:'#dc24f4','stroke-width':7},'rotate');
   else if(pieceMode==='scale'){
    path('M'+cx+','+cy+' L'+(cx+65)+','+(cy-65),'#dc24f4',2);
    handle('rect',{x:cx+57,y:cy-73,width:16,height:16,fill:'#dc24f4',stroke:'#fff','stroke-width':1},'scale');
   }else{
    handle('path',{d:'M'+cx+','+cy+' L'+(cx+70)+','+cy+' M'+(cx+58)+','+(cy-8)+' L'+(cx+70)+','+cy+' L'+(cx+58)+','+(cy+8),fill:'none',stroke:'#ff5284','stroke-width':6},'translate-y');
    handle('path',{d:'M'+cx+','+cy+' L'+cx+','+(cy-70)+' M'+(cx-8)+','+(cy-58)+' L'+cx+','+(cy-70)+' L'+(cx+8)+','+(cy-58),fill:'none',stroke:'#21e0ed','stroke-width':6},'translate');
   }
  }

 }
 const mixInputs=[gridSize,cellSize,...mix.querySelectorAll('input[type=range]'),detail,curvature];
 const cornerState=source=>[...(grid?.layouts||[])].flatMap(([index,layout])=>{
  const points=source.get(layout);
  return points?.size?[[index,[...points]]]:[];
 });
 function saveKey(){
  return [grid?.ver,isolated,[...(grid?.locked||[])],[...(grid?.deleted||[])],[...ranked],cornerState(filletsByLayout),
   mixInputs.map(input=>input.value),titles.checked,showOutlines,showPoints,criteria.map(input=>input.checked),cornerState(restoredByLayout),continuityRows.map(row=>row.map(select=>select.value)),continuityChecks.map(input=>input.checked),anchorSelection,chosenSaveCell,orientationRows.map(r=>[r.enabled.checked,r.program.value,r.direction.value]),boundaryVisible];
 }
 function saveState(){
  const state={key:saveKey(),status:mixStatus.textContent,chosenSaveCell,orientation:{rules:orientationRows.map(r=>[r.enabled.checked,r.program.value,r.direction.value]),boundaryVisible,boundary:siteBoundary},anchorSelection:anchorSelection?{...anchorSelection}:null};
  if(grid){
   const {meshes,...seed}=grid.seed;
   state.grid={...grid,seed:{...seed,parts:seed.parts.map(part=>({...part})),meshIds:meshes.map(mesh=>mesh.studioId)},layouts:[...grid.layouts],locked:[...grid.locked],deleted:[...grid.deleted]};
  }
  return state;
 }
 function restoreState(state){
  if(!state?.key)return;
  chosenSaveCell=Number.isInteger(state.chosenSaveCell)?state.chosenSaveCell:null;pickingSaveCell=false;anchorSelection=state.anchorSelection||null;anchorOptionsKey='';
  grid=null;gridArt=null;isolated=null;clearRanking();
  const [,cell,, ,results,fillets,values,showTitles,outlines,points,checked,restored=[],continuity=[],continuityEnabled=[]]=state.key;
  mixInputs.forEach((input,i)=>{if(values[i]!=null)input.value=values[i];});
  criteria.forEach((input,i)=>{input.checked=Boolean(checked[i]);});
  titles.checked=showTitles;
  showOutlines=outlines;showPoints=points;
  outlineButton.setAttribute('aria-pressed',String(outlines));
  outlineButton.textContent=outlines?'Hide Outline':'Draw Outline';
  pointsButton.setAttribute('aria-pressed',String(points));
  pointsButton.textContent=points?'PointsOff':'PointsOn';
  if(state.grid){
   const {meshIds,...seed}=state.grid.seed;
   const meshes=meshIds.map(id=>e.pieces().find(mesh=>mesh.studioId===id)).filter(Boolean);
   if(meshes.length===meshIds.length){
    grid={...state.grid,seed:{...seed,meshes},layouts:new Map(state.grid.layouts),locked:new Set(state.grid.locked),deleted:new Set(state.grid.deleted)};
    meshes.forEach((mesh,i)=>mesh.userData.iterationAnchor=Boolean(seed.parts[i]?.anchored));
    isolated=cell;
    for(const index of results)if(grid.layouts.has(index))ranked.add(index);
    for(const [index,ids] of fillets){
     const layout=grid.layouts.get(index);
     if(layout)filletsByLayout.set(layout,new Set(ids));
    }
    for(const [index,ids] of restored){
     const layout=grid.layouts.get(index);
     if(layout)restoredByLayout.set(layout,new Set(ids));
    }
    keep.disabled=discard.disabled=!ranked.size;
    updateLockButton();updateGridArt(true);
   }
  }
  refreshPrograms(continuity);
  continuityChecks.forEach((input,i)=>{input.checked=continuityEnabled[i]??true;});
  updateLockButton();
  if(state.orientation){boundaryVisible=!!state.orientation.boundaryVisible;siteBoundary=state.orientation.boundary||[];for(const [i,row]of orientationRows.entries()){const rule=state.orientation.rules?.[i];if(rule){row.enabled.checked=!!rule[0];row.program.value=rule[1];row.direction.value=rule[2];}}if(orientationButton)orientationButton.setAttribute('aria-pressed',String(boundaryVisible));visualKey='';}
  if(state.status)setGridStatus(state.status);
 }
 function matrixCell(index,local=false){
  const bounds=cellBounds(index),center=bounds.getCenter(new T.Vector3());
  const label='Row '+(Math.floor(index/grid.columns)+1)+' · Column '+(index%grid.columns+1);
  const kinds={kind:'Pieces',color:grid.locked.has(index)?[.72,.05,.74]:undefined};
  const fromPoint=([x,y])=>local?[x-center.x,y-center.y]:[x,y];
  if(index===0){
   return grid.seed.meshes.filter(mesh=>e.pieces().includes(mesh)).flatMap(mesh=>{
    mesh.updateMatrixWorld(true);
    return pathsOf(mesh).map(({points,closed})=>({
     ...kinds,closed,name:mesh.userData.program||mesh.name,program:mesh.userData.program||'',anchored:Boolean(mesh.userData.iterationAnchor),
     points:points.map(([x,y])=>fromPoint(new T.Vector3(x,y,0).applyMatrix4(mesh.matrixWorld).toArray()))
    }));
   });
  }
  const layout=grid.layouts.get(index);
  if(!layout)return [];
  return grid.seed.parts.flatMap(({paths,center},i)=>{
   const [x,y,degrees,scale=1]=layout[i],radians=degrees*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
   const program=grid.seed.parts[i].program||'';
   return paths.map(({points,closed})=>({
    ...kinds,closed,program,name:program||label,anchored:Boolean(grid.seed.parts[i].anchored),
    points:points.map(([px,py])=>{
     const dx=(px-center.x)*scale,dy=(py-center.y)*scale;
     return fromPoint([x+c*dx-s*dy,y+s*dx+c*dy]);
    })
   }));
  });
 }
 function matrixCellOutline(index,local=false){
  if(!index||!showOutlines)return null;
  const group=document.createElementNS(ns,'g');
  drawVariationOutline(index,group);
  const path=group.querySelector('path');
  if(!path)return null;
  const length=path.getTotalLength();
  if(!(length>0))return null;
  const count=Math.max(24,Math.min(768,Math.ceil(length/grid.cell*90)));
  const center=local?cellBounds(index).getCenter(new T.Vector3()):new T.Vector3();
  const points=Array.from({length:count},(_,i)=>{
   const point=path.getPointAtLength(length*i/count);
   return [point.x-center.x,point.y-center.y];
  });
  return {kind:'Outline',closed:true,points,name:'Matrix outline',color:grid.locked.has(index)?[.72,.05,.74]:undefined};
 }
  function matrixCurves(){
  const bounds=gridBounds(),{min,max}=bounds,curves=[];
  for(let column=0;column<=grid.columns;column++){
   const x=min.x+column*grid.cell;curves.push({kind:'Grid',points:[[x,min.y],[x,max.y]]});
  }
  for(let row=0;row<=grid.rows;row++){
   const y=max.y-row*grid.cell;curves.push({kind:'Grid',points:[[min.x,y],[max.x,y]]});
  }
  curves.push(...matrixCell(0));
  for(const index of grid.layouts.keys()){
   curves.push(...matrixCell(index));
   const outline=matrixCellOutline(index);
   if(outline)curves.push(outline);
  }
  return {bounds,curves:curves.filter(curve=>curve.points.length>=2)};
 }
 function packCell(index){
  const outline=matrixCellOutline(index,true);
  const curves=matrixCell(index,true);
  if(outline)curves.push(outline);
  return curves.flatMap(({points,closed,program,name,anchored})=>{
   const segments=[];
   for(let i=1;i<points.length;i++)segments.push(...points[i-1],0,...points[i],0);
   if(closed&&points.length>2&&points[0].some((value,i)=>value!==points.at(-1)[i]))segments.push(...points.at(-1),0,...points[0],0);
   return segments.length?[{name,program,anchored,positions:new Float32Array(segments)}]:[];
  });
 }
 function saveMatrixSeed(){
  return grid.seed.meshes.filter(mesh=>e.pieces().includes(mesh)).map(mesh=>({
   name:mesh.name,program:mesh.userData.program,anchored:Boolean(mesh.userData.iterationAnchor),color:mesh.material.color.getHex(),
   positions:mesh.geometry.attributes.position.array.slice(),position:mesh.position.toArray(),
   rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray()
  }));
 }
 function insertMatrix(record){
  const state=structuredClone(record.state);
  const oldSeed=grid?.seed.meshes||[];
  e.checkpoint();
  const group=crypto.randomUUID();
  const matches=(a,b)=>a.length===b.length&&a.every((value,i)=>Math.abs(value-b[i])<1e-6);
  const meshes=record.members.map((member,index)=>{
   const existing=e.pieces().find(mesh=>mesh.studioId===state.grid.seed.meshIds[index]);
   if(existing&&matches(member.position,existing.position.toArray())&&matches(member.rotation,existing.quaternion.toArray())&&
    matches(member.scale,existing.scale.toArray())&&matches(member.positions,existing.geometry.attributes.position.array)&&
    existing.name===member.name&&existing.userData.program===member.program&&Boolean(existing.userData.iterationAnchor)===Boolean(member.anchored)&&existing.material.color.getHex()===member.color)return existing;
   const geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.BufferAttribute(member.positions.slice(),3));
   geometry.computeBoundingBox();
   const mesh=e.add({geometry,name:member.name,curve:true,offset:new T.Vector3().fromArray(member.position),stage:workspaceStage});
   geometry.dispose();
   mesh.quaternion.fromArray(member.rotation);mesh.scale.fromArray(member.scale);mesh.material.color.setHex(member.color);
   Object.assign(mesh.userData,{groupId:group,savedIterationId:record.id,matrixSeed:true,program:member.program,iterationAnchor:Boolean(member.anchored)});
   return mesh;
  });
  for(const mesh of oldSeed){
   if(meshes.includes(mesh)||!mesh.userData.matrixSeed||!e.canEdit(mesh)||!e.pieces().includes(mesh))continue;
   e.pieces().splice(e.pieces().indexOf(mesh),1);mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();
  }
  grid=null;gridArt=null;isolated=null;clearRanking();
  state.grid.seed.meshIds=meshes.map(mesh=>mesh.studioId);
  state.grid.ver=Date.now();
  restoreState(state);
  e.select([]);e.mark(meshes);
  e.fit(isolated===null?gridBounds():cellBounds(isolated),true);
 }
 savePanel.innerHTML='<div class="section iteration-editor"><h3>Matrix</h3><label>Matrix name <input class="matrix-name" type="text" maxlength="80"></label><button class="matrix-save" type="button">Save matrix</button><label>Saved matrices <select class="matrix-library"></select></label><button class="matrix-insert" type="button">Insert matrix</button><div class="button-pair"><button class="matrix-ai" type="button">Export Illustrator (.ai)</button><button class="matrix-rhino" type="button">Export Rhino (.3dm)</button></div><h3>Matrix iteration</h3><label>Grid cell <select class="matrix-cell"></select></label><label>Iteration name <input class="matrix-cell-name" type="text" maxlength="80"></label><button class="matrix-cell-save" type="button">Save matrix iteration</button><p class="hint" role="status"></p></div>';
 const byClass=selector=>savePanel.querySelector(selector);
 const matrixName=byClass('.matrix-name'),matrixLibrary=byClass('.matrix-library'),cellPicker=byClass('.matrix-cell');
 const matrixStatus=savePanel.querySelector('[role=status]');
 let selectCellButton,selectedCellStatus;
 if(workspaceStage==='spaces'){
  cellPicker.closest('label').hidden=true;
  selectCellButton=document.createElement('button');selectCellButton.type='button';selectCellButton.className='matrix-select-cell';selectCellButton.textContent='Select iteration';selectCellButton.setAttribute('aria-pressed','false');
  selectedCellStatus=document.createElement('p');selectedCellStatus.className='hint matrix-selected-cell';selectedCellStatus.setAttribute('role','status');selectedCellStatus.textContent='No iteration selected.';
  cellPicker.closest('label').after(selectCellButton,selectedCellStatus);
  selectCellButton.onclick=()=>{if(!grid||e.isBusy())return;pickingSaveCell=!pickingSaveCell;if(pickingSaveCell&&isolated!==null)fitGrid();selectCellButton.setAttribute('aria-pressed',String(pickingSaveCell));selectedCellStatus.textContent=pickingSaveCell?'Click a grid cell to choose the iteration to name and save.':'Selection cancelled.';viewport.style.cursor=pickingSaveCell?'crosshair':'';};
  viewport.addEventListener('pointerdown',event=>{if(pickingSaveCell&&isolationActive&&event.button===0){event.preventDefault();event.stopImmediatePropagation();}},true);
  viewport.addEventListener('click',event=>{
   if(!pickingSaveCell||!isolationActive||!grid||event.button!==0)return;
   event.preventDefault();event.stopImmediatePropagation();
   const point=pointerXY(event),row=Math.floor((grid.top-point.y)/grid.cell),column=Math.floor((point.x-grid.left)/grid.cell),index=row*grid.columns+column;
   if(row<0||column<0||row>=grid.rows||column>=grid.columns||grid.deleted.has(index)||(index!==0&&!grid.layouts.has(index))){selectedCellStatus.textContent='Choose a cell containing an iteration.';return;}
   chosenSaveCell=index;cellPicker.value=String(index);pickingSaveCell=false;viewport.style.cursor='';selectCellButton.setAttribute('aria-pressed','false');selectedCellStatus.textContent='Selected row '+(row+1)+', column '+(column+1)+'.';visualKey='';byClass('.matrix-cell-name').focus();
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&pickingSaveCell){pickingSaveCell=false;viewport.style.cursor='';selectCellButton.setAttribute('aria-pressed','false');selectedCellStatus.textContent='Selection cancelled.';}},true);
 }

 const savedCellsPanel=document.createElement('section');savedCellsPanel.className='saved-matrix-cell-library';
 savedCellsPanel.innerHTML='<h3>Insert saved matrix iteration</h3><label>Saved matrix iteration <select class="saved-matrix-cell-picker"></select></label><button class="saved-matrix-cell-insert" type="button">Insert saved iteration</button>';
 byClass('.matrix-cell-save').after(savedCellsPanel);
 const savedCellPicker=savedCellsPanel.querySelector('select');let savedCells=[];
 async function refreshSavedCells(preferred=savedCellPicker.value){
  savedCells=(await store.list()).filter(item=>item.kind==='matrix-cell').sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
  savedCellPicker.replaceChildren(...savedCells.map(item=>new Option(item.name,item.id)));if(savedCells.some(item=>item.id===preferred))savedCellPicker.value=preferred;
  if(!savedCells.length)savedCellPicker.add(new Option('No saved matrix iterations',''));
 }
 installSavedPicker(savedCellPicker,{insertButton:savedCellsPanel.querySelector('button'),status:matrixStatus,isBusy:e.isBusy,
  onInsert:ids=>{
   const before=new Set(e.pieces());isolated=null;selectedPiece=null;
   for(const id of ids){const item=savedCells.find(item=>item.id===id);if(!item)continue;
    insertSaved({...item,members:item.members.map(member=>({...member,position:member.position||[0,0,0],rotation:member.rotation||[0,0,0,1],scale:member.scale||[1,1,1],color:member.color??0x21e0ed}))},true);
   }
   const added=e.pieces().filter(mesh=>!before.has(mesh));e.select(added);e.mark(added);e.fit();visualKey='';matrixStatus.textContent='Inserted '+ids.length+' saved matrix iterations.';
  },
  onDelete:async ids=>{for(const id of ids)await store.remove(id);await refreshSavedCells();matrixStatus.textContent='Deleted '+ids.length+' saved matrix iterations.';}
 });

 let matrices=[],savePanelOpen=false,savePanelKey='',fileBusy=false;
 async function refreshMatrices(preferred=matrixLibrary.value){
  matrices=(await store.list()).filter(item=>item.kind==='matrix').sort((a,b)=>b.savedAt-a.savedAt);
  matrixLibrary.replaceChildren(...matrices.map(item=>new Option(item.name,item.id)));
  if(matrices.some(item=>item.id===preferred))matrixLibrary.value=preferred;
  if(!matrices.length)matrixLibrary.add(new Option('No saved matrices',''));
  byClass('.matrix-insert').disabled=!matrixLibrary.value;
 }
 function reportMatrix(error){matrixStatus.textContent=error.message||String(error);}
 byClass('.matrix-save').onclick=async()=>{
  if(fileBusy||e.isBusy()||!grid)return;
  const name=matrixName.value.trim();
  if(!name){matrixName.focus();return reportMatrix('Enter a matrix name.');}
  const members=saveMatrixSeed();
  if(!members.length)return reportMatrix('Insert a source iteration before saving this matrix.');
  fileBusy=true;
  try{
   const id=crypto.randomUUID();
   await store.add({id,kind:'matrix',name,members,state:saveState(),savedAt:Date.now()});
   await refreshMatrices(id);
   matrixStatus.textContent='Saved '+name+'.';
  }catch(error){reportMatrix(error);}finally{fileBusy=false;}
 };
 byClass('.matrix-insert').onclick=()=>{
  const record=matrices.find(item=>item.id===matrixLibrary.value);
  if(!record||fileBusy||e.isBusy())return;
  try{insertMatrix(record);matrixName.value=record.name;matrixStatus.textContent='Inserted '+record.name+'.';}catch(error){reportMatrix(error);}
 };

 function insertMatrixBatch(ids){
  if(ids.length===1){const record=matrices.find(item=>item.id===ids[0]);if(record)insertMatrix(record);return;}
  if(fileBusy||e.isBusy())return;
  const selected=ids.map(id=>matrices.find(item=>item.id===id)).filter(Boolean),added=[];
  e.checkpoint();let right=grid?grid.left+grid.columns*grid.cell:0;
  for(const record of selected){
   const saved=record.state?.grid;if(!saved?.seed?.parts)continue;
   const dx=right+saved.cell-saved.left,dy=(grid?.top??saved.top)-saved.top,layouts=new Map(saved.layouts),deleted=new Set(saved.deleted);
   let first=true;
   for(let index=0;index<saved.rows*saved.columns;index++){
    if(deleted.has(index)||index&&!layouts.has(index))continue;
    const group=crypto.randomUUID();
    saved.seed.parts.forEach((part,i)=>{
     const row=index?layouts.get(index)[i]:[saved.left+saved.cell/2+part.center.x-saved.seed.center.x,saved.top-saved.cell/2+part.center.y-saved.seed.center.y,0,1];
     if(!row)return;const [x,y,degrees,scale=1]=row,angle=degrees*Math.PI/180,c=Math.cos(angle),sn=Math.sin(angle),positions=[];
     for(const path of part.paths){const points=path.points.map(([px,py])=>{const ox=(px-part.center.x)*scale,oy=(py-part.center.y)*scale;return [x+dx+c*ox-sn*oy,y+dy+sn*ox+c*oy,0];});for(let j=1;j<points.length;j++)positions.push(...points[j-1],...points[j]);}
     if(!positions.length)return;const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeBoundingBox();
     const mesh=e.add({geometry,name:record.name+' · '+(part.program||'piece '+(i+1)),curve:true,offset:new T.Vector3(),stage:workspaceStage});geometry.dispose();
     Object.assign(mesh.userData,{groupId:group,savedIterationId:record.id,matrixBatch:true,program:part.program||''});
     if(first){mesh.userData.savedMatrixState=structuredClone(record.state);first=false;}added.push(mesh);
    });
   }
   right+=saved.cell*(saved.columns+1);
  }
  isolated=null;selectedPiece=null;visualKey='';e.select(added);e.mark(added);e.fit();matrixStatus.textContent='Inserted '+selected.length+' saved matrices side by side. Each retains its saved matrix settings.';
 }
 const matrixSelection=installSavedPicker(matrixLibrary,{insertButton:byClass('.matrix-insert'),status:matrixStatus,isBusy:()=>fileBusy||e.isBusy(),onInsert:insertMatrixBatch,
  onDelete:async ids=>{for(const id of ids)await store.remove(id);await refreshMatrices();matrixStatus.textContent='Deleted '+ids.length+' saved matrices.';}
 });
 byClass('.matrix-cell-save').onclick=async()=>{
  if(fileBusy||e.isBusy()||!grid||cellPicker.value===''||(workspaceStage==='spaces'&&(chosenSaveCell===null||grid.deleted.has(chosenSaveCell))))return;
  const input=byClass('.matrix-cell-name'),name=input.value.trim();
  if(!name){input.focus();return reportMatrix('Enter an iteration name.');}
  const members=packCell(workspaceStage==='spaces'?chosenSaveCell:Number(cellPicker.value));
  if(!members.length)return reportMatrix('Choose a cell that contains an iteration.');
  fileBusy=true;
  try{
   await store.add({id:crypto.randomUUID(),kind:'matrix-cell',name,members,savedAt:Date.now()});
   await refreshSavedCells();input.value='';matrixStatus.textContent='Saved '+name+' to Floor plates.';
  }catch(error){reportMatrix(error);}finally{fileBusy=false;}
 };
 for(const [selector,extension] of [['.matrix-ai','ai'],['.matrix-rhino','3dm']]){
  byClass(selector).onclick=async()=>{
   if(fileBusy||e.isBusy()||!grid)return;
   fileBusy=true;
   try{
    const {curves,bounds}=matrixCurves();
    const filename=(matrixName.value.trim()||'popmarkit-matrix').replace(/[<>:"/\\|?*]/g,'-')+'.'+extension;
    if(extension==='ai')downloadMatrix(illustratorMatrix(curves,bounds),filename,'application/pdf');
    else downloadMatrix(await rhinoMatrix(curves),filename,'application/octet-stream');
    matrixStatus.textContent='Exported '+filename+'.';
   }catch(error){reportMatrix(error);}finally{fileBusy=false;}
  };
 }
 function updateSavePanel(){
  const open=!savePanel.hidden;
  if(open&&!savePanelOpen)Promise.all([refreshMatrices(),refreshSavedCells()]).catch(reportMatrix);
  savePanelOpen=open;
  if(!open)return;
  const ids=grid?[0,...grid.layouts.keys()]:[];
  const key=ids.join(',')+'|'+isolated+'|'+(grid?.columns||0);
  if(key!==savePanelKey){
   savePanelKey=key;
   const previous=cellPicker.value;
   cellPicker.replaceChildren(...ids.map(index=>new Option(index===0?'Row 1 · Column 1 (original)':'Row '+(Math.floor(index/grid.columns)+1)+' · Column '+(index%grid.columns+1),String(index))));
   if(!ids.length)cellPicker.add(new Option('Create a grid first',''));
   else if(isolated!==null&&ids.includes(isolated))cellPicker.value=String(isolated);
   else if(ids.includes(Number(previous)))cellPicker.value=previous||'0';
  }
  for(const selector of ['.matrix-save','.matrix-ai','.matrix-rhino','.matrix-cell-save'])byClass(selector).disabled=fileBusy||!grid;
  if(selectCellButton){selectCellButton.disabled=fileBusy||!grid;byClass('.matrix-cell-save').disabled=fileBusy||!grid||chosenSaveCell===null||grid.deleted.has(chosenSaveCell);if(chosenSaveCell!==null&&!pickingSaveCell)selectedCellStatus.textContent='Selected row '+(Math.floor(chosenSaveCell/(grid?.columns||1))+1)+', column '+(chosenSaveCell%(grid?.columns||1)+1)+'.';}
  matrixSelection.update();
 }

 function refreshOrientationPrograms(names){for(const row of orientationRows){if(row.key===names.join('|'))continue;row.key=names.join('|');const previous=row.program.value;row.program.replaceChildren(new Option('Choose program',''),...names.map(name=>new Option(name,name)));if(names.includes(previous))row.program.value=previous;}}
 function mountOrientation(parent){
  orientationButton=document.createElement('button');orientationButton.type='button';orientationButton.className='orientation-boundary';orientationButton.textContent='Site boundary';orientationButton.setAttribute('aria-pressed',String(boundaryVisible));parent.append(orientationButton);
  const heading=document.createElement('h3');heading.textContent='ORIENTATION';parent.append(heading);
  const note=document.createElement('p');note.className='hint';note.textContent='N: north end · E: bay · S: highway · W: streets';parent.append(note);
  for(let i=0;i<4;i++){const row=document.createElement('div');row.className='orientation-row';row.innerHTML='<input type="checkbox" aria-label="Enable orientation rule '+(i+1)+'"><select aria-label="Orientation program '+(i+1)+'"></select><span>on the</span><select aria-label="Cardinal direction '+(i+1)+'"></select><span>side</span>';const [enabled,program,direction]=row.querySelectorAll('input,select');for(const name of ['N','E','S','W','NW','NE','SE','SW'])direction.add(new Option(name,name));orientationRows.push({enabled,program,direction});for(const input of [enabled,program,direction])input.onchange=clearRanking;parent.append(row);}
  const run=document.createElement('button');run.type='button';run.className='orientation-select';run.textContent='Select orientations';parent.append(run);
  orientationButton.onclick=async()=>{try{if(!siteBoundary.length){orientationButton.disabled=true;const response=await fetch(new URL('./site-context.json',import.meta.url));if(!response.ok)throw Error('Site boundary unavailable');const data=await response.json();siteBoundary=data.boundary;}boundaryVisible=!boundaryVisible;orientationButton.setAttribute('aria-pressed',String(boundaryVisible));visualKey='';}catch(error){setGridStatus(error.message);}finally{orientationButton.disabled=false;}};
  run.onclick=()=>{if(!grid?.mixed)return setGridStatus('Run MIX to generate variations first.');const rules=orientationRows.filter(r=>r.enabled.checked);if(!rules.length||rules.some(r=>!r.program.value))return setGridStatus('Choose a program for each checked orientation rule.');fitGrid();let reviewed=0;const angles={E:0,NE:Math.PI/4,N:Math.PI/2,NW:3*Math.PI/4,W:Math.PI,SW:-3*Math.PI/4,S:-Math.PI/2,SE:-Math.PI/4};
   for(const [index,layout]of grid.layouts){if(grid.deleted.has(index)||grid.locked.has(index))continue;reviewed++;const cx=grid.left+(index%grid.columns+.5)*grid.cell,cy=grid.top-(Math.floor(index/grid.columns)+.5)*grid.cell;
    if(rules.every(rule=>{const points=layout.filter((_,i)=>grid.seed.parts[i].program===rule.program.value);if(!points.length)return false;const dx=points.reduce((sum,p)=>sum+p[0],0)/points.length-cx,dy=points.reduce((sum,p)=>sum+p[1],0)/points.length-cy;if(Math.hypot(dx,dy)<grid.cell*.005)return false;const delta=Math.atan2(Math.sin(Math.atan2(dy,dx)-angles[rule.direction.value]),Math.cos(Math.atan2(dy,dx)-angles[rule.direction.value]));return Math.abs(delta)<=Math.PI/8+1e-8;}))ranked.add(index);
   }keep.disabled=discard.disabled=!ranked.size;visualKey='';setGridStatus('Selected '+ranked.size+' of '+reviewed+' variations satisfying the checked orientations.');};
  refreshOrientationPrograms([...new Set((grid?.seed.parts||[]).map(p=>p.program).filter(Boolean))].sort());
 }
   return {mountOrientation,chosenMembers:()=>grid&&chosenSaveCell!==null&&!grid.deleted.has(chosenSaveCell)?packCell(chosenSaveCell):[],resetGrid(){grid=null;gridArt=null;isolated=null;selectedPiece=null;chosenSaveCell=null;visualKey='';},operateAnchors(action,amount){if(!grid?.mixed){setGridStatus('Create a grid and run MIX first.');return;}e.checkpoint();let count=0;for(const [index,layout]of grid.layouts){if(grid.deleted.has(index)||grid.locked.has(index))continue;for(const [i,part]of layout.entries()){if(!grid.seed.parts[i].anchored)continue;if(action==='offset'){part[0]+=(Math.random()*2-1)*grid.cell*.15*amount;part[1]+=(Math.random()*2-1)*grid.cell*.15*amount;}if(action==='rotate')part[2]+=(Math.random()*2-1)*45*amount;if(action==='scale')part[3]=(part[3]??1)*(1+(Math.random()*2-1)*.3*amount);count++;}}grid.ver++;updateGridArt(true);setGridStatus('Applied '+action+' to '+count+' anchored spaces only.');},insertIterations:ids=>insertIterations(ids,false),allowsMesh,inWorkspace,fitGrid,saveKey,saveState,restoreState,
  update(active,showMix){
   if(!active||!showMix)editMode=false;
   if((!active||!showMix)&&pickingSaveCell){pickingSaveCell=false;viewport.style.cursor='';selectCellButton?.setAttribute('aria-pressed','false');}
   const curvesOpen=active&&!showMix;
   positionInputSection(curvesOpen);
   if(curvesOpen&&!curvesWasOpen)refreshSaved();curvesWasOpen=curvesOpen;
   refreshAnchorSpaces();
   refreshPrograms();
   continuityButton.disabled=!grid?.mixed||!programPairs().length||!validPairs();
   updateSavePanel();
   const wasMix=isolationActive;
   isolationActive=active&&showMix;
   updatePieceControls();
   manualDelete.disabled=!grid||!isolated||grid.locked.has(isolated)||e.isBusy();
   lockAll.disabled=!grid?.layouts.size||grid.locked.size===grid.layouts.size;
   unlockAll.disabled=!grid?.locked.size;
   overlay.classList.toggle('hide-program-titles',e.scene.userData.spacesDisplay?.text===false||(isolationActive&&!titles.checked));
   if(active&&wasMix!==isolationActive){
    const scoped=e.selection().filter(inWorkspace);
    if(scoped.length!==e.selection().length)e.select(scoped);
   }
   showGridButton.disabled=ranking.querySelector('button').disabled=!grid;
   if(showMix&&!mixWasOpen)refreshSaved();
   mixWasOpen=showMix;
   overlay.style.display=active?'':'none';controls.hidden=!active;
   if(!active){visualKey='';projectedRegions=[];return;}
   const meshes=selected(),next=meshes.length===1?meshes[0]:null;
   const key=JSON.stringify([next?.uuid,next?.geometry.uuid,next?.scale.x,next?.scale.y,next?.userData.program,next?.userData.floorLevel]);
   if(key!==selectionKey){selectionKey=key;activeMesh=next;program.value=next?.userData.program||'';floor.value=String(next?.userData.floorLevel||1);updateArea();}
   program.disabled=floor.disabled=!next;
   program.classList.toggle('selected-curve',!!next);
   save.disabled=saving||!meshes.length;
   redraw(showMix);
  },
  pick(clientX,clientY){
   if(!inIterations())return null;
   const r=viewport.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;
   for(const {mesh,paths} of projectedRegions.slice().reverse()){
    if(!e.canEdit(mesh))continue;
    let inside=false;
    for(const {points} of paths)for(let i=1;i<points.length;i++){
     const [ax,ay]=points[i-1],[bx,by]=points[i];
     if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }
    if(inside)return mesh;
   }
   return null;
  }
 };
}

