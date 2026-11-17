import * as T from './three.js';
export function installWorkflow(e){
 const {$}=e,names=['figures','resolution','iterations','floor-plates','project'];let active='figures',worker=null,rejectJob=null,job=0,lastUI='',message='Arrange your source figures, then build a closed Project mesh.';
 const tabs=document.createElement('nav');tabs.className='viewport-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Modeling stages');for(const name of names){const b=document.createElement('button');b.id='viewport'+name[0].toUpperCase()+name.slice(1);b.textContent=name==='resolution'?'Program':name==='project'?'Project':name==='floor-plates'?'Floor plates':name==='iterations'?'Iterations':'Figures';b.dataset.stage=name;b.setAttribute('role','tab');b.onclick=()=>switchTo(name);tabs.append(b);}$('.canvas-head').before(tabs);
 const bar=document.createElement('section');bar.className='workflow-bar';bar.innerHTML='<div class="workflow-actions"><button id="buildProject">Build Project from Figures</button><button id="sendResolution">Edit resolution →</button><button id="cancelWorkflow" hidden>Cancel</button></div><p id="workflowStatus" role="status"></p>';
 $('.alignment-strip').after(bar);
 const stageOf=m=>m.userData.workspaceStage||'figures',inStage=(m,stage=active)=>!e.pieces().includes(m)||(stage==='resolution'?['figures','program-outline'].includes(stageOf(m)):stageOf(m)===stage),stagePieces=(stage=active)=>e.pieces().filter(m=>inStage(m,stage));
 const count=m=>m.geometry.userData.quadLayout?m.geometry.attributes.position.count/6:(m.geometry.index?.count||m.geometry.attributes.position.count);
 const pack=g=>{const flat=g.index?g.toNonIndexed():g;const p=flat.attributes.position.array.slice();if(flat!==g)flat.dispose();return p;};
 function signature(){return JSON.stringify(stagePieces('figures').filter(e.layerVisible).map(m=>{const p=m.geometry.attributes.position;return [m.studioId,p.count,...Array.from({length:12},(_,i)=>p.array[Math.floor(i*(p.array.length-1)/11)]),...m.position.toArray(),...m.quaternion.toArray(),...m.scale.toArray()];}));}
 function geometry(positions,layout=false){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));if(layout)g.userData.quadLayout=layout;g.computeVertexNormals();g.computeBoundingBox();return g;}
 function say(text){message=text;$('#workflowStatus').textContent=text;}
 function restore(state){active=(names.includes(state?.active)||state?.active==='resolution')?state.active:'figures';lastUI='';update();}
 function refreshVisibility(){for(const m of e.pieces())m.visible=inStage(m)&&e.layerVisible(m)&&!e.split()?.isSuppressed(m);}
 function selectContent(){e.select(stagePieces().filter(e.canEdit));}
 function update(){
  refreshVisibility();const current=stagePieces(),key=JSON.stringify([active,e.isBusy(),current.map(m=>[m.studioId,m.geometry.uuid,e.locked(m),e.layerVisible(m)])]);
  if(key===lastUI)return;lastUI=key;tabs.querySelectorAll('button').forEach(b=>{const on=b.dataset.stage===active;b.classList.toggle('active',on);b.setAttribute('aria-selected',on);b.disabled=e.isBusy();});
  $('.canvas-title .eyebrow').textContent=active==='figures'?'FIGURE FIELD':active==='project'?'PROJECT MESH':'RESOLUTION STUDY';$('.canvas-title p').textContent=active==='figures'?'KITBASHING WORKSPACE':active==='project'?'CLOSED COMBINED GEOMETRY':'QUADRANGULAR MESH DENSITY';
  $('#buildProject').hidden=active==='resolution';$('#buildProject').textContent=active==='figures'?'Build Project from Figures':'Update Project from Figures';$('#sendResolution').hidden=true;
  for(const b of bar.querySelectorAll('button:not(#cancelWorkflow)'))b.disabled=e.isBusy();$('#cancelWorkflow').hidden=!worker;
  $('#workflowStatus').textContent=active==='resolution'?'':message;
  bar.hidden=['resolution','iterations','floor-plates'].includes(active);
 }
 async function switchTo(name){if(!names.includes(name)&&name!=='resolution')return;
  if(e.isBusy()||e.split()?.active)return e.say('Finish or cancel the current operation first.');if(name===active)return;
  // Figures and Resolution share the same meshes and camera.
  if((active==='figures'&&name==='resolution')||(active==='resolution'&&name==='figures')){
   active=name;
   lastUI='';
   e.cad().cancel();e.cad().leavePlane();update();e.select(e.selection());
   return;
  }
  e.cad().cancel();e.cad().leavePlane();e.select([]);active=name;lastUI='';update();if(name!=='floor-plates')selectContent();e.refresh();
  if(name==='project'&&!stagePieces('project').filter(m=>!m.userData.isMass).length&&stagePieces('figures').length)await buildProject();
  if(active==='project'&&stagePieces('project').filter(m=>!m.userData.isMass).length){const project=stagePieces('project').filter(m=>!m.userData.isMass)[0],outdated=project.userData.sourceSignature!==signature();say(outdated?'Figures changed. Update Project when you want to bring those edits across.':project.userData.projectReconstructed?'Closed Project was rebuilt to repair invalid surfaces. Review details and dimensions; source Figures are preserved.':'Closed Project mesh · source Figures remain editable in their tab.');}
  e.fit();
 }
 function replace(stage){e.select([]);for(const m of stagePieces(stage).filter(m=>!m.userData.isMass)){e.pieces().splice(e.pieces().indexOf(m),1);m.removeFromParent();m.geometry.dispose();m.material.dispose();}}
 async function run(url,data,transfers=[]){const token=++job;worker=new Worker(url,{type:'module'});e.busy(true);lastUI='';update();try{return await new Promise((resolve,reject)=>{rejectJob=reject;worker.onmessage=ev=>{if(token!==job)return;const d=ev.data;if(d.type==='progress')return say(d.text);if(d.error)reject(Error(d.error));else resolve(d);};worker.onerror=()=>reject(Error('The geometry operation could not complete. Your existing meshes are unchanged.'));worker.postMessage(data,transfers);});}finally{worker?.terminate();worker=null;rejectJob=null;e.busy(false);lastUI='';update();}}
 async function buildProject(){
  if(e.isBusy()||e.split()?.active)return;if(stagePieces('project').filter(m=>!m.userData.isMass).some(e.locked))return e.say('Unlock Project objects before replacing them.');const sources=stagePieces('figures').filter(e.layerVisible);if(!sources.length)return e.say('Add visible objects in Figures first.');
  const sourceKey=signature(),meshes=sources.map(m=>{m.updateMatrixWorld(true);const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld),positions=pack(g);g.dispose();return {positions,name:m.name};}),bounds=new T.Box3();sources.forEach(m=>bounds.expandByObject(m));const scale=Math.max(bounds.getSize(new T.Vector3()).length(),1e-6);
  try{
   say('Combining visible Figures and closing the Project mesh…');const result=await run('./repair-worker.js',{meshes,action:'repair',options:{method:'auto',tolerance:Math.max(scale*1e-7,1e-6),minWall:Math.max(scale/500,.05),resolution:96,shell:true}},meshes.map(m=>m.positions.buffer));
   e.checkpoint();replace('project');const g=geometry(result.positions),m=e.add({geometry:g,name:'Project · combined figures',offset:new T.Vector3(),stage:'project'});g.dispose();m.userData.sourceSignature=sourceKey;m.userData.projectClosed=true;m.userData.projectReconstructed=!!result.report?.usedReconstruction;e.select([]);active=active==='figures'?'project':active;lastUI='';update();selectContent();e.refresh();e.mark(stagePieces());e.fit();
   say(result.report?.usedReconstruction?'Closed Project created using surface reconstruction. Review fine details and dimensions before exporting.':'Closed Project created · overlapping solids fused; separate enclosed shells grouped in one mesh.');
  }catch(error){say(error.message);e.say(error.message);}
 }
 $('#buildProject').onclick=buildProject;$('#sendResolution').onclick=()=>switchTo('resolution');
 $('#cancelWorkflow').onclick=()=>{if(!worker)return;job++;worker.terminate();rejectJob?.(Error('Operation cancelled. Existing meshes are unchanged.'));};
 return {switchTo,buildProject,update,inStage,stageOf,stagePieces,save:()=>({active}),restore,get active(){return active;},count};
}




