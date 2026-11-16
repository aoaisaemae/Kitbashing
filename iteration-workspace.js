import * as T from './three.js';

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

export function installIterationWorkspace(e,curves,mix,ranking,store){
 const controls=document.createElement('section');controls.className='iteration-editor';
 controls.innerHTML='<h3>Assign program</h3><label>Program name <input class="iteration-program" type="text" maxlength="80"></label><label>Floor <select class="iteration-floor"></select></label><h3>Square footage</h3><label>Target area (ft²) <input class="iteration-target" type="number" min="0" step="any"></label><p class="hint" aria-live="polite"></p><label>Iteration name <input class="iteration-group-name" type="text" maxlength="80"></label><button type="button">Save</button><p class="hint" role="status"></p>';
 curves.append(controls);
 const program=controls.querySelector('.iteration-program'),floor=controls.querySelector('select'),target=controls.querySelector('.iteration-target'),name=controls.querySelector('.iteration-group-name'),save=controls.querySelector('button');
 const [area,status]=controls.querySelectorAll('p');
 for(let i=1;i<=5;i++)floor.add(new Option('Floor '+i,String(i)));
 mix.innerHTML='<div class="section iteration-editor"><button class="saved-iteration-toggle" type="button" aria-expanded="false">Saved iteration</button><div class="saved-iteration-picker" hidden><label>Saved iteration <select></select></label><button class="insert-saved-iteration" type="button">Insert</button></div><h3>Grid</h3><label>Columns <input class="iteration-grid-size" type="number" min="1" max="30" step="1" value="15"></label><label>Rows <input class="iteration-cell-size" type="number" min="1" max="30" step="1" value="15"></label><button class="make-iteration-grid" type="button">Create grid</button><h3>Mix</h3><label>Overlapping parts <input class="mix-overlap" type="range" min="0" max="100" value="50"></label><label>Centrality <input class="mix-centrality" type="range" min="0" max="100" value="50"></label><label>Rhythm <input class="mix-rhythm" type="range" min="0" max="100" value="50"></label><button class="mix-iterations" type="button">MIX</button><button class="show-grid" type="button">Return to full grid</button><p class="hint" role="status"></p></div>';
 const savedToggle=mix.querySelector('.saved-iteration-toggle'),savedPanel=mix.querySelector('.saved-iteration-picker'),picker=mix.querySelector('select'),insert=mix.querySelector('.insert-saved-iteration'),mixStatus=mix.querySelector('[role=status]');
 const viewport=e.$('#viewport'),overlay=document.createElementNS(ns,'svg');
 overlay.classList.add('iteration-overlay');viewport.append(overlay);
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
 let saved=[],mixWasOpen=false;
 async function refreshSaved(preferred=picker.value){
  try{
   saved=(await store.list()).filter(item=>Array.isArray(item.members)).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
   picker.replaceChildren();
   for(const item of saved)picker.add(new Option(item.name,item.id));
   if(saved.some(item=>item.id===preferred))picker.value=preferred;
   insert.disabled=!saved.length;
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
 let isolated=null,isolationActive=false;
 const showGridButton=mix.querySelector('.show-grid');
 ranking.innerHTML='<div class="section iteration-editor"><h3>Ranking</h3><button type="button">Return to full grid</button><p class="hint" role="status"></p></div>';
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
  if(index&&!grid.mixed){setGridStatus('Click MIX to generate that cell first.');return;}
  event.preventDefault();
  isolateCell(index);
 });
 function isolateCell(index){
  isolated=index;visualKey='';
  if(index)e.select([]);
  e.fit(cellBounds(index),true);
  setGridStatus('Isolated row '+(Math.floor(index/grid.columns)+1)+', column '+(index%grid.columns+1)+'. Use arrow keys to browse.');
 }
 document.addEventListener('keydown',event=>{
  if(!isolationActive||isolated===null||!grid?.mixed||e.isBusy()||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const directions={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};
  const delta=directions[event.key];if(!delta)return;
  event.preventDefault();
  const row=Math.floor(isolated/grid.columns)+delta[0],column=isolated%grid.columns+delta[1];
  if(row>=0&&row<grid.rows&&column>=0&&column<grid.columns)isolateCell(row*grid.columns+column);
 });
 function fitGrid(){
  if(!isolationActive||!grid)return false;
  isolated=null;visualKey='';
  e.fit(gridBounds(),true);setGridStatus('Showing the full grid.');
  return true;
 }
 showGridButton.onclick=ranking.querySelector('button').onclick=fitGrid;
 const allowsMesh=mesh=>!isolationActive||isolated===null||(isolated===0&&grid.seed.meshes.includes(mesh));
 function gridBounds(){
  if(!grid)return new T.Box3();
  return new T.Box3(new T.Vector3(grid.left,grid.top-grid.rows*grid.cell,0),new T.Vector3(grid.left+grid.columns*grid.cell,grid.top,0));
 }
 function getSeed(forceLive=false){
  const item=saved.find(record=>record.id===picker.value);
  const visible=iterationMeshes(),chosen=selected();
  let meshes=item?visible.filter(mesh=>mesh.userData.savedIterationId===item.id):chosen;
  if(meshes.length&&item){
   const group=meshes.find(mesh=>chosen.includes(mesh))?.userData.groupId||meshes[0].userData.groupId;
   meshes=meshes.filter(mesh=>mesh.userData.groupId===group);
  }
  if(!meshes.length&&item){
   const names=list=>list.map(obj=>obj.name).sort().join('\u0000');
   const expected=names(item.members);
   if(chosen.length===item.members.length&&names(chosen)===expected)meshes=chosen;
   else if(visible.length===item.members.length&&names(visible)===expected)meshes=visible;
   else{
    for(const group of new Set(visible.map(mesh=>mesh.userData.groupId).filter(Boolean))){
     const candidates=visible.filter(mesh=>mesh.userData.groupId===group);
     if(candidates.length===item.members.length&&names(candidates)===expected){meshes=candidates;break;}
    }
   }
  }
  if(!meshes.length&&!item)meshes=chosen.length?chosen:visible;
  if(forceLive&&!meshes.length)return null;
  const source=meshes.length?meshes.map(mesh=>({
   positions:mesh.geometry.attributes.position.array,position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),program:mesh.userData.program
  })):item?.members||[];
  if(!source.length)return null;
  const bounds=new T.Box3();
  const parts=source.map(member=>{
   const matrix=new T.Matrix4().compose(new T.Vector3().fromArray(member.position),new T.Quaternion().fromArray(member.rotation),new T.Vector3().fromArray(member.scale));
   const box=new T.Box3();
   const paths=splitCurvePaths(member.positions).map(path=>({...path,points:path.points.map(([x,y])=>{
    const v=new T.Vector3(x,y,0).applyMatrix4(matrix);v.z=0;box.expandByPoint(v);bounds.expandByPoint(v);return [v.x,v.y];
   })}));
   const center=box.getCenter(new T.Vector3());
   const radius=paths.reduce((largest,path)=>path.points.reduce((max,[x,y])=>Math.max(max,Math.hypot(x-center.x,y-center.y)),largest),0);
   return {paths,center,radius,program:member.program};
  }).filter(part=>part.paths.length);
  if(bounds.isEmpty()||!parts.length)return null;
  return {parts,meshes,center:bounds.getCenter(new T.Vector3()),size:bounds.getSize(new T.Vector3())};
 }
 function createGrid(place){
  if(!inIterations()||e.isBusy())return;
  const columns=Number(gridSize.value),rows=Number(cellSize.value);
  if(![columns,rows].every(n=>Number.isInteger(n)&&n>=1&&n<=30))return mixStatus.textContent='Enter 1 to 30 columns and rows.';
  let seed=getSeed(),inserted=false;
  if(!seed)return mixStatus.textContent='Choose a saved iteration or insert a composition first.';
  if(place&&!seed.meshes.length){
   insert.onclick();
   seed=getSeed(true);inserted=true;
   if(!seed)return;
  }
  if(place&&seed.meshes.some(mesh=>!e.canEdit(mesh)))return mixStatus.textContent='Unlock the composition before moving it.';
  const maxRadius=Math.max(...seed.parts.map(part=>part.radius));
  const furthestCenter=Math.max(...seed.parts.map(part=>Math.max(Math.abs(part.center.x-seed.center.x),Math.abs(part.center.y-seed.center.y))));
  const cell=Math.max(seed.size.x*1.25,seed.size.y*1.25,(furthestCenter+maxRadius)*2.15,.01);
  const reuse=grid&&grid.columns===columns&&grid.rows===rows&&Math.abs(grid.cell-cell)<cell*1e-6;
  const left=reuse?grid.left:seed.center.x-columns*cell/2,top=reuse?grid.top:seed.center.y+rows*cell/2;
  grid={columns,rows,cell,left,top,seed,placed:place,mixed:false,ver:Date.now()};
  isolated=null;
  if(place){
   const dx=left+cell/2-seed.center.x,dy=top-cell/2-seed.center.y;
   if((dx||dy)&&!inserted)e.checkpoint();
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
  grid.mixed=true;grid.ver++;
  updateGridArt();
  mixStatus.textContent='Generated '+(grid.columns*grid.rows-1)+' variations. The top-left cell holds the original.';
 };
 let gridArt=null;
 function updateGridArt(){
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
    shape.setAttribute('stroke',cyan);shape.setAttribute('stroke-width','1');shape.setAttribute('vector-effect','non-scaling-stroke');
    shape.setAttribute('fill',program&&paths.every(p=>p.closed)?'#21e0ed28':'none');shape.setAttribute('fill-rule','evenodd');defs.append(shape);
    return {id,center,program,radius};
   });
   const total=mixed?rows*columns:1;
   for(let index=1;index<total;index++){
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
    const [overlap,centrality,rhythm]=grid.settings;
    const phase=Math.random()*Math.PI*2,mode=(row+2*column)%4;
    const spread=mode===0?.68:mode===1?1.18:1;
    const rotations=parts.map(()=> (Math.random()<.5?-1:1)*(35+Math.random()*145));

    for(const [i,{id,center,program,radius}] of parts.entries()){
     const slot=parts[order[i]].center,ox=center.x-seed.center.x,oy=center.y-seed.center.y;
     const limit=Math.max(0,cell/2-radius-cell*.025);
     const blend=(a,b)=>a+(b*spread*(1.45-.9*overlap)-a)*strength;
     const drift=cell*.36*strength**1.2*(1.4-centrality);
     const direction=phase+i*2*Math.PI/parts.length+(Math.random()-.5)*Math.PI*(1-rhythm);
     const offset=cell*.12*strength*(1-centrality);
     const x=cx+T.MathUtils.clamp(blend(ox,slot.x-seed.center.x)+Math.cos(direction)*drift*.5+Math.cos(phase)*offset,-limit,limit);
     const y=cy+T.MathUtils.clamp(blend(oy,slot.y-seed.center.y)+Math.sin(direction)*drift*.5+Math.sin(phase)*offset,-limit,limit);
     const angle=(rotations[i]*(1-rhythm)+Math.sin(direction)*90*rhythm)*strength**1.25;
     const use=svg('use');use.setAttribute('href','#'+id);
     use.setAttribute('transform','translate('+x+','+y+') rotate('+angle+') translate('+(-ox)+','+(-oy)+')');
     group.append(use);
     if(program){
      const label=svg('text');
      label.setAttribute('transform','translate('+x+','+y+') scale(1,-1)');
      label.style.fontSize=(cell*.035)+'px';label.style.strokeWidth='0';label.textContent=program;group.append(label);
     }
    }
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
   for(const cell of gridArt.querySelectorAll('[data-cell]'))cell.style.display=isolated===null||Number(cell.dataset.cell)===isolated?'':'none';
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
    const points=(closed[0]||paths[0])?.points;
    if(points?.length){
     const bounds=points.reduce(([x0,y0,x1,y1],[x,y])=>[Math.min(x0,x),Math.min(y0,y),Math.max(x1,x),Math.max(y1,y)],[Infinity,Infinity,-Infinity,-Infinity]);
     const text=document.createElementNS(ns,'text');
     text.setAttribute('x',(bounds[0]+bounds[2])/2);text.setAttribute('y',(bounds[1]+bounds[3])/2);
     text.textContent=label;overlay.append(text);
    }
   }
   if(focused&&paths.length)path(paths.map(p=>command(p.points)+(p.closed?' Z':'')).join(' '),cyan,2.5);
  }
 }
 return {allowsMesh,fitGrid,
  update(active,showMix){
   isolationActive=active&&showMix;
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
