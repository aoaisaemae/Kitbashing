import {installFloorAssembly} from './floor-assembly.js';
import * as T from './three.js';
import {installOutline} from './composition-outline.js';
import {installIterationWorkspace} from './iteration-workspace.js?v=matrix-save';

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
 const iterationLabels=['01 / CURVES','02 / MIX','03 / RANKING','04 / SAVE'];
 const iterationPanels=['curves','mix','iteration-reality','iteration-save'];
 const iterationTabs=iterationLabels.map((label,i)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.hidden=true;b.onclick=()=>{chosen=iterationPanels[i];};e.$('.panel-tabs').append(b);return b;});
 const mix=document.createElement('aside');mix.className='resolution-panel';mix.hidden=true;e.$('.control-content').append(mix);
 const ranking=document.createElement('aside');ranking.className='resolution-panel';ranking.hidden=true;e.$('.control-content').append(ranking);
 const savePanel=document.createElement('aside');savePanel.className='resolution-panel';savePanel.hidden=true;e.$('.control-content').append(savePanel);
 const floors=installFloorAssembly(e,reality);
 const library=installIterations(e,panel.firstChild,floors);
 floors.setStore(library);
 floors.mount(panel.firstChild);
 const editor=installIterationWorkspace(e,panel.firstChild,mix,ranking,savePanel,library);
 return {pick:editor.pick,allowsMesh:editor.allowsMesh,inWorkspace:editor.inWorkspace,fitGrid:editor.fitGrid,
  saveKey:()=>[chosen,editor.saveKey(),floors.save()],
  saveState:()=>({chosen,editor:editor.saveState(),floors:floors.save()}),
  restoreState(state){
   if(!state)return;
   previousStage=e.workflow().active;
   chosen=state.chosen;
   editor.restoreState(state.editor);
   floors.restore(state.floors);
  },
  update(){
  const stage=e.workflow().active,program=stage==='resolution',floor=stage==='floor-plates',iterations=stage==='iterations';
  if(stage!==previousStage){previousStage=stage;chosen=iterations?'curves':floor?'floor':'resolution';}
  outline.update();
  const showProperties=floor&&chosen==='properties';
  panel.hidden=!(floor&&chosen==='floor'||program&&chosen==='resolution'||iterations&&chosen==='curves');
  const inspector=e.$('.inspector');
  inspector.classList.toggle('floor-properties',floor);
  panel.firstChild.firstElementChild.hidden=!program;
  reality.hidden=!floor||chosen!=='reality';
  ranking.hidden=!iterations||chosen!=='iteration-reality';
  mix.hidden=!iterations||chosen!=='mix';
  savePanel.hidden=!iterations||chosen!=='iteration-save';
  constraints.hidden=!program||chosen!=='constraints';
  for(const button of e.$('.panel-tabs').querySelectorAll('button')){
   if(button===figureTab){button.hidden=stage!=='figures';continue;}
   const iterationIndex=iterationTabs.indexOf(button);
   if(iterationIndex>=0){button.hidden=!iterations;button.classList.toggle('active',iterations&&chosen===iterationPanels[iterationIndex]);continue;}
   const index=tabs.indexOf(button);
   button.hidden=iterations|| (index===-1?program||floor:index>=2?!floor:!program);
   if(index>=0)button.classList.toggle('active',(index>=2?floor:program)&&chosen===['resolution','constraints','floor','properties','reality'][index]);
  }
  if(program||floor||iterations)for(const aside of e.$('.control-content').querySelectorAll(':scope > aside'))if(aside!==panel&&aside!==constraints&&aside!==reality&&aside!==mix&&aside!==ranking&&aside!==savePanel)aside.hidden=aside!==inspector||!showProperties;
  library.update(program,floor,iterations);
  floors.update(floor&&chosen==='floor',floor&&chosen==='reality');
  editor.update(iterations,iterations&&['mix','iteration-reality','iteration-save'].includes(chosen));
 }};
}

