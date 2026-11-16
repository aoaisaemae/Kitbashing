import * as T from './three.js';
import {installOutline} from './composition-outline.js';

export function installResolutionTools(e){
 const panel=document.createElement('aside'),constraints=document.createElement('aside');
 for(const aside of [panel,constraints]){
  aside.className='resolution-panel';
  aside.hidden=true;
  e.$('.control-content').append(aside);
 }
 panel.innerHTML='<div class="section"></div>';
 const outline=installOutline(e,panel.firstChild);
 let chosen='resolution',previousStage;
 const tabs=['01 / RESOLUTION','02 / CONSTRAINTS','01 / FLOOR PLATES','02 / PROPERTIES','03 / REALITY'].map((label,i)=>{
  const button=document.createElement('button');
  button.textContent=label;
  button.hidden=true;
  button.onclick=()=>{chosen=['resolution','constraints','floor','properties','reality'][i];};
  e.$('.panel-tabs').append(button);
  return button;
 });
 tabs[0].id='tabFigureResolution';
 const figureResolution=document.createElement('aside');
 figureResolution.className='resolution-panel';
 figureResolution.hidden=true;
 e.$('.control-content').append(figureResolution);
 const figureTab=document.createElement('button');
 figureTab.id='tabFiguresResolution';
 figureTab.type='button';
 figureTab.textContent='03 / RESOLUTION';
 e.$('#tabLayers').before(figureTab);
 const layout=e.layout(),showTab=layout.tab;
 layout.tab=which=>{
  showTab(which);
  const show=e.workflow().active==='figures'&&which==='figure-resolution';
  figureResolution.hidden=!show;
  figureTab.classList.toggle('active',show);
 };
 figureTab.onclick=()=>layout.tab('figure-resolution');

 const reality=document.createElement('aside');reality.className='resolution-panel';reality.hidden=true;reality.innerHTML='<div class="section"><h3>Reality</h3></div>';e.$('.control-content').append(reality);
 const library=installIterations(e,panel.firstChild);
 return {update(){
  const stage=e.workflow().active,program=stage==='resolution',floor=stage==='floor-plates';
  if(stage!==previousStage){previousStage=stage;chosen=floor?'floor':'resolution';}
  outline.update();
  const showProperties=floor&&chosen==='properties';
  panel.hidden=!(floor&&chosen==='floor'||program&&chosen==='resolution');
  const inspector=e.$('.inspector');
  inspector.classList.toggle('floor-properties',floor);
  panel.firstChild.firstElementChild.hidden=!program;
  reality.hidden=!floor||chosen!=='reality';
  constraints.hidden=!program||chosen!=='constraints';
  for(const button of e.$('.panel-tabs').querySelectorAll('button')){
   if(button===figureTab){button.hidden=stage!=='figures';continue;}
   const index=tabs.indexOf(button);
   button.hidden=index===-1?program||floor:index>=2?!floor:!program;
   if(index>=0)button.classList.toggle('active',(index>=2?floor:program)&&chosen===['resolution','constraints','floor','properties','reality'][index]);
  }
  if(program||floor)for(const aside of e.$('.control-content').querySelectorAll(':scope > aside'))if(aside!==panel&&aside!==constraints&&aside!==reality)aside.hidden=aside!==inspector||!showProperties;
  library.update(program);
 }};
}

