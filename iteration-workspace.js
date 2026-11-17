import * as T from './three.js';
import {traceMask,simplifyContour} from './composition-outline.js';

const foot=304.8,cyan='#21e0ed',ns='http://www.w3.org/2000/svg';
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
export function installIterationWorkspace(e,curves,mix,ranking,store){
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
 titles.onchange=()=>overlay.classList.toggle('hide-program-titles',isolationActive&&!titles.checked);
 let activeMesh=null,selectionKey='',visualKey='',grid=null,saving=false,opening=false,projectedRegions=[];
 const iterationMeshes=()=>e.pieces().filter(m=>m.isLine&&m.visible&&m.userData.workspaceStage==='iterations');
 const selected=()=>e.selection().filter(m=>m.isLine&&m.visible&&m.userData.workspaceStage==='iterations'&&e.canEdit(m));
 const inIterations=()=>e.workflow().active==='iterations';
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
    name:mesh.name,positions:mesh.geometry.attributes.position.array.slice(),position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),color:mesh.material.color.getHex(),program:mesh.userData.program||'',floorLevel:mesh.userData.floorLevel||1,area:curveArea(pathsOf(mesh),mesh.scale.x,mesh.scale.y)
   }));
   const id=crypto.randomUUID();await store.add({id,name:label,members,savedAt:Date.now()});
   name.value='';status.textContent='Saved '+label+' · '+members.length+' '+(members.length===1?'curve.':'curves.');
   await refreshSaved(id);
  }catch(error){status.textContent='Could not save the iteration. '+error.message;}
  finally{saving=false;save.disabled=!selected().length;}
 };
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
   saved=(await store.list()).filter(item=>Array.isArray(item.members)).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
   picker.replaceChildren();
   for(const item of saved)picker.add(new Option(item.name,item.id));
   if(saved.some(item=>item.id===preferred))picker.value=preferred;
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
 insert.onclick=()=>{
  const item=saved.find(record=>record.id===picker.value);
  if(!item||opening||e.isBusy()||!inIterations())return;
  opening=true;
  try{
   const group=crypto.randomUUID();e.checkpoint();
   const meshes=item.members.map(member=>{
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(member.positions.slice(),3));geometry.computeBoundingBox();
    const mesh=e.add({geometry,name:member.name,curve:true,offset:new T.Vector3().fromArray(member.position),stage:'iterations'});
    geometry.dispose();
    mesh.quaternion.fromArray(member.rotation);mesh.scale.fromArray(member.scale);mesh.material.color.setHex(member.color);
    Object.assign(mesh.userData,{groupId:group,savedIterationId:item.id,program:member.program,floorLevel:member.floorLevel});
    return mesh;
   });
   e.select(meshes);e.mark(meshes);e.fit();mixStatus.textContent='Inserted '+item.name+'.';
  }finally{opening=false;}
 };

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
 let isolated=null,isolationActive=false;
 const lockButton=mix.querySelector('.lock-variation');
 const showGridButton=mix.querySelector('.show-grid');
 ranking.innerHTML='<div class="section iteration-editor"><h3>Ranking</h3><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Separation"> Separation</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Overlapping"> Overlapping</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Continuity"> Continuity</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Rhythm"> Rhythm</label><label class="ranking-option"><input type="checkbox" name="ranking-criterion" value="Centrality"> Centrality</label><button class="rank-select" type="button">Select</button><div class="button-pair"><button class="rank-keep" type="button" disabled>KEEP</button><button class="rank-delete" type="button" disabled>DELETE</button></div><div class="button-pair"><button class="rank-lock-all" type="button" disabled>Lock all</button><button class="rank-unlock-all" type="button" disabled>Unlock all</button></div><button class="rank-outline" type="button" aria-pressed="false">Draw Outline</button><button class="rank-points" type="button" aria-pressed="false">PointsOn</button><label>Outline detail <input class="rank-detail" type="range" min="0" max="100" value="100"></label><label>Curvature <input class="rank-curvature" type="range" min="0" max="100" value="50"></label><p class="hint">With PointsOn, double-click a corner to fillet it or an edge to restore a hidden point.</p><button class="rank-show-grid" type="button">Return to full grid</button><p class="hint" role="status"></p></div>';
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
  const point=new T.Vector3((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2,0).unproject(e.camera);
  const row=Math.floor((grid.top-point.y)/grid.cell),column=Math.floor((point.x-grid.left)/grid.cell);
  if(row<0||column<0||row>=grid.rows||column>=grid.columns)return;
  const index=row*grid.columns+column;
  if(grid.deleted.has(index))return;
  if(index&&!grid.mixed){setGridStatus('Click MIX to generate that cell first.');return;}
  event.preventDefault();
  isolateCell(index);
 });
 function updateLockButton(){
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

  isolated=index;refreshOutlines();updateLockButton();
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
  const point=new T.Vector3((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2,0).unproject(e.camera);
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
   const [x,y,degrees]=layout[i];
   const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
   return paths.map(({points,closed})=>({closed,points:points.map(([px,py])=>{
    const dx=px-center.x,dy=py-center.y;
    return [x+c*dx-s*dy,y+s*dx+c*dy];
   })}));
  }).flat();
  const vertices=parts.map(path=>path.points);
  const bounds=new T.Box3();
  for(const points of vertices)for(const [x,y] of points)bounds.expandByPoint(new T.Vector3(x,y,0));
  const size=bounds.getSize(new T.Vector3()),span=Math.max(size.x,size.y);
  if(!(span>0))return [];
  const scale=192/span,pad=8;
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(size.x*scale)+pad*2;canvas.height=Math.ceil(size.y*scale)+pad*2;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.fillStyle=context.strokeStyle='#fff';
  context.lineJoin=context.lineCap='round';
  const draw=(points,closed)=>{
   context.beginPath();
   points.forEach(([x,y],i)=>context[i?'lineTo':'moveTo']((x-bounds.min.x)*scale+pad,(bounds.max.y-y)*scale+pad));
   if(closed){context.closePath();context.fill();}
   context.stroke();
  };
  context.lineWidth=2.5;
  for(const {points,closed} of parts)draw(points,closed);
  // Join neighboring outlines with short rounded connections, leaving wider recesses visible.
  const samples=vertices.map(points=>points.filter((_,i)=>i%Math.max(1,Math.ceil(points.length/64))===0));
  const linked=new Set([0]);
  while(linked.size<vertices.length){
   let best=Infinity,bridge=null,next=-1;
   for(const source of linked)for(let target=0;target<vertices.length;target++){
    if(linked.has(target))continue;
    for(const a of samples[source])for(const b of samples[target]){
     const distance=(a[0]-b[0])**2+(a[1]-b[1])**2;
     if(distance<best){best=distance;bridge=[a,b];next=target;}
    }
   }
   if(!bridge)break;
   context.lineWidth=4;draw(bridge,false);linked.add(next);
  }
  const field=document.createElement('canvas');
  field.width=canvas.width;field.height=canvas.height;
  const blend=field.getContext('2d',{willReadFrequently:true});
  blend.filter='blur(1.5px)';
  blend.drawImage(canvas,0,0);
  const pixels=blend.getImageData(0,0,field.width,field.height).data;
  for(let i=0;i<pixels.length;i+=4)pixels[i]=pixels[i+3]>=105?255:0;
  const loops=traceMask(pixels,canvas.width,canvas.height);
  const area=loop=>Math.abs(loop.reduce((sum,[x,y],i)=>{
   const [nx,ny]=loop[(i+1)%loop.length];return sum+x*ny-nx*y;
  },0));
  const outer=loops.sort((a,b)=>area(b)-area(a))[0];
  const contour=outer?simplifyContour(outer,1.2).map(([x,y])=>[
   bounds.min.x+(x-pad)/scale,bounds.max.y-(canvas.height-y-pad)/scale
  ]):[];
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
    const point=new T.Vector3((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2,0).unproject(e.camera);
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
  group.prepend(outline);
 }
 const criteria=[...ranking.querySelectorAll('[name=ranking-criterion]')];
 const keep=ranking.querySelector('.rank-keep'),discard=ranking.querySelector('.rank-delete');
 function clearRanking(){
  ranked.clear();keep.disabled=discard.disabled=true;visualKey='';
 }
 for(const input of criteria)input.onchange=clearRanking;
 function separationScore(layout){
  const shapes=grid.seed.parts.map(({paths,center},i)=>{
   const [x,y,degrees]=layout[i],angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
   return paths.map(({points,closed})=>({closed,points:points.map(([px,py])=>{
    const dx=px-center.x,dy=py-center.y;
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
   case 'Continuity':return -mean(gaps.map(Math.abs));
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
  const count=ranked.size;
  for(const index of ranked){
   if(grid.locked.has(index))continue;
   grid.deleted.add(index);grid.layouts.delete(index);
   gridArt.querySelector('[data-cell="'+index+'"]')?.remove();
  }
  clearRanking();fitGrid();setGridStatus('Deleted '+count+' variations.');
 };
  function fitGrid(){
  if(!isolationActive||!grid)return false;
  isolated=null;refreshOutlines();updateLockButton();clearRanking();
  e.fit(gridBounds(),true);setGridStatus('Showing the full grid.');
  return true;
 }
 showGridButton.onclick=ranking.querySelector('.rank-show-grid').onclick=fitGrid;
 const inWorkspace=mesh=>!inIterations()||mesh.userData.workspaceStage!=='iterations'||Boolean(mesh.userData.savedIterationId)===isolationActive;
 const allowsMesh=mesh=>inWorkspace(mesh)&&(!isolationActive||isolated===null||(isolated===0&&grid.seed.meshes.includes(mesh)));
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
   positions:mesh.geometry.attributes.position.array,position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),program:mesh.userData.program
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
   return {paths,center,radius,box,program:member.program};
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
  const left=reuse?grid.left:seed.center.x-columns*cell/2,top=reuse?grid.top:seed.center.y+rows*cell/2;
  grid={columns,rows,cell,left,top,seed,placed:place,compact,packed,deleted:new Set(),locked:new Set(),layouts:new Map(),mixed:false,ver:Date.now()};
  isolated=null;updateLockButton();clearRanking();
  if(place){
   const dx=left+cell/2-seed.center.x,dy=top-cell/2-seed.center.y;
   if(dx||dy)e.checkpoint();
   for(const mesh of seed.meshes){mesh.position.x+=dx;mesh.position.y+=dy;mesh.updateMatrixWorld(true);}
   e.select(seed.meshes);e.mark(seed.meshes);
  }
  updateGridArt();
  e.fit(gridBounds());
  mixStatus.textContent=place?'Composition moved to the top-left cell.':'Created a '+columns+' × '+rows+' grid with '+(cell/foot).toLocaleString(undefined,{maximumFractionDigits:4})+' ft cells.';
 }
 mix.querySelector('.make-iteration-grid').onclick=()=>createGrid(true);
 mix.querySelector('.mix-iterations').onclick=()=>{
  if(!inIterations()||e.isBusy())return;
  if(!grid?.placed)createGrid(true);
  if(!grid?.placed)return;
  grid.settings=['overlap','centrality','rhythm'].map(key=>mix.querySelector('.mix-'+key).valueAsNumber/100);
  clearRanking();
  grid.mixed=true;grid.ver++;
  updateGridArt();
  mixStatus.textContent='Generated '+(grid.columns*grid.rows-1)+' variations. The top-left cell holds the original.';
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
    const id='iteration-grid-part-'+i,shape=svg('path');
    shape.id=id;shape.setAttribute('d',paths.map(({points,closed})=>'M'+points.map(([x,y])=>[x-seed.center.x,y-seed.center.y].join(',')).join(' L')+(closed?' Z':'')).join(' '));
    shape.setAttribute('stroke','var(--variation-stroke, '+cyan+')');shape.setAttribute('stroke-width','1');shape.setAttribute('vector-effect','non-scaling-stroke');
    shape.setAttribute('fill',program&&paths.every(p=>p.closed)?'var(--variation-fill, #21e0ed28)':'none');shape.setAttribute('fill-rule','evenodd');defs.append(shape);
    return {id,center,program,radius,label:program?labelSpace(paths):null};
   });
   const total=mixed?rows*columns:1;
   for(let index=1;index<total;index++){
    if(grid.deleted.has(index))continue;
    const row=Math.floor(index/columns),column=index%columns;
    const cx=left+(column+.5)*cell,cy=top-(row+.5)*cell;
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
    for(const [i,{id,center,program,radius,label:space}] of parts.entries()){
     const slot=parts[order[i]].center,ox=center.x-seed.center.x,oy=center.y-seed.center.y;
     const limit=Math.max(0,cell/2-radius-cell*.025);
     const blend=(a,b)=>a+(b*spread*(1.45-.9*overlap)-a)*strength;
     const drift=cell*.36*strength**1.2*(1.4-centrality);
     const direction=phase+i*2*Math.PI/parts.length;
     const reach=.28+rhythm*(i%2===0?.72:-.20);
     const offset=cell*.12*strength*(1-centrality);
     const freeX=blend(ox,slot.x-seed.center.x)+Math.cos(direction)*drift*reach+Math.cos(phase)*offset;
     const axialX=ox*.22+Math.cos(direction)*drift*reach*.15;
     const nextX=cx+T.MathUtils.clamp(T.MathUtils.lerp(freeX,axialX,centrality),-limit,limit);
     const freeY=blend(oy,slot.y-seed.center.y)+Math.sin(direction)*drift*reach+Math.sin(phase)*offset;
     const axialY=oy*.78+Math.sin(direction)*drift*reach*.25;
     const nextY=cy+T.MathUtils.clamp(T.MathUtils.lerp(freeY,axialY,centrality),-limit,limit);
     const nextAngle=(rotations[i]*(.35+.65*rhythm))*strength**1.25*(1-.8*centrality);
     const [compactX,compactY]=(rearrange?grid.packed:grid.compact)[i];
     const looseX=compactX*(rearrange?(row%2?-.9:.9):1);
     const looseY=compactY*(rearrange?(column%2?-.9:.9):1);
     const looseAngle=(quarterTurn===3?-1:quarterTurn)*90+(rearrange?rotations[i]*strength*.85:0);
     const overlapBlend=overlap*.72;
     const xMix=T.MathUtils.lerp(cx+cosTurn*looseX-sinTurn*looseY,nextX,overlapBlend);
     const yMix=T.MathUtils.lerp(cy+sinTurn*looseX+cosTurn*looseY,nextY,overlapBlend);
     const [x,y,angle]=layout[i]??(layout[i]=[xMix,yMix,T.MathUtils.lerp(looseAngle,nextAngle,overlapBlend)]);
     const use=svg('use');use.setAttribute('href','#'+id);use.dataset.variationPiece='';
     use.setAttribute('transform','translate('+x+','+y+') rotate('+angle+') translate('+(-ox)+','+(-oy)+')');
     group.append(use);
     if(space){
      const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
      const dx=space.x-center.x,dy=space.y-center.y;
      const label=fittedTitle(program,space.radius,cell*.035);
      label.setAttribute('transform','translate('+(x+c*dx-s*dy)+','+(y+s*dx+c*dy)+') scale(1,-1)');
      group.append(label);
     }
    }
    grid.layouts.set(index,layout);
   }
  }
  gridArt=art;visualKey='';
 }

 function redraw(showGrid){
  const meshes=iterationMeshes().filter(allowsMesh),selectedSet=new Set(selected()),camera=e.camera,w=viewport.clientWidth,h=viewport.clientHeight;
  for(const mesh of meshes)mesh.updateWorldMatrix(true,false);
  const key=JSON.stringify([w,h,camera.projectionMatrix.elements,camera.matrixWorld.elements,showGrid?grid?.ver:null,isolated,meshes.map(m=>[m.uuid,m.geometry.uuid,m.userData.program,m.matrixWorld.elements,selectedSet.has(m)])]);
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
   const [x,y]=point(0,0),[rx]=point(1,0),[,uy]=point(0,1);
   gridArt.setAttribute('transform','matrix('+(rx-x)+' 0 0 '+(uy-y)+' '+x+' '+y+')');
   for(const cell of gridArt.querySelectorAll('[data-cell]')){
    const index=Number(cell.dataset.cell);
    cell.style.display=isolated===null||index===isolated?'':'none';
    colorVariation(cell,grid.locked.has(index)||ranked.has(index));
    cell.style.opacity=isolated===null&&ranked.size&&!ranked.has(index)?'.25':'';
    const outline=cell.querySelector('[data-variation-outline]');
    const outlined=showOutlines&&(isolated===index||!ranked.size||ranked.has(index));
    if(outlined&&!outline)drawVariationOutline(index,cell);
    if(!outlined)outline?.remove();
    const dimPieces=Boolean(cell.querySelector('[data-variation-outline]'));
    for(const piece of cell.querySelectorAll('[data-variation-piece]'))piece.style.opacity=dimPieces?'0.28':'';
   }
   gridArt.querySelector(':scope > path').style.display=isolated===null?'':'none';
   overlay.append(gridArt);
   if(isolated!==null){const box=cellBounds(isolated);path(command([point(box.min.x,box.min.y),point(box.max.x,box.min.y),point(box.max.x,box.max.y),point(box.min.x,box.max.y)])+' Z','#21e0ed55',1);}
  }
  for(const mesh of meshes){
   const focused=selectedSet.has(mesh),label=mesh.userData.program;
   if(!focused&&!label)continue;
   const paths=pathsOf(mesh).map(({points,closed})=>({points:points.map(([x,y])=>point(x,y,mesh.matrixWorld)),closed}));
   if(label){
    const closed=paths.filter(p=>p.closed);
    if(closed.length){path(closed.map(p=>command(p.points)+' Z').join(' '),'none',0,'#21e0ed28');projectedRegions.push({mesh,paths:closed});}
    const space=labelSpace(closed);
    if(space){
     const text=fittedTitle(label,space.radius,12);
     text.setAttribute('x',space.x);text.setAttribute('y',space.y);
     overlay.append(text);
    }
   }
   if(focused&&paths.length)path(paths.map(p=>command(p.points)+(p.closed?' Z':'')).join(' '),cyan,2.5);
  }
 }
 const mixInputs=[gridSize,cellSize,...mix.querySelectorAll('input[type=range]'),detail,curvature];
 const cornerState=source=>[...(grid?.layouts||[])].flatMap(([index,layout])=>{
  const points=source.get(layout);
  return points?.size?[[index,[...points]]]:[];
 });
 function saveKey(){
  return [grid?.ver,isolated,[...(grid?.locked||[])],[...(grid?.deleted||[])],[...ranked],cornerState(filletsByLayout),
   mixInputs.map(input=>input.value),titles.checked,showOutlines,showPoints,criteria.map(input=>input.checked),cornerState(restoredByLayout)];
 }
 function saveState(){
  const state={key:saveKey(),status:mixStatus.textContent};
  if(grid){
   const {meshes,...seed}=grid.seed;
   state.grid={...grid,seed:{...seed,meshIds:meshes.map(mesh=>mesh.studioId)},layouts:[...grid.layouts],locked:[...grid.locked],deleted:[...grid.deleted]};
  }
  return state;
 }
 function restoreState(state){
  if(!state?.key)return;
  const [,cell,, ,results,fillets,values,showTitles,outlines,points,checked,restored=[]]=state.key;
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
  if(state.status)setGridStatus(state.status);
 }
  return {allowsMesh,inWorkspace,fitGrid,saveKey,saveState,restoreState,
  update(active,showMix){
   const wasMix=isolationActive;
   isolationActive=active&&showMix;
   lockAll.disabled=!grid?.layouts.size||grid.locked.size===grid.layouts.size;
   unlockAll.disabled=!grid?.locked.size;
   overlay.classList.toggle('hide-program-titles',isolationActive&&!titles.checked);
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
