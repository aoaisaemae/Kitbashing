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
 constraints.innerHTML='<div class="section"><h3>XY constraints</h3><p class="hint">Move in XY, rotate in the plane, or scale the selection.</p><form><label>X (ft) <input name="x" type="number" step="any" value="0" required></label><label>Y (ft) <input name="y" type="number" step="any" value="0" required></label><button>Move</button></form><form><label>Angle (°) <input name="angle" type="number" step="any" value="90" required></label><button>Rotate</button></form><form><label>Scale factor <input name="factor" type="number" min="0.001" step="any" value="1" required></label><button>Scale</button></form></div>';
 const commands=['Move','Rotate','Scale'];
 constraints.querySelectorAll('form').forEach((form,i)=>form.onsubmit=event=>{
  event.preventDefault();
  e.cad().execute([commands[i],...new FormData(form).values()].join(' '));
 });
 let chosen='resolution',previousStage;
 const tabs=['01 / RESOLUTION','02 / CONSTRAINTS','01 / FLOOR PLATES'].map((label,i)=>{
  const button=document.createElement('button');
  button.textContent=label;
  button.hidden=true;
  if(i<2)button.onclick=()=>{chosen=i===0?'resolution':'constraints';};
  e.$('.panel-tabs').append(button);
  return button;
 });
 tabs[0].id='tabFigureResolution';
 const library=installIterations(e,panel.firstChild);
 return {update(){
  const stage=e.workflow().active,program=stage==='resolution',floor=stage==='floor-plates';
  if(stage!==previousStage){previousStage=stage;chosen='resolution';}
  outline.update();
  panel.hidden=!floor&&(!program||chosen!=='resolution');
  panel.firstChild.firstElementChild.hidden=!program;
  constraints.hidden=!program||chosen!=='constraints';
  for(const button of e.$('.panel-tabs').querySelectorAll('button')){
   const index=tabs.indexOf(button);
   button.hidden=index===-1?program||floor:index===2?!floor:!program;
   if(index>=0)button.classList.toggle('active',index===2?floor:program&&index===(chosen==='resolution'?0:1));
  }
  if(program||floor)for(const aside of e.$('.control-content').querySelectorAll(':scope > aside'))if(aside!==panel&&aside!==constraints)aside.hidden=true;
  library.update(program);
 }};
}

function installIterations(e,parent){
 const section=document.createElement('section');
 section.innerHTML='<h3>Save Iteration</h3><label class="field-label">Iteration name <input type="text" maxlength="80" placeholder="Iteration name"></label><button type="button" disabled>Save Iteration</button><p class="hint" role="status"></p><h3>Saved iterations</h3><div></div>';
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
  list.replaceChildren();
  if(!items.length){list.textContent='No saved iterations yet.';return;}
  for(const item of items.sort((a,b)=>a.name.localeCompare(b.name))){
   const button=document.createElement('button');
   button.textContent='Insert · '+item.name;
   button.onclick=()=>{
    const stage=e.workflow().active;
    if(e.isBusy()||!['resolution','floor-plates'].includes(stage))return;
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(item.positions,3));
    geometry.userData.quadLayout=item.quadLayout;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    e.checkpoint();
    const mesh=e.add({geometry,name:item.name,offset:new T.Vector3().fromArray(item.position),stage:stage==='floor-plates'?stage:'program-outline'});
    geometry.dispose();
    mesh.quaternion.fromArray(item.rotation);
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
   list.append(row);
  }
 }
 let saving=false;
 save.onclick=async()=>{
  const mesh=selected(),name=input.value.trim();
  if(!mesh||saving||e.isBusy())return;
  if(!name){status.textContent='Name the iteration first.';input.focus();return;}
  saving=true;
  try{
   await access('readwrite',store=>store.add({id:crypto.randomUUID(),name,positions:mesh.geometry.attributes.position.array.slice(),quadLayout:mesh.geometry.userData.quadLayout,position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),color:mesh.material.color.getHex()}));
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