function installIterations(e,parent,floors){
 const section=document.createElement('section');
 section.innerHTML='<h3>Save Iteration</h3><label class="field-label iteration-name">Iteration name <input type="text" maxlength="80" placeholder="Name this iteration"></label><button type="button" disabled>Save Iteration</button><p class="hint" role="status"></p><h3>Saved iterations</h3><div></div>';
 parent.append(section);
 const insertAll=document.createElement('button');insertAll.type='button';insertAll.textContent='Insert all';insertAll.hidden=true;insertAll.disabled=true;
 const importButton=document.createElement("button"),fileInput=document.createElement("input");
 importButton.type="button";importButton.textContent="Import curve";importButton.title="Import Rhino .3dm, SVG, or OBJ line curves";
 fileInput.type="file";fileInput.accept=".3dm,.svg,.obj";fileInput.hidden=true;
 section.lastElementChild.before(importButton,fileInput);section.lastElementChild.after(insertAll);
 importButton.onclick=()=>fileInput.click();
 const input=section.querySelector('input'),save=section.querySelector('button'),status=section.querySelector('[role=status]'),list=section.querySelector(':scope > div');
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
 fileInput.onchange=async()=>{
  const file=fileInput.files[0];fileInput.value='';if(!file)return;
  importButton.disabled=true;
  try{
   const curves=/\.3dm$/i.test(file.name)?await readRhinoCurves(file):[{name:file.name.replace(/\.[^.]+$/,''),positions:await readExternalCurve(file)}];
   const records=curves.map(curve=>({...curve,id:crypto.randomUUID(),curve:true,position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],color:0x80ddff}));
   await access('readwrite',store=>{
    for(const record of records.slice(0,-1))store.add(record);
    return store.add(records.at(-1));
   });
   await load(records[0].id);status.textContent='Imported '+records.length+' '+(records.length===1?'curve':'curves')+'. Click Insert or Insert all to place curves.';
  }catch(error){status.textContent='Could not import curve. '+error.message;}
  finally{importButton.disabled=false;}
 };
 async function load(selectedId){
  const items=(await access('readonly',store=>store.getAll())).filter(item=>!item.members);
  insertAll.disabled=!items.length;
  const previous=selectedId||list.querySelector('select')?.value;
  list.replaceChildren();
  if(!items.length){list.textContent='No saved iterations yet.';return;}
  const picker=document.createElement('select');picker.setAttribute('aria-label','Saved iterations');list.append(picker);
  const rows=new Map(),floorOptions=[],inserters=[];
  for(const item of items.sort((a,b)=>a.name.localeCompare(b.name))){
   const button=document.createElement('button');
   button.textContent='Insert';
   picker.add(new Option(item.name,item.id));
   const floor=document.createElement('select');floor.setAttribute('aria-label','Assign floor for '+item.name);
   for(let n=1;n<=5;n++)floor.add(new Option('Floor '+n,String(n)));
   const existing=e.pieces().find(m=>m.userData.workspaceStage==='floor-plates'&&(m.userData.iterationId===item.id||(!m.userData.iterationId&&m.name===item.name)));
   const nextFloor=()=>Math.min(5,1+Math.max(0,...e.pieces().filter(m=>m.userData.workspaceStage==='floor-plates'&&!m.userData.egressStair).map(m=>m.userData.floorLevel||0)));
   floor.value=String(Math.min(5,item.floorLevel||existing?.userData.floorLevel||nextFloor()));
   const floorY=floors.elevation;
   floor.onchange=async()=>{
    if(e.workflow().active==='iterations')return;
    const level=Number(floor.value);
    try{item.floorLevel=level;await access('readwrite',store=>store.put(item));
     if(e.workflow().active!=='floor-plates'||e.isBusy())return;
     const matches=e.pieces().filter(m=>e.canEdit(m)&&(m.userData.iterationId===item.id||(!m.userData.iterationId&&m.name===item.name)));
     if(matches.length){e.checkpoint();for(const mesh of matches){mesh.userData.iterationId=item.id;mesh.userData.floorLevel=level;mesh.position.y=floorY(level);}floors.updateStairs();e.select(matches);e.mark(matches);e.fit();}
    }catch(error){report(error);}
   };
   const floorLabel=document.createElement('label');floorLabel.className='field-label floor-assignment';floorLabel.textContent='Assign floor';floorLabel.append(floor);
   const place=()=>{
    const stage=e.workflow().active;
    if(e.isBusy()||!['resolution','iterations','floor-plates'].includes(stage))return;
    const geometry=new T.BufferGeometry();
    const positions=item.curve?item.positions:legacyCenterline(item.positions);
    geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    geometry.computeBoundingBox();
    const mesh=e.add({geometry,name:item.name,curve:true,offset:stage==='floor-plates'?new T.Vector3(0,floorY(Number(floor.value)),0):new T.Vector3().fromArray(item.position),stage:stage==='resolution'?'program-outline':stage});
    geometry.dispose();
    mesh.userData.iterationId=item.id;mesh.userData.program=item.program||'';mesh.userData.floorLevel=Number(floor.value);
    if(item.corners)mesh.userData.outlineCorners=structuredClone(item.corners);
    mesh.quaternion.fromArray(item.rotation);
    if(stage==='floor-plates'){
     mesh.userData.iterationId=item.id;mesh.userData.floorLevel=Number(floor.value);mesh.userData.floorSpacing=floorY(2);
     for(const [id,control,record] of floorOptions)if(id!==item.id&&!record.floorLevel)control.value=String(nextFloor());
    }
    if(stage==='floor-plates')mesh.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2));
    mesh.scale.fromArray(item.scale);
    mesh.material.color.setHex(item.color);
    return mesh;
   };
   inserters.push(place);
   button.onclick=()=>insertCurves([place]);
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
   const entry=document.createElement('div');
   entry.append(floorLabel,row);
   list.append(entry);rows.set(item.id,entry);floorOptions.push([item.id,floor,item]);
  }
  if(rows.has(previous))picker.value=previous;
  const updateRows=()=>{for(const [id,row] of rows)row.hidden=id!==picker.value;};
  picker.onchange=updateRows;updateRows();
  insertAll.onclick=()=>insertCurves(inserters);
  const bulk=document.createElement('details');bulk.className='curve-bulk-delete';
  bulk.innerHTML='<summary>Delete multiple curves</summary><div class="curve-delete-list"></div><button type="button" disabled>Delete selected</button>';
  list.append(bulk);
  const checks=bulk.querySelector('div'),removeSelected=bulk.querySelector('button');
  for(const item of items){
   const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=item.id;
   label.append(check,document.createTextNode(item.name));checks.append(label);
  }
  checks.onchange=()=>{removeSelected.disabled=!checks.querySelector(':checked');};
  removeSelected.onclick=async()=>{
   const ids=[...checks.querySelectorAll(':checked')].map(check=>check.value);
   if(!ids.length)return;
   removeSelected.disabled=true;
   try{
    await access('readwrite',store=>{for(const id of ids.slice(0,-1))store.delete(id);return store.delete(ids.at(-1));});
    await load();status.textContent='Deleted '+ids.length+' curves from the list.';
   }catch(error){report(error);removeSelected.disabled=false;}
  };

 }
 function insertCurves(placements){
  if(e.isBusy()||!placements.length)return;
  e.checkpoint();const meshes=placements.map(place=>place()).filter(Boolean);
  if(meshes.length){if(e.workflow().active==='floor-plates')floors.updateStairs();e.select(meshes);e.mark(meshes);e.fit();status.textContent='Inserted '+meshes.length+' '+(meshes.length===1?'curve.':'curves.');}
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
 return {add:item=>access('readwrite',store=>store.add(item)),list:()=>access('readonly',store=>store.getAll()),remove:id=>access('readwrite',store=>store.delete(id)),update(program,showFloor,iterations){
  section.querySelectorAll('h3')[1].textContent=iterations?'Input curve':'Saved iterations';
  section.firstElementChild.hidden=iterations||!program;
  const bulk=list.querySelector(".curve-bulk-delete");if(bulk)bulk.hidden=!iterations;
  importButton.hidden=!iterations;insertAll.hidden=!iterations;
  section.querySelector('label').hidden=!program;
  save.hidden=!program;
  for(const label of list.querySelectorAll('.floor-assignment'))label.hidden=!showFloor;

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

function squareFootage(item){
 const positions=item.curve?item.positions:legacyCenterline(item.positions);
 let total=0,area=0,edges=0,start=-1;
 const same=(a,b)=>Math.hypot(positions[a]-positions[b],positions[a+1]-positions[b+1])<1e-7;
 for(let i=0;i+5<positions.length;i+=6){
  if(start<0)start=i;
  area+=positions[i]*positions[i+4]-positions[i+3]*positions[i+1];edges++;
  if(i+6===positions.length||!same(i+3,i+6)){
   if(edges>=3&&same(i+3,start))total+=Math.abs(area)/2;
   else return null;
   start=-1;area=0;edges=0;
  }
 }
 return total*Math.abs(item.scale[0]*item.scale[1])/(304.8**2);
}

async function readExternalCurve(file){
 const text=await file.text(),positions=[];
 const segment=(a,b)=>positions.push(a[0],a[1],0,b[0],b[1],0);
 if(/\.obj$/i.test(file.name)){
  const vertices=[];
  for(const line of text.split(/\r?\n/)){
   const [type,...values]=line.split('#')[0].trim().split(/\s+/);
   if(type==='v')vertices.push(values.slice(0,2).map(Number));
   if(type==='l'){
    const points=values.map(value=>{const i=Number(value.split('/')[0]);return vertices[i>0?i-1:vertices.length+i];});
    if(points.some(p=>!p||p.length!==2||!p.every(Number.isFinite)))throw Error('Invalid OBJ line vertices.');
    for(let i=1;i<points.length;i++)segment(points[i-1],points[i]);
   }
  }
 }else if(/\.svg$/i.test(file.name)){
  const doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=doc.documentElement,ns='http://www.w3.org/2000/svg';
  if(root.localName!=='svg'||doc.querySelector('parsererror'))throw Error('Invalid SVG file.');
  const svg=document.createElementNS(ns,'svg');
  svg.style.cssText='position:absolute;visibility:hidden;width:1px;height:1px';
  document.body.append(svg);
  try{
   const allowed=['path','polygon','polyline','line','rect','circle','ellipse'];
   const attrs='d points x y x1 x2 y1 y2 width height rx ry r cx cy transform'.split(' ');
   function walk(node,parent){
    for(const child of node.children){
     const tag=child.localName;
     if(tag!=='g'&&!allowed.includes(tag))continue;
     const shape=document.createElementNS(ns,tag);
     for(const attr of attrs)if(child.hasAttribute(attr))shape.setAttribute(attr,child.getAttribute(attr));
     parent.append(shape);
     if(tag==='g'){walk(child,shape);continue;}
     const d=shape.getAttribute('d')||'';
     if((d.match(/[mM]/g)||[]).length>1)throw Error('Export compound SVG paths as separate paths.');
     const length=shape.getTotalLength();
     if(!Number.isFinite(length)||length<=0)continue;
     const matrix=shape.getCTM(),steps=Math.min(768,Math.max(24,Math.ceil(length/3)));
     const point=i=>{const p=shape.getPointAtLength(length*i/steps).matrixTransform(matrix);return [p.x*25.4/96,-p.y*25.4/96];};
     let last=point(0);
     for(let i=1;i<=steps;i++){const next=point(i);segment(last,next);last=next;}
    }
   }
   walk(root,svg);
  }finally{svg.remove();}
 }else throw Error('Choose an SVG or an OBJ containing line curves.');
 if(!positions.length||!positions.every(Number.isFinite))throw Error('No usable planar curves found.');
 return new Float32Array(positions);
}

let curveRhino;
async function readRhinoCurves(file){
 const factory=(await import('./rhino3dm.js')).default;
 const rhino=await (curveRhino??=factory({locateFile:()=>new URL('./rhino3dm.wasm',import.meta.url).href}));
 const doc=rhino.File3dm.fromByteArray(new Uint8Array(await file.arrayBuffer()));
 if(!doc)throw Error('Could not open the Rhino file.');
 try{
  const settings=doc.settings();
  const units=settings.modelUnitSystem;
  settings.delete();
  const sizes={None:1,Angstroms:1e-7,Nanometers:1e-6,Microns:.001,Millimeters:1,Centimeters:10,Decimeters:100,Meters:1000,Dekameters:1e4,Hectometers:1e5,Kilometers:1e6,Megameters:1e9,Gigameters:1e12,Microinches:.0000254,Mils:.0254,Inches:25.4,Feet:304.8,Yards:914.4,Miles:1609344,PrinterPoints:25.4/72,PrinterPicas:25.4/6,NauticalMiles:1852000,AstronomicalUnits:149597870700000,LightYears:9.4607304725808e18,Parsecs:3.085677581491367e19};
  const unit=Object.keys(sizes).find(name=>rhino.UnitSystem[name]===units);
  if(!unit)throw Error('Set the Rhino model units to a standard unit and save again.');
  const scale=sizes[unit],table=doc.objects(),curves=[];
   for(let i=0;i<table.count;i++){
    const object=table.get(i),geometry=object.geometry();
    try{
     if(!(geometry instanceof rhino.Curve))continue;
     const attrs=object.attributes();
     const name=attrs.name||file.name.replace(/\.3dm$/i,'')+' · curve '+(curves.length+1);
     attrs.delete();
     const polyline=geometry.tryGetPolyline();
     let points;
     if(polyline){try{points=Array.from({length:polyline.count},(_,j)=>polyline.get(j));}finally{polyline.delete();}}
     else{
      const [a,b]=geometry.domain;
      points=Array.from({length:513},(_,j)=>geometry.pointAt(a+(b-a)*j/512));
     }
     if(points.length<2||points.some(point=>!point.every(Number.isFinite)))continue;
     if(geometry.isClosed)points[points.length-1]=points[0];
     const positions=[];
     for(let j=1;j<points.length;j++){
      const a=points[j-1],b=points[j];
      if(a[0]!==b[0]||a[1]!==b[1])positions.push(a[0]*scale,a[1]*scale,0,b[0]*scale,b[1]*scale,0);
     }
     if(positions.length)curves.push({name,positions:new Float32Array(positions)});
    }finally{geometry?.delete();object.delete();}
   }
  if(!curves.length)throw Error('No Rhino curves with a visible XY projection were found.');
  return curves;
 }finally{doc.delete();}
}
