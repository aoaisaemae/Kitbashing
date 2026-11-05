import * as T from './three.js';
export function installWorkflow(e){
 const {$}=e,names=['figures','project','resolution'];let active='figures',worker=null,rejectJob=null,job=0,lastUI='',message='Arrange your source figures, then build a closed Project mesh.';
 const tabs=document.createElement('nav');tabs.className='viewport-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Modeling stages');for(const name of names){const b=document.createElement('button');b.id='viewport'+name[0].toUpperCase()+name.slice(1);b.textContent=name[0].toUpperCase()+name.slice(1);b.dataset.stage=name;b.setAttribute('role','tab');b.onclick=()=>switchTo(name);tabs.append(b);}$('.canvas-head').before(tabs);
 const bar=document.createElement('section');bar.className='workflow-bar';bar.innerHTML='<div class="workflow-actions"><button id="buildProject">Build Project from Figures</button><button id="sendResolution">Edit resolution →</button><label id="resolutionLabel" for="resolutionFaces">Quad faces</label><input id="resolutionFaces" type="range" min="100" max="100" step="2" value="100"><input id="resolutionCount" aria-label="Target quad faces" type="number" min="100" step="2" value="100"><button id="applyResolution">Apply density</button><button id="restoreResolution">Original</button><button id="refreshResolution">Update from Project</button><button id="cancelWorkflow" hidden>Cancel</button></div><p id="workflowStatus" role="status"></p>';
 $('.alignment-strip').after(bar);
 const stageOf=m=>m.userData.workspaceStage||'figures',inStage=(m,stage=active)=>!e.pieces().includes(m)||stageOf(m)===stage,stagePieces=(stage=active)=>e.pieces().filter(m=>stageOf(m)===stage);
 const count=m=>m.geometry.userData.quadLayout?m.geometry.attributes.position.count/6:(m.geometry.index?.count||m.geometry.attributes.position.count);
 const pack=g=>{const flat=g.index?g.toNonIndexed():g;const p=flat.attributes.position.array.slice();if(flat!==g)flat.dispose();return p;};
 function base(m){if(!m.userData.resolutionOriginal){m.userData.resolutionOriginal=pack(m.geometry);m.userData.resolutionOriginalLayout=m.geometry.userData.quadLayout||false;m.userData.resolutionOriginalCount=count(m);}return {positions:m.userData.resolutionOriginal,layout:m.userData.resolutionOriginalLayout,count:m.userData.resolutionOriginalCount};}
 function signature(){return JSON.stringify(stagePieces('figures').filter(e.layerVisible).map(m=>{const p=m.geometry.attributes.position;return [m.studioId,p.count,...Array.from({length:12},(_,i)=>p.array[Math.floor(i*(p.array.length-1)/11)]),...m.position.toArray(),...m.quaternion.toArray(),...m.scale.toArray()];}));}
 function geometry(positions,layout=false){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));if(layout)g.userData.quadLayout=layout;g.computeVertexNormals();g.computeBoundingBox();return g;}
 function say(text){message=text;$('#workflowStatus').textContent=text;}
 function restore(state){active=names.includes(state?.active)?state.active:'figures';lastUI='';update();}
 function refreshVisibility(){for(const m of e.pieces())m.visible=stageOf(m)===active&&e.layerVisible(m)&&!e.split()?.isSuppressed(m);}
 function selectContent(){e.select(stagePieces().filter(e.canEdit));}
 function update(){
  refreshVisibility();const current=stagePieces(),key=JSON.stringify([active,e.isBusy(),current.map(m=>[m.studioId,m.geometry.uuid,e.locked(m),e.layerVisible(m)])]);
  if(key===lastUI)return;lastUI=key;tabs.querySelectorAll('button').forEach(b=>{const on=b.dataset.stage===active;b.classList.toggle('active',on);b.setAttribute('aria-selected',on);b.disabled=e.isBusy();});
  $('.canvas-title .eyebrow').textContent=active==='figures'?'FIGURE FIELD':active==='project'?'PROJECT MESH':'RESOLUTION STUDY';$('.canvas-title p').textContent=active==='figures'?'KITBASHING WORKSPACE':active==='project'?'CLOSED COMBINED GEOMETRY':'QUADRANGULAR MESH DENSITY';
  $('#buildProject').hidden=active==='resolution';$('#buildProject').textContent=active==='figures'?'Build Project from Figures':'Update Project from Figures';$('#sendResolution').hidden=active!=='project';
  for(const id of ['resolutionLabel','resolutionFaces','resolutionCount','applyResolution','restoreResolution','refreshResolution'])$('#'+id).hidden=active!=='resolution';
  for(const b of bar.querySelectorAll('button:not(#cancelWorkflow)'))b.disabled=e.isBusy();$('#cancelWorkflow').hidden=!worker;
  if(active==='resolution'){
   const visible=current.filter(e.layerVisible),max=visible.reduce((n,m)=>n+base(m).count,0),min=Math.min(100,max),actual=visible.reduce((n,m)=>n+count(m),0);for(const id of ['resolutionFaces','resolutionCount']){const input=$('#'+id);input.min=min;input.max=max;input.value=Math.max(min,Math.min(max,actual));input.disabled=e.isBusy()||max<=min;}
   $('#applyResolution').disabled=e.isBusy()||!max||max<=min;$('#restoreResolution').disabled=e.isBusy()||!max;
   if(!e.isBusy())say(max?(max<100?'Original mesh has '+max+' quads, already below 100.':actual.toLocaleString()+' quads · range '+min.toLocaleString()+'–'+max.toLocaleString()+'. Lower density changes detail; Original restores full geometry.'):'Build a Project first to study its resolution.');
  }else $('#workflowStatus').textContent=message;
 }
 async function switchTo(name){
  if(e.isBusy()||e.split()?.active)return e.say('Finish or cancel the current operation first.');if(name===active)return;
  e.cad().cancel();e.cad().leavePlane();e.select([]);active=name;lastUI='';update();selectContent();e.refresh();
  if(name==='project'&&!stagePieces('project').length&&stagePieces('figures').length)await buildProject();
  else if(name==='resolution'&&!stagePieces('resolution').length){if(!stagePieces('project').length&&stagePieces('figures').length)await buildProject();if(stagePieces('project').length)copyToResolution();}
  if(active==='project'&&stagePieces('project').length){const project=stagePieces('project')[0],outdated=project.userData.sourceSignature!==signature();say(outdated?'Figures changed. Update Project when you want to bring those edits across.':project.userData.projectReconstructed?'Closed Project was rebuilt to repair invalid surfaces. Review details and dimensions; source Figures are preserved.':'Closed Project mesh · source Figures remain editable in their tab.');}
  e.fit();
 }
 function replace(stage){e.select([]);for(const m of stagePieces(stage)){e.pieces().splice(e.pieces().indexOf(m),1);m.removeFromParent();m.geometry.dispose();m.material.dispose();}}
 async function run(url,data,transfers=[]){const token=++job;worker=new Worker(url,{type:'module'});e.busy(true);lastUI='';update();try{return await new Promise((resolve,reject)=>{rejectJob=reject;worker.onmessage=ev=>{if(token!==job)return;const d=ev.data;if(d.type==='progress')return say(d.text);if(d.error)reject(Error(d.error));else resolve(d);};worker.onerror=()=>reject(Error('The geometry operation could not complete. Your existing meshes are unchanged.'));worker.postMessage(data,transfers);});}finally{worker?.terminate();worker=null;rejectJob=null;e.busy(false);lastUI='';update();}}
 async function buildProject(){
  if(e.isBusy()||e.split()?.active)return;if(stagePieces('project').some(e.locked))return e.say('Unlock Project objects before replacing them.');const sources=stagePieces('figures').filter(e.layerVisible);if(!sources.length)return e.say('Add visible objects in Figures first.');
  const sourceKey=signature(),meshes=sources.map(m=>{m.updateMatrixWorld(true);const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld),positions=pack(g);g.dispose();return {positions,name:m.name};}),bounds=new T.Box3();sources.forEach(m=>bounds.expandByObject(m));const scale=Math.max(bounds.getSize(new T.Vector3()).length(),1e-6);
  try{
   say('Combining visible Figures and closing the Project mesh…');const result=await run('./repair-worker.js',{meshes,action:'repair',options:{method:'auto',tolerance:Math.max(scale*1e-7,1e-6),minWall:Math.max(scale/500,.05),resolution:96,shell:true}},meshes.map(m=>m.positions.buffer));
   e.checkpoint();replace('project');const g=geometry(result.positions),m=e.add({geometry:g,name:'Project · combined figures',offset:new T.Vector3(),stage:'project'});g.dispose();m.userData.sourceSignature=sourceKey;m.userData.projectClosed=true;m.userData.projectReconstructed=!!result.report?.usedReconstruction;e.select([]);active=active==='figures'?'project':active;lastUI='';update();selectContent();e.refresh();e.mark(stagePieces());e.fit();
   say(result.report?.usedReconstruction?'Closed Project created using surface reconstruction. Review fine details and dimensions before exporting.':'Closed Project created · overlapping solids fused; separate enclosed shells grouped in one mesh.');
  }catch(error){say(error.message);e.say(error.message);}
 }
 function copyToResolution(){
  if(e.isBusy())return;if(stagePieces('resolution').some(e.locked))return e.say('Unlock Resolution objects before replacing them.');const sources=stagePieces('project').filter(e.layerVisible);if(!sources.length)return e.say('Build a Project first.');e.checkpoint();replace('resolution');for(const source of sources){const m=e.add({geometry:source.geometry,name:source.name.replace(/^Project/,'Resolution'),offset:source.position.clone(),stage:'resolution'});m.quaternion.copy(source.quaternion);m.scale.copy(source.scale);m.material.color.copy(source.material.color);base(m);}active='resolution';lastUI='';update();selectContent();e.refresh();e.mark(stagePieces());e.fit();
 }
 async function applyResolution(original=false){
  if(active!=='resolution'||e.isBusy())return;const targets=stagePieces().filter(e.layerVisible);if(!targets.length)return e.say('Copy a Project into Resolution first.');if(targets.some(m=>!e.canEdit(m)))return e.say('Unlock the Resolution objects and their layers before changing density.');
  const max=targets.reduce((n,m)=>n+base(m).count,0),target=original?max:Math.max(Math.min(100,max),Math.min(max,Math.round(Number($('#resolutionCount').value)/2)*2));
  try{
   let results;if(target>=max)results=targets.map(m=>({positions:base(m).positions.slice(),layout:base(m).layout,count:base(m).count}));
   else{say('Reducing the mesh and validating closed quad surfaces…');const items=targets.map(m=>({positions:base(m).positions.slice(),target:Math.max(24,Math.round(target*base(m).count/max/2)*2)})),result=await run('./resolution-worker.js',{items},items.map(i=>i.positions.buffer));results=result.results.map(r=>({...r,layout:true}));}
   e.checkpoint();targets.forEach((m,i)=>{m.geometry.dispose();m.geometry=geometry(results[i].positions,results[i].layout);m.userData.resolutionTarget=target;});lastUI='';update();e.select(targets);e.mark(targets);e.refresh();
   const actual=targets.reduce((n,m)=>n+count(m),0);say(actual.toLocaleString()+' closed quads · '+(actual===target?'target reached.':actual>target?'closed topology requires more faces than the requested target.':'nearest valid closed density.')+(target<max?' Lower densities simplify the shape; use Original to restore all detail.':' Original geometry restored.'));
  }catch(error){say(error.message);e.say(error.message);}
 }
 $('#buildProject').onclick=buildProject;$('#sendResolution').onclick=()=>switchTo('resolution');$('#applyResolution').onclick=()=>applyResolution();$('#restoreResolution').onclick=()=>applyResolution(true);$('#refreshResolution').onclick=copyToResolution;
 $('#resolutionFaces').oninput=ev=>$('#resolutionCount').value=ev.target.value;$('#resolutionCount').oninput=ev=>$('#resolutionFaces').value=ev.target.value;
 $('#cancelWorkflow').onclick=()=>{if(!worker)return;job++;worker.terminate();rejectJob?.(Error('Operation cancelled. Existing meshes are unchanged.'));};
 return {switchTo,buildProject,copyToResolution,applyResolution,update,inStage,stageOf,stagePieces,save:()=>({active}),restore,get active(){return active;},count};
}