function installIterations(e,parent){
 const section=document.createElement('section');
 section.innerHTML='<h3>Save Iteration</h3><label class="field-label iteration-name">Iteration name <input type="text" maxlength="80" placeholder="Name this iteration"></label><button type="button" disabled>Save Iteration</button><p class="hint" role="status"></p><h3>Saved iterations</h3><div></div>';
 parent.append(section);
 const input=section.querySelector('input'),save=section.querySelector('button'),status=section.querySelector('[role=status]'),list=section.lastElementChild;
 const selected=()=>e.selection().find(m=>m.userData.workspaceStage==='program-outline');
 const database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('popmarkit-outline-iterations',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('iterations',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 async function access(mode,operation){
  const db=await database;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('iterations',mode),request=operation(tx.objectStore('iterations'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onabort=()=>reject(tx.error);
  });
 }
 function report(error){status.textContent='Could not access saved iterations. '+(error?.message||'');}
 async function load(){
  const items=await access('readonly',store=>store.getAll());
  const previous=list.querySelector('select')?.value;
  list.replaceChildren();
  if(!items.length){list.textContent='No saved iterations yet.';return;}
  const picker=document.createElement('select');picker.setAttribute('aria-label','Saved iterations');list.append(picker);
  const rows=new Map();
  for(const item of items.sort((a,b)=>a.name.localeCompare(b.name))){
   const button=document.createElement('button');
   button.textContent='Insert';
   picker.add(new Option(item.name,item.id));
   button.onclick=()=>{
    const stage=e.workflow().active;
    if(e.isBusy()||!['resolution','floor-plates'].includes(stage))return;
    const geometry=new T.BufferGeometry();
    const positions=item.curve?item.positions:legacyCenterline(item.positions);
    geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    geometry.computeBoundingBox();
    e.checkpoint();
    const mesh=e.add({geometry,name:item.name,curve:true,offset:stage==='floor-plates'?new T.Vector3(item.position[0],0,-item.position[1]):new T.Vector3().fromArray(item.position),stage:stage==='floor-plates'?stage:'program-outline'});
    geometry.dispose();
    if(item.corners)mesh.userData.outlineCorners=structuredClone(item.corners);
    mesh.quaternion.fromArray(item.rotation);
    if(stage==='floor-plates')mesh.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2));
    mesh.scale.fromArray(item.scale);
    mesh.material.color.setHex(item.color);
    e.select([mesh]);
    e.mark([mesh]);
    e.fit();
   };
   const row=document.createElement('div'),remove=document.createElement('button');
   row.className='button-pair';
   remove.type='button';
   remove.textContent='Delete';
   remove.setAttribute('aria-label','Delete saved iteration '+item.name);
   remove.onclick=async()=>{
    remove.disabled=true;
    try{
     await access('readwrite',store=>store.delete(item.id));
     row.remove();
     status.textContent='Deleted '+item.name+'.';
     await load();
    }catch(error){report(error);remove.disabled=false;}
   };
   row.append(button,remove);
   list.append(row);rows.set(item.id,row);
  }
  if(rows.has(previous))picker.value=previous;
  const updateRows=()=>{for(const [id,row] of rows)row.hidden=id!==picker.value;};
  picker.onchange=updateRows;updateRows();
 }
 let saving=false;
 save.onclick=async()=>{
  const mesh=selected(),name=input.value.trim();
  if(!mesh||saving||e.isBusy())return;
  if(!name){status.textContent='Name the iteration first.';input.focus();return;}
  saving=true;
  try{
   await access('readwrite',store=>store.add({id:crypto.randomUUID(),name,curve:mesh.isLine,corners:mesh.userData.outlineCorners,positions:mesh.geometry.attributes.position.array.slice(),quadLayout:mesh.geometry.userData.quadLayout,position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),color:mesh.material.color.getHex()}));
   input.value='';
   status.textContent='Saved '+name+'.';
   await load();
  }catch(error){report(error);}finally{saving=false;}
 };
 load().catch(report);
 return {update(program){
  section.querySelector('label').hidden=!program;
  save.hidden=!program;
  save.disabled=!program||!selected()||saving||e.isBusy();
  save.classList.toggle('active',!save.disabled);
 }};
}


function legacyCenterline(ribbon){
 const positions=[];
 // The previous ribbon wrote four quads per segment. The first quad contains both upper edges.
 for(let i=0;i+71<ribbon.length;i+=72){
  for(let axis=0;axis<2;axis++)positions.push((ribbon[i+axis]+ribbon[i+15+axis])/2);
  positions.push(0);
  for(let axis=0;axis<2;axis++)positions.push((ribbon[i+3+axis]+ribbon[i+6+axis])/2);
  positions.push(0);
 }
 return new Float32Array(positions);
}
