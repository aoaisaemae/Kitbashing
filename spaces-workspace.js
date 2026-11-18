import {stairGeometry} from './floor-assembly.js?v=operate-independent';
import {realityPlacement} from './reality-placement.js?v=operate-independent';
import {installSiteContext} from './site-context.js?v=operate-independent';
import * as T from './three.js';
import {installIterationWorkspace} from './iteration-workspace.js?v=operate-independent';
import {installSavedPicker} from './saved-picker.js?v=operate-independent';

export function installSpacesWorkspace(e,panel,pages,store,tab){
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
 section(groups[1][1],'SELECT').append(ranking);
 const outlineTools=document.createElement('section');outlineTools.className='spaces-outline-tools';outlineTools.setAttribute('aria-label','Outline controls');
 for(const selector of ['.rank-outline','.rank-points','.rank-detail','.rank-curvature']){const node=ranking.querySelector(selector);outlineTools.append(node.matches('input')?node.closest('label'):node);}
 pages[1].prepend(outlineTools);
 for(const value of ['Continuity','Rhythm','Centrality']){const input=ranking.querySelector('[name="ranking-criterion"][value="'+value+'"]');input.checked=false;input.disabled=true;input.closest('label').hidden=true;}

 groups[1][2].append(save);const saveHeadings=save.querySelectorAll('h3');saveHeadings[0].textContent='SAVE MATRIX';saveHeadings[1].textContent='SAVE ITERATIONS';
 const operate=groups[2][0],insertSection=section(operate,'INSERT');
 insertSection.innerHTML+='<label>Saved iteration <select class="spaces-insert-picker" aria-label="Saved iteration"></select></label><button class="spaces-insert" type="button">Insert</button>';
 const operations=section(operate,'OPERATIONS');
 operations.innerHTML+='<div class="button-pair"><button data-operation="translate" type="button">Move</button><button data-operation="rotate" type="button">Rotate</button><button data-operation="scale" type="button">Scale</button></div><button data-operation="copy" type="button">Duplicate</button><button data-operation="delete" type="button">Delete selected</button>';
 const floorControls=groups[2][1];
 for(const [action,label] of [['save','SAVE TO'],['show','SHOW'],['copy','COPY']]){const sec=section(floorControls,label);const select=document.createElement('select');select.className='spaces-floor-'+action;select.setAttribute('aria-label',label+' floor');for(let i=1;i<=5;i++)select.add(new Option('Floor '+i,String(i)));sec.append(select);const button=document.createElement('button');button.type='button';button.textContent=label;button.className='spaces-floor-action-'+action;sec.append(button);button.onclick=()=>floorAction(action,Number(select.value));}
 const assignSection=section(floorControls,'ASSIGN ITERATION TO FLOOR');floorControls.prepend(assignSection);
 assignSection.innerHTML+='<label>Saved matrix iteration <select class="spaces-assign-iteration" aria-label="Saved matrix iteration"></select></label><label>Assign floor <select class="spaces-assign-floor"></select></label><button class="spaces-assign-insert" type="button">Insert</button>';
 const assignedFloor=assignSection.querySelector('.spaces-assign-floor');for(let i=1;i<=5;i++)assignedFloor.add(new Option('Floor '+i,String(i)));
 const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');panel.append(status);
 const currentStage=()=>tab()>=2?'spaces-operate':'spaces';
 const meshes=()=>e.pieces().filter(m=>m.userData.workspaceStage===currentStage());
 const selected=()=>e.selection().filter(m=>m.userData.workspaceStage===currentStage()&&e.canEdit(m));
 let records=[],shownFloor=null;
 const pack=m=>({name:m.name,positions:m.geometry.attributes.position.array.slice(),curve:m.isLine,realitySpace:m.userData.realitySpace||null,position:m.position.toArray(),rotation:m.quaternion.toArray(),scale:m.scale.toArray(),color:m.material.color.getHex(),program:m.userData.program||m.name,floorLevel:m.userData.floorLevel||1,anchored:!!m.userData.iterationAnchor});
 function insertMembers(members,floorLevel){e.checkpoint();const result=members.map(member=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(member.positions),3));const m=e.add({geometry:g,name:member.name,curve:member.curve!==false,offset:new T.Vector3().fromArray(member.position||[0,0,0]),stage:currentStage()});g.dispose();if(member.rotation)m.quaternion.fromArray(member.rotation);if(member.scale)m.scale.fromArray(member.scale);m.material.color.setHex(member.color??0x21e0ed);Object.assign(m.userData,{program:member.program||'',floorLevel:floorLevel||member.floorLevel||1,iterationAnchor:!!member.anchored,realitySpace:member.realitySpace||null,savedIterationId:crypto.randomUUID()});return m;});shownFloor=null;for(const m of meshes())m.userData.spaceFloorHidden=false;e.select(result);e.mark(result);e.fit();return result;}
 async function refresh(){try{records=(await store.list()).filter(r=>r.members?.length);const picker=insertSection.querySelector('select'),previous=picker.value;picker.replaceChildren(...records.map(r=>new Option(r.name,r.id)));picker.value=records.some(r=>r.id===previous)?previous:records[0]?.id||'';const assigned=assignSection.querySelector('.spaces-assign-iteration'),prior=assigned.value;assigned.replaceChildren(...records.filter(r=>r.kind!=='matrix').map(r=>new Option(r.name,r.id)));assigned.value=records.some(r=>r.id===prior)?prior:assigned.options[0]?.value||'';}catch(error){status.textContent=error.message;}}
 installSavedPicker(insertSection.querySelector('select'),{insertButton:insertSection.querySelector('button'),status,isBusy:e.isBusy,onInsert:ids=>{insertMembers(records.filter(r=>ids.includes(r.id)).flatMap(r=>r.members));status.textContent='Inserted selected spaces.';},onDelete:async ids=>{for(const id of ids)await store.remove(id);await refresh();}});
 async function floorAction(action,level){if(e.isBusy())return;try{
  if(action==='save'){const current=selected();if(!current.length){status.textContent='Select spaces to save to this floor.';return;}e.checkpoint();for(const m of current)m.userData.floorLevel=level;await store.add({id:crypto.randomUUID(),name:'Floor '+level+' · '+new Date().toLocaleTimeString(),kind:'spaces-floor',members:current.map(pack),savedAt:Date.now()});e.mark(current);await refresh();}
  if(action==='show'){shownFloor=shownFloor===level?null:level;e.checkpoint();for(const m of meshes())m.userData.spaceFloorHidden=shownFloor!==null&&(m.userData.floorLevel||1)!==shownFloor;e.select([]);e.fit();}
  if(action==='copy'){const source=meshes().filter(m=>(m.userData.floorLevel||1)===level);if(!source.length){status.textContent='No spaces are assigned to Floor '+level+'.';return;}insertMembers(source.map(pack),level);}
  status.textContent=action==='show'?(shownFloor?'Showing Floor '+level+'. Click SHOW again for all floors.':'Showing all floors.'):action==='save'?'Saved selected spaces to Floor '+level+'.':'Copied Floor '+level+' into the workspace.';
 }catch(error){status.textContent='Could not '+action+' floor: '+error.message;}}
 operations.onclick=event=>{const action=event.target.closest('[data-operation]')?.dataset.operation;if(!action||e.isBusy())return;const selection=selected();if(!selection.length){status.textContent='Select a space first.';return;}if(action==='copy')return insertMembers(selection.map(pack));if(action==='delete'){e.checkpoint();e.select([]);for(const m of selection){const i=e.pieces().indexOf(m);if(i>=0)e.pieces().splice(i,1);m.removeFromParent();m.geometry.dispose();m.material.dispose();}e.mark([]);return;}e.transform.setMode(action);e.select(selection);};
 anchored.querySelector('.spaces-spawn').onclick=()=>{if(e.isBusy())return;const kind=anchored.querySelector('.spaces-reality-type').value;const [w,d]=kind==='stairs'?[20,8]:kind==='elevator'?[8,8]:[22,18];const available=meshes().filter(m=>m.isLine&&!m.userData.realitySpace&&!m.userData.spaceFloorHidden);const candidates=[...new Set([...selected().filter(m=>!m.userData.realitySpace),...available.filter(m=>m.userData.iterationAnchor),...available.slice().reverse()])];let target,position;for(const candidate of candidates){position=realityPlacement(candidate,w*304.8,d*304.8);if(position){target=candidate;break;}}if(!target){status.textContent=available.length?'No floor region is large enough for this reality space. Select a larger floor.':'Insert or select a floor before adding a reality space.';return;}e.checkpoint();const width=w*304.8,depth=d*304.8,height=12*304.8;const geometry=kind==='stairs'?stairGeometry([0,height]).rotateX(Math.PI/2).translate(width/2,depth/2,0):new T.BoxGeometry(width,depth,height).translate(width/2,depth/2,height/2);const added=e.add({geometry,name:kind==='stairs'?'Egress stairs':kind==='elevator'?'Elevator':'Restroom',curve:false,offset:new T.Vector3().fromArray(position),stage:'spaces'});geometry.dispose();added.material.color.setHex(0x21e0ed);Object.assign(added.userData,{realitySpace:kind,sitePlaced:true,sourceFloorId:target.studioId,floorLevel:target.userData.floorLevel||1});e.select([added]);e.mark([added]);e.fit();status.textContent='Added '+added.name+' on Floor '+(added.userData.floorLevel||1)+'.';};
 installSavedPicker(assignSection.querySelector('.spaces-assign-iteration'),{insertButton:assignSection.querySelector('button'),status,isBusy:e.isBusy,onInsert:ids=>{const level=Number(assignedFloor.value);insertMembers(records.filter(r=>ids.includes(r.id)).flatMap(r=>r.members),level);status.textContent='Inserted selected iterations on Floor '+level+'.';},onDelete:async ids=>{for(const id of ids)await store.remove(id);await refresh();}});
 let wasActive=false,lastTab=-1;
 return {pick:editor.pick,allowsMesh:editor.allowsMesh,inWorkspace:editor.inWorkspace,fitGrid:()=>tab()>=2?false:editor.fitGrid(),site3D:()=>tab()===2||site.is3D(),saveKey:()=>[editor.saveKey(),shownFloor,site.save()],saveState:()=>({editor:editor.saveState(),shownFloor,site:site.save()}),restoreState(state){editor.restoreState(state?.editor);shownFloor=state?.shownFloor??null;site.restore(state?.site);},update(active){const current=tab();e.scene.userData.spacesOperate=active&&current>=2;if(active&&current===2&&lastTab!==2&&e.baseCamera){const distance=Math.max(e.baseCamera.position.distanceTo(e.orbit.target),10000);e.select([]);e.orbit.target.set(0,0,0);e.baseCamera.up.set(0,0,1);e.baseCamera.position.copy(e.orbit.target).addScaledVector(new T.Vector3(.6,-.75,1).normalize(),distance);e.orbit.update();}site.update(active,current===3);store.update(false,false,active);const inputTitle=store.section.querySelector(':scope > h3:nth-of-type(2)');if(inputTitle&&inputTitle.textContent!=='INPUTTING CURVES')inputTitle.textContent='INPUTTING CURVES';mix.hidden=!active||current!==1;ranking.hidden=!active||current!==1;save.hidden=!active||current!==1;anchor.hidden=!active||current!==0;if(!active||current!==3||lastTab!==3||!wasActive)editor.update(active&&current<2,active&&current===1);if(active&&(!wasActive||lastTab!==current))refresh();wasActive=active;lastTab=current;}};
}
