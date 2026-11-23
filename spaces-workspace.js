import {stairGeometry} from './floor-assembly.js?v=site-sections-20261122';
import {realityPlacement} from './reality-placement.js?v=site-sections-20261122';
import {placeWithinSite} from './site-context.js?v=site-sections-20261122';
import {installSiteContext} from './site-context.js?v=site-sections-20261122';
import * as T from './three.js';
import {installIterationWorkspace} from './iteration-workspace.js?v=site-sections-20261122';
import {installSavedPicker} from './saved-picker.js?v=site-sections-20261122';

export function installSpacesWorkspace(e,panel,pages,store,tab,setTab=()=>{}){
 panel.classList.add('spaces-panel');
 const groups=pages.map(page=>[...page.querySelectorAll(':scope > details > .property-group-content')]);
 function section(parent,title){const node=document.createElement('section');node.className='spaces-section';const heading=document.createElement('h3');heading.textContent=title;node.append(heading);parent.append(node);return node;}
 const curves=document.createElement('div'),mix=document.createElement('div'),ranking=document.createElement('div'),save=document.createElement('div'),anchor=document.createElement('div');
 const editor=installIterationWorkspace(e,curves,mix,ranking,save,store,anchor,store.section,'spaces');
 const site=installSiteContext(e,groups[3]?.[0]);
 const base=groups[0][0],anchored=groups[0][1];base.append(curves);
 curves.querySelector('.iteration-input-group > summary').textContent='BASE';
 curves.querySelector('.iteration-input-group').open=true;
 const programTitle=[...curves.querySelectorAll('h3')].find(h=>h.textContent==='Assign program');if(programTitle)programTitle.textContent='NAME PROGRAM';
 const anchorSection=section(anchored,'FLOOR');anchorSection.append(anchor);
 anchor.querySelector('h3').hidden=true;
 const anchorButton=anchor.querySelector('.anchor-iteration-insert');anchorButton.dataset.actionLabel='Anchor';anchorButton.textContent='Anchor';
 anchor.querySelector('.anchor-space').closest('label').after(anchorButton);
 const innerAnchor=anchor.querySelector('.saved-picker-insert');if(innerAnchor)innerAnchor.hidden=true;
 const floorInsert=document.createElement('button');floorInsert.type='button';floorInsert.className='floor-picker-insert';floorInsert.textContent='Insert';const anchorMenu=anchor.querySelector('.saved-picker-menu');anchor.querySelector('.saved-picker').after(floorInsert);
 const syncFloorInsert=()=>{floorInsert.disabled=e.isBusy()||!anchorMenu.querySelector('.saved-picker-option[aria-selected="true"]');};
 new MutationObserver(syncFloorInsert).observe(anchorMenu.querySelector('.saved-picker-options'),{childList:true,subtree:true,attributes:true,attributeFilter:['aria-selected']});syncFloorInsert();
 floorInsert.onclick=()=>{if(e.isBusy())return;const options=[...anchor.querySelector('.anchor-iteration-picker').options].filter(option=>option.value&&!option.disabled);const ids=[...anchorMenu.querySelectorAll('.saved-picker-option')].flatMap((row,i)=>row.getAttribute('aria-selected')==='true'&&options[i]?[options[i].value]:[]);if(!ids.length)return;editor.insertIterations(ids);anchor.querySelector('.saved-picker').open=false;};


 // Anchors are chosen from the current workspace, independently of saved libraries.
 for(const label of anchor.querySelectorAll('label'))label.hidden=true;
 for(const heading of anchor.querySelectorAll('h3'))heading.hidden=true;
 floorInsert.hidden=true;anchor.querySelector('.saved-picker')?.closest('label')?.setAttribute('hidden','');
 anchorSection.firstElementChild.textContent='CHOOSE SPACES';
 const confirmAnchor=document.createElement('button'),cancelAnchor=document.createElement('button');confirmAnchor.type=cancelAnchor.type='button';confirmAnchor.className='anchor-confirm';cancelAnchor.className='anchor-cancel';confirmAnchor.textContent='Confirm';cancelAnchor.textContent='Cancel';confirmAnchor.hidden=cancelAnchor.hidden=true;anchorButton.after(confirmAnchor,cancelAnchor);
 let choosingAnchors=false,pendingAnchors=new Set(),previousSelection=[];
 const viewport=e.$('#viewport'),anchorStatus=anchor.querySelector('.anchor-status');
 const programName=mesh=>mesh.userData.program?.trim()||mesh.name||'Unnamed program';
 const anchorNames=()=>[...pendingAnchors].map(programName).join(', ')||'None';
 anchorStatus.setAttribute('aria-live','polite');
 function endAnchorSelection(confirm){if(!choosingAnchors)return;if(confirm)editor.setAnchors([...pendingAnchors]);choosingAnchors=false;confirmAnchor.hidden=cancelAnchor.hidden=true;anchorButton.setAttribute('aria-pressed','false');viewport.style.cursor='';e.select(confirm?[...pendingAnchors]:previousSelection);anchorStatus.textContent=confirm?'Anchored: '+anchorNames()+'.':'Anchor selection cancelled.';}
 anchorButton.onclick=()=>{if(e.isBusy())return;previousSelection=[...e.selection()];pendingAnchors=new Set(e.pieces().filter(m=>m.userData.workspaceStage==='spaces'&&m.userData.iterationAnchor));choosingAnchors=true;confirmAnchor.hidden=cancelAnchor.hidden=false;anchorButton.setAttribute('aria-pressed','true');viewport.style.cursor='crosshair';e.select([...pendingAnchors]);anchorStatus.textContent='Click spaces, then Confirm. Selected: '+anchorNames()+'.';};
 confirmAnchor.onclick=()=>endAnchorSelection(true);cancelAnchor.onclick=()=>endAnchorSelection(false);
 viewport.addEventListener('pointerdown',event=>{if(choosingAnchors&&event.button===0){event.preventDefault();event.stopImmediatePropagation();}},true);
 viewport.addEventListener('click',event=>{if(!choosingAnchors||event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();const mesh=editor.pick(event.clientX,event.clientY);if(!mesh||mesh.userData.workspaceStage!=='spaces'||!mesh.isLine||mesh.userData.spaceKind==='outline')return;if(!pendingAnchors.delete(mesh))pendingAnchors.add(mesh);e.select([...pendingAnchors]);anchorStatus.textContent=(pendingAnchors.has(mesh)?'Selected: ':'Deselected: ')+programName(mesh)+'. Anchors to confirm: '+anchorNames()+'.';},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&choosingAnchors){event.preventDefault();endAnchorSelection(false);}},true);
 const applyMix=mix.querySelector('.mix-iterations'),runMix=applyMix.onclick;
 for(const selector of ['.mix-overlap','.mix-centrality','.mix-rhythm']){const slider=mix.querySelector(selector);slider.value='50';slider.closest('label').hidden=true;}
 applyMix.onclick=()=>{for(const selector of ['.mix-overlap','.mix-centrality','.mix-rhythm'])mix.querySelector(selector).value='50';runMix();};

 section(anchored,'REALITY').innerHTML+='<label>Type <select class="spaces-reality-type"><option value="stairs">Egress stairs · 20 ft × 8 ft</option><option value="elevator">Elevator · 8 ft × 8 ft</option><option value="restroom">Restroom · 22 ft × 18 ft</option></select></label><button class="spaces-spawn" type="button">Add cores</button>';
 const savedControls=curves.querySelector('.iteration-save-group');savedControls.open=true;section(anchored,'SAVE').append(savedControls);
 const floor=section(groups[1][0],'INSERT ANCHOR SPACES');floor.append(mix);
 // Keep each controller's root intact: their existing event handlers and selectors remain valid.
 groups[1][1].replaceChildren();
 section(groups[1][1],'GRID').append(mix.querySelector('.section'));
 // The saved-floor selector is shown in FLOOR; grid and mixing stay in ITERATE.
 const mixedRoot=groups[1][1].querySelector('.section');
 const savedToggle=mixedRoot.querySelector('.saved-iteration-toggle'),savedPanel=mixedRoot.querySelector('.saved-iteration-picker');
 // Preserve query scope for the reused controller, while presenting its saved picker at the top.
 floor.append(mix);mix.append(mixedRoot);
 groups[1][1].firstElementChild.append(mix);
 floor.append(savedToggle,savedPanel);
 const pickGroup=document.createElement('details');pickGroup.className='property-group iteration-curves-group';pickGroup.innerHTML='<summary>PICK</summary><div class="property-group-content"></div>';groups[1][2].closest('details').before(pickGroup);pickGroup.lastElementChild.append(ranking);const pickSite=section(pickGroup.lastElementChild,'SITE');editor.mountOrientation(pickSite);
 const outlineTools=document.createElement('section');outlineTools.className='spaces-outline-tools';outlineTools.setAttribute('aria-label','Outline controls');
 for(const selector of ['.rank-outline','.rank-points','.rank-detail','.rank-curvature']){const node=ranking.querySelector(selector);outlineTools.append(node.matches('input')?node.closest('label'):node);}
 pages[1].prepend(outlineTools);
 for(const value of ['Continuity','Rhythm','Centrality']){const input=ranking.querySelector('[name="ranking-criterion"][value="'+value+'"]');input.checked=false;input.disabled=true;input.closest('label').hidden=true;}

 groups[1][2].append(save);const saveHeadings=save.querySelectorAll('h3');saveHeadings[0].textContent='SAVE MATRIX';saveHeadings[1].textContent='SAVE ITERATIONS';
 function siteSection(title){
  const details=document.createElement('details');
  details.className='property-group iteration-curves-group';
  const summary=document.createElement('summary'), content=document.createElement('div');
  summary.textContent=title;
  content.className='property-group-content';
  details.append(summary,content);
  pages[3].append(details);
  return details;
 }
 siteSection('ANATOMY');
 const siteIterate=siteSection('ITERATE'), sitePick=siteSection('PICK'), siteFinalize=siteSection('FINALIZE');
 const studySections=[siteIterate,sitePick,siteFinalize];
 const siteStudy=()=>tab()===3&&studySections.some(section=>section.open);
 const sharedControls=[
  [mix.closest('.spaces-section'),siteIterate.lastElementChild],
  [ranking,sitePick.lastElementChild],
  [pickSite,sitePick.lastElementChild],
  [outlineTools,siteFinalize.lastElementChild],
  [save,siteFinalize.lastElementChild]
 ].map(([control,destination])=>{
  const home=document.createComment('Assemble controls');
  control.before(home);
  return {control,home,destination};
 });
 function placeStudyControls(inSite){
  for(const {control,home,destination} of sharedControls){
   if(inSite&&control.parentNode!==destination)destination.append(control);
   if(!inSite&&control.previousSibling!==home)home.after(control);
  }
 }
 for(const details of pages[3].querySelectorAll(':scope > details')){
  if(studySections.includes(details))continue;
  details.addEventListener('toggle',()=>{
   if(details.open&&tab()===3)for(const study of studySections)study.open=false;
  });
 }
 let wasSiteStudy=false,siteViewBeforeStudy=null;
 const operate=groups[2][0];operate.closest('details').querySelector('summary').textContent='SET UP';
 for(const extra of groups[2].slice(1))extra.closest('details').remove();
 const insertSection=section(operate,'INSERT');
 insertSection.innerHTML+='<label>Saved iteration <select class="spaces-insert-picker" aria-label="Saved iteration"></select></label><button class="spaces-insert" type="button">Insert</button>';
 const copySection=section(operate,'COPY');
 copySection.innerHTML+='<button class="spaces-copy-above" type="button">Copy floor</button><label>Height between floors <output class="spaces-copy-height-value">12 ft</output><input class="spaces-copy-height" type="range" min="1" max="40" step="0.5" value="12"></label>';
 let floorHeight=12;
 const heightSlider=copySection.querySelector('input'),heightValue=copySection.querySelector('output');
 function applyFloorHeight(){heightValue.textContent=floorHeight+' ft';for(const mesh of e.pieces().filter(m=>m.userData.workspaceStage==='spaces-operate'&&m.userData.stackLevel)){mesh.position.z=mesh.userData.stackBaseZ+mesh.userData.stackLevel*floorHeight*304.8;mesh.userData.floorElevation=mesh.position.z;mesh.updateMatrixWorld(true);}e.mark(meshes());}
 heightSlider.onpointerdown=()=>e.checkpoint();heightSlider.oninput=()=>{floorHeight=Number(heightSlider.value);applyFloorHeight();};
 copySection.querySelector('button').onclick=()=>{if(e.isBusy())return;const available=meshes().filter(m=>!m.userData.spaceFloorHidden);const chosen=e.selection().filter(m=>available.includes(m));const candidates=chosen.length?chosen:available;if(!candidates.length){status.textContent='Insert a floor first.';return;}const level=Math.max(...candidates.map(m=>m.userData.floorLevel||1));if(level>=5){status.textContent='All five floors are already in use.';return;}const source=available.filter(m=>(m.userData.floorLevel||1)===level);const members=source.map(m=>{const member=pack(m),stackLevel=(m.userData.stackLevel||0)+1,stackBaseZ=m.userData.stackBaseZ??m.position.z;member.position[2]=stackBaseZ+stackLevel*floorHeight*304.8;return {...member,floorLevel:level+1,stackLevel,stackBaseZ,floorElevation:member.position[2],sitePlaced:true};});insertMembers(members,level+1,false);status.textContent='Copied '+members.length+' floor objects directly above to Floor '+(level+1)+'.';};
 const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');panel.append(status);
 const currentStage=()=>tab()>=2?'spaces-operate':'spaces';
 const meshes=()=>e.pieces().filter(m=>m.userData.workspaceStage===currentStage());
 const selected=()=>e.selection().filter(m=>m.userData.workspaceStage===currentStage()&&e.canEdit(m));
 let records=[],shownFloor=null;
 const pack=m=>({name:m.name,positions:m.geometry.attributes.position.array.slice(),curve:!!m.isLine,realitySpace:m.userData.realitySpace||null,position:m.position.toArray(),rotation:m.quaternion.toArray(),scale:m.scale.toArray(),color:m.material.color.getHex(),program:m.userData.program||'',floorLevel:m.userData.floorLevel||1,spaceKind:m.userData.spaceKind,floorElevation:m.userData.floorElevation,stackLevel:m.userData.stackLevel,stackBaseZ:m.userData.stackBaseZ,sitePlaced:!!m.userData.sitePlaced,anchored:!!m.userData.iterationAnchor});
 function insertMembers(members,floorLevel,fit=true,stage=currentStage(),checkpoint=true){if(checkpoint)e.checkpoint();const groupId=crypto.randomUUID();const result=members.map(member=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(member.positions),3));const m=e.add({geometry:g,name:member.name,curve:member.curve!==false,offset:new T.Vector3().fromArray(member.position||[0,0,0]),stage});g.dispose();if(member.rotation)m.quaternion.fromArray(member.rotation);if(member.scale)m.scale.fromArray(member.scale);m.material.color.setHex(member.color??0x21e0ed);Object.assign(m.userData,{groupId,spaceKind:member.spaceKind||(member.name==='Matrix outline'?'outline':'program'),program:member.program||'',floorLevel:floorLevel||member.floorLevel||1,iterationAnchor:!!member.anchored,realitySpace:member.realitySpace||null,floorElevation:member.floorElevation,stackLevel:member.stackLevel,stackBaseZ:member.stackBaseZ,sitePlaced:!!member.sitePlaced,savedIterationId:crypto.randomUUID()});return m;});shownFloor=null;for(const m of meshes())m.userData.spaceFloorHidden=false;e.select(result);e.mark(result);if(fit)e.fit();return result;}
 async function refresh(){try{records=(await store.list()).filter(r=>r.members?.length);const picker=insertSection.querySelector('select'),previous=picker.value;picker.replaceChildren(...records.map(r=>new Option(r.name,r.id)));picker.value=records.some(r=>r.id===previous)?previous:records[0]?.id||'';}catch(error){status.textContent=error.message;}}
 installSavedPicker(insertSection.querySelector('select'),{insertButton:insertSection.querySelector('button'),status,isBusy:e.isBusy,onInsert:ids=>{insertMembers(records.filter(r=>ids.includes(r.id)).flatMap(r=>r.members));status.textContent='Inserted selected spaces.';},onDelete:async ids=>{for(const id of ids)await store.remove(id);await refresh();}});
 anchored.querySelector('.spaces-spawn').onclick=()=>{if(e.isBusy())return;const kind=anchored.querySelector('.spaces-reality-type').value;const [w,d]=kind==='stairs'?[20,8]:kind==='elevator'?[8,8]:[22,18];const available=meshes().filter(m=>m.isLine&&!m.userData.realitySpace&&!m.userData.spaceFloorHidden);const candidates=[...new Set([...selected().filter(m=>!m.userData.realitySpace),...available.filter(m=>m.userData.iterationAnchor),...available.slice().reverse()])];let target,position;for(const candidate of candidates){position=realityPlacement(candidate,(w+(kind==='stairs'?4:0))*304.8,(d+(kind==='stairs'?4:0))*304.8);if(position){if(kind==='stairs'){position[0]+=2*304.8;position[1]+=2*304.8;}target=candidate;break;}}if(!target){status.textContent=available.length?'No floor region is large enough for this reality space. Select a larger floor.':'Insert or select a floor before adding a reality space.';return;}e.checkpoint();const width=w*304.8,depth=d*304.8,height=12*304.8;const geometry=kind==='stairs'?stairGeometry([0,height]).rotateX(Math.PI/2).translate(width/2,depth/2,0):new T.BoxGeometry(width,depth,height).translate(width/2,depth/2,height/2);const added=e.add({geometry,name:kind==='stairs'?'Egress stairs':kind==='elevator'?'Elevator':'Restroom',curve:false,offset:new T.Vector3().fromArray(position),stage:'spaces'});geometry.dispose();added.material.color.setHex(0x21e0ed);Object.assign(added.userData,{realitySpace:kind,sitePlaced:true,sourceFloorId:target.studioId,floorLevel:target.userData.floorLevel||1});e.select([added]);e.mark([added]);e.fit();status.textContent='Added '+added.name+' on Floor '+(added.userData.floorLevel||1)+'.';};

 const colors=[0x21e0ed,0xf65b88,0xdc24f4,0xffc568,0xd5f5ff];let visibleFloors=[true,true,true,true,true],pendingFloor=null,threshold=25;
 const floorDetails=document.createElement('details');floorDetails.className='property-group iteration-curves-group';floorDetails.innerHTML='<summary>FLOORS</summary><div class="property-group-content"></div>';pages[2].append(floorDetails);
 for(let level=5;level>=1;level--){const label=document.createElement('label');label.innerHTML='<input type="checkbox" class="floor-visible" data-floor="'+level+'" checked> Floor '+level;label.style.color='#'+colors[level-1].toString(16).padStart(6,'0');floorDetails.lastElementChild.append(label);label.firstElementChild.onchange=()=>{visibleFloors[level-1]=label.firstElementChild.checked;e.select([]);e.mark([]);};}
 const display={text:true,programs:true,anchors:true,outline:true,site:false};e.scene.userData.spacesDisplay=display;
 const displayBar=document.createElement('div');displayBar.className='spaces-display-toggles';
 for(const [key,title]of [['text','Program text'],['programs','Programmatic spaces'],['anchors','Anchored spaces'],['outline','Outline'],['site','Site view']]){const button=document.createElement('button');button.type='button';button.textContent=title;button.dataset.display=key;button.setAttribute('aria-pressed',String(display[key]));button.onclick=()=>{display[key]=!display[key];if(key==='site')site.setVisible(display.site);button.setAttribute('aria-pressed',String(display[key]));e.mark([]);};displayBar.append(button);}document.querySelector('header')?.append(displayBar);
 function button(parent,title,cls,action){const b=document.createElement('button');b.type='button';b.textContent=title;b.className=cls;b.onclick=async()=>{if(e.isBusy()||b.disabled)return;b.disabled=true;try{await action();}catch(error){status.textContent='Could not complete '+title+': '+error.message;}finally{b.disabled=false;}};parent.append(b);return b;}
 const inputSection=store.section;
 button(inputSection,'Grab from "Floor"','spaces-grab-floor',()=>{if(!pendingFloor?.length){status.textContent='Send a floor from 03 / FLOOR first.';return;}const members=structuredClone(pendingFloor);const z=Math.min(...members.map(m=>m.position[2]||0));for(const member of members){member.position[2]-=z;member.floorElevation=member.position[2];member.sitePlaced=true;}e.checkpoint();e.select([]);for(const mesh of e.pieces().filter(m=>m.userData.workspaceStage==='spaces')){e.pieces().splice(e.pieces().indexOf(mesh),1);mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}editor.resetGrid();const added=insertMembers(members,undefined,true,'spaces',false);e.select(added);status.textContent='Grabbed the floor with programs, names and anchors.';});
 button(operate,'Send to Assign','spaces-send-assign',()=>{const available=e.pieces().filter(m=>m.userData.workspaceStage==='spaces-operate'&&!m.userData.spaceFloorHidden),chosen=e.selection().filter(m=>available.includes(m));if(!available.length){status.textContent='Insert or copy a floor first.';return;}const level=Math.max(...(chosen.length?chosen:available).map(m=>m.userData.floorLevel||1));pendingFloor=available.filter(m=>(m.userData.floorLevel||1)===level).map(pack);setTab(0);status.textContent='Floor '+level+' is ready. Click Grab from "Floor" in BASE.';});
 button(anchored.closest('details').parentElement,'Send to site','spaces-send-site',()=>{
  const curves=e.pieces().filter(mesh=>mesh.visible&&mesh.isLine&&mesh.userData.workspaceStage==='spaces'&&mesh.userData.spaceKind!=='outline');
  if(!curves.length){status.textContent='Add curves in Assign first.';return;}
  site.sendCurves(curves.map(mesh=>mesh.studioId));
  e.mark([]);
  setTab(3);
 });
 button(savedControls,'Send to Assemble','spaces-send-assemble',async()=>{let source=e.selection().filter(m=>m.userData.workspaceStage==='spaces');if(source.length){const ids=new Set(source.map(m=>m.userData.groupId));source=e.pieces().filter(m=>m.userData.workspaceStage==='spaces'&&ids.has(m.userData.groupId));}if(!source.length)source=e.pieces().filter(m=>m.userData.workspaceStage==='spaces'&&m.visible);if(!source.length){const id=anchor.querySelector('.anchor-iteration-picker').value;const record=(await store.list()).find(r=>r.id===id);if(record)source=insertMembers(record.members,undefined,false,'spaces');}if(!source.length){status.textContent='Insert or select an iteration first.';return;}const group=crypto.randomUUID();for(const m of source){m.userData.groupId=group;m.userData.savedIterationId=group;}editor.resetGrid();setTab(1);e.select(source);e.mark(source);status.textContent='Sent the iteration to Assemble.';});
 button(save.querySelector('.matrix-cell-save').parentElement,'Send to Floor','spaces-send-floor',async()=>{let members=editor.chosenMembers();if(!members.length){const id=save.querySelector('.saved-matrix-cell-picker')?.value;const record=(await store.list()).find(r=>r.id===id);members=record?.members||[];}if(!members.length){status.textContent='Select a grid iteration or a saved iteration first.';return;}const response=await fetch(new URL('./site-context.json',import.meta.url));if(!response.ok){status.textContent='Could not load the site boundary.';return;}const data=await response.json(),points=data.boundary.slice(0,-1),cx=points.reduce((s,p)=>s+p[0],0)/points.length,cy=points.reduce((s,p)=>s+p[1],0)/points.length;const added=insertMembers(members,1,false,'spaces-operate');placeWithinSite(added,data.boundary.map(([x,y])=>[(x-cx)*1000,(y-cy)*1000]));setTab(2);e.select(added);e.mark(added);status.textContent='Sent the iteration into the site boundary on Floor 1.';});
 const anchorOps=section(groups[1][1],'OPERATE');anchorOps.innerHTML+='<div class="button-pair"><button data-anchor-operation="offset">Offset</button><button data-anchor-operation="scale">Scale</button><button data-anchor-operation="rotate">Rotate</button></div><button type="button" data-anchor-operation="reset">Reset to origin</button><label>Threshold <output>25%</output><input class="anchor-operation-threshold" type="range" min="0" max="100" value="25"></label>';
 const anchorOpsHome=document.createComment('Assemble anchor operations');
 anchorOps.before(anchorOpsHome);
 sharedControls.push({control:anchorOps,home:anchorOpsHome,destination:siteIterate.lastElementChild});
 anchorOps.querySelector('input').oninput=event=>{threshold=Number(event.target.value);anchorOps.querySelector('output').textContent=threshold+'%';};for(const b of anchorOps.querySelectorAll('button'))b.onclick=()=>editor.operateAnchors(b.dataset.anchorOperation,threshold/100);
 let wasActive=false,lastTab=-1,draft3D=false,views={};
 function captureView(){return e.baseCamera?{position:e.baseCamera.position.toArray(),target:e.orbit.target.toArray(),up:e.baseCamera.up.toArray(),near:e.baseCamera.near,far:e.baseCamera.far,draft3D}:null;}
 function restoreView(view,index){if(!view||!e.baseCamera)return;if(index<2)draft3D=!!view.draft3D;e.baseCamera.position.fromArray(view.position);e.orbit.target.fromArray(view.target);e.baseCamera.up.fromArray(view.up);e.baseCamera.near=view.near;e.baseCamera.far=view.far;e.baseCamera.updateProjectionMatrix();e.orbit.update();}
 for(const page of pages.slice(0,2)){const bar=document.createElement('div');bar.className='button-pair spaces-view-controls';for(const [label,value] of [['2D plan',false],['3D view',true]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{draft3D=value;if(!e.baseCamera)return;const distance=Math.max(e.baseCamera.position.distanceTo(e.orbit.target),1);e.baseCamera.up.set(0,value?0:1,value?1:0);const direction=value?new T.Vector3(.55,-.65,1).normalize():new T.Vector3(0,0,1);e.baseCamera.position.copy(e.orbit.target).addScaledVector(direction,distance);e.orbit.update();};bar.append(button);}const outlineTools=page.querySelector(':scope > .spaces-outline-tools');if(outlineTools)outlineTools.after(bar);else page.prepend(bar);}

 return {pick:editor.pick,allowsMesh:editor.allowsMesh,inWorkspace:editor.inWorkspace,fitGrid:()=>tab()===1||siteStudy()?editor.fitGrid():false,isSiteStudy:siteStudy,site3D:()=>siteStudy()?false:tab()<2?draft3D:tab()===2||site.is3D(),saveKey:()=>[editor.saveKey(),shownFloor,floorHeight,visibleFloors,display,pendingFloor,threshold,site.save()],saveState:()=>({editor:editor.saveState(),shownFloor,floorHeight,visibleFloors,display:{...display},pendingFloor,threshold,site:site.save(),views,draft3D}),restoreState(state){editor.restoreState(state?.editor);visibleFloors=state?.visibleFloors||[true,true,true,true,true];pendingFloor=state?.pendingFloor||null;threshold=state?.threshold??25;Object.assign(display,state?.display||{});for(const input of floorDetails.querySelectorAll('input'))input.checked=visibleFloors[Number(input.dataset.floor)-1];for(const b of displayBar.children)b.setAttribute('aria-pressed',String(display[b.dataset.display]));anchorOps.querySelector('input').value=threshold;anchorOps.querySelector('output').textContent=threshold+'%';shownFloor=state?.shownFloor??null;floorHeight=state?.floorHeight||12;heightSlider.value=String(floorHeight);heightValue.textContent=floorHeight+' ft';site.restore(state?.site);views=state?.views||{};draft3D=!!state?.draft3D;},update(active){const current=tab(),studying=active&&siteStudy();placeStudyControls(current===3);e.scene.userData.spacesFloorHeight=floorHeight*304.8;if(choosingAnchors&&(!active||current!==0))endAnchorSelection(false);anchorButton.disabled=e.isBusy()||!e.pieces().some(m=>m.isLine&&m.userData.workspaceStage==='spaces'&&m.visible);e.scene.userData.spacesOperate=active&&current>=2&&!studying;if(wasActive&&(!active||current!==lastTab)){const view=lastTab===3&&wasSiteStudy?siteViewBeforeStudy:captureView();if(view)views[lastTab]=view;}
 if(active&&(!wasActive||current!==lastTab)){e.select([]);if(views[current])restoreView(views[current],current);else if(current===2&&e.baseCamera){e.orbit.target.set(0,0,0);e.baseCamera.up.set(0,0,1);e.baseCamera.position.set(30000,-37500,50000);e.orbit.update();}}
 if(studying&&!wasSiteStudy)siteViewBeforeStudy=captureView();
 if(active&&current===3&&!studying&&wasSiteStudy)restoreView(siteViewBeforeStudy,3);
 displayBar.hidden=!active;for(const b of displayBar.children)b.setAttribute('aria-pressed',String(display[b.dataset.display]));for(const m of e.pieces().filter(m=>m.userData.workspaceStage==='spaces-operate')){const level=Math.max(1,Math.min(5,m.userData.floorLevel||1));m.userData.spaceFloorHidden=!visibleFloors[level-1];m.userData.floorColor=colors[level-1];if(m.isLine)m.material.color.setHex(colors[level-1]);}site.update(active,current===3,!studying);store.update(false,false,active);const inputTitle=store.section.querySelector(':scope > h3:nth-of-type(2)');if(inputTitle&&inputTitle.textContent!=='INPUTTING CURVES')inputTitle.textContent='INPUTTING CURVES';const showStudy=active&&(current===1||studying);mix.hidden=ranking.hidden=save.hidden=!showStudy;anchor.hidden=!active||current!==0;if(current!==3||studying||wasSiteStudy||lastTab!==3||wasActive!==active)editor.update(active&&(current<2||studying),showStudy);if(active&&(!wasActive||lastTab!==current||studying!==wasSiteStudy)){refresh();if(current!==3||studying)e.fit();}wasSiteStudy=studying;wasActive=active;lastTab=current;}};
}
