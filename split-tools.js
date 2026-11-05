import * as T from './three.js';
import {TransformControls} from './TransformControls.js';
import {estimateSplit,describeShape} from './shape-features.js';
import {quadEdges} from './quad-mesh.js';

export function installSplit(e){
 const {$,scene,camera,renderer,orbit,transform}=e,root=new T.Group(),control=new TransformControls(camera,renderer.domElement);
 scene.add(root,control.getHelper());control.setSize(.8);control.setSpace('local');
 let active=false,sources=[],previous=[],signature='',level=1,frame=new T.Matrix4(),settings=null,guides=[],preview=[],report=null,worker=null,generation=0,waiting=false,guideKey='neck',previewValid=false,loading=false,rejectPreview=null;
 const panel=document.createElement('section');panel.className='split-panel';panel.hidden=true;panel.innerHTML=`
 <div class="split-title"><span>SPLIT <small>/ CLOSED QUAD PARTS</small></span><button id="cancelSplit" aria-label="Cancel Split">×</button></div>
 <p id="splitPrompt" class="hint">Choose a split level.</p>
 <div class="split-levels"><button id="splitLevel1" data-split-level="1">LEVEL 1 <small>Head · Body</small></button><button id="splitLevel2" data-split-level="2">LEVEL 2 <small>Head · Body · Limbs · Accessories</small></button></div>
 <div id="splitSettings"><div class="split-field"><label for="splitUp">Figure up axis</label><select id="splitUp"><option value="y">Local Y</option><option value="z">Local Z</option><option value="x">Local X</option></select></div>
 <div class="split-field"><label for="splitGuide">Viewport guide</label><select id="splitGuide"><option value="neck">Head / body boundary</option><option value="hip">Body / legs boundary</option><option value="armBottom">Lower arm boundary</option><option value="halfWidth">Torso width / arms</option><option value="legCenter">Left / right legs</option><option value="accessoryBox">Accessory region</option></select></div>
 <label class="split-field" for="splitValue"><span id="splitValueLabel">Boundary</span><output id="splitValueOutput"></output></label><input id="splitValue" type="range" min="1" max="99" step="0.5">
 <div id="accessoryOptions"><label class="repair-check"><input id="splitAccessory" type="checkbox"> Extract an accessory region</label><div class="button-pair split-box-tools"><button data-split-mode="translate">Move region</button><button data-split-mode="rotate">Rotate</button><button data-split-mode="scale">Scale</button></div></div>
 <label class="repair-check"><input id="splitRepair" type="checkbox" checked> Automatically repair invalid source surfaces</label>
 <details class="split-notes"><summary>How regions are estimated</summary><p class="hint">Uses mesh profiles and the categorized shapes in your library. Y is up by default. Adjust the guides for your figure. Separate matching accessories are detected; use the accessory box for attached hats, bows or jewelry. This is a geometric proposal and needs your review.</p></details>
 <div class="button-pair"><button id="previewSplit">Preview closed parts</button><button id="applySplit" disabled>Apply Split</button></div></div>
 <p id="splitResult" role="status" class="hint"></p>`;
 $('#viewport').append(panel);const button=document.createElement('button');button.id='beginSplit';button.textContent='SPLIT';button.title='Split figures into closed quad parts';button.onclick=()=>start();$('.reference-toolbar').insertBefore(button,$('.reference-toolbar').children[2]);
 const sourceSignature=()=>sources.map(m=>{m.updateMatrixWorld(true);return [m.studioId,m.geometry.uuid,...m.matrixWorld.elements].join(',');}).join('|');
 const references=()=>e.assets().map(a=>({name:a.name,category:a.folderId,shape:describeShape(a.geometry)}));
 const release=o=>{o.traverse(c=>{c.geometry?.dispose();if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material?.dispose();});o.removeFromParent();};
 const status=text=>{$('#splitResult').textContent=text;};
 function clearPreview(){preview.splice(0).forEach(release);previewValid=false;report=null;$('#applySplit').disabled=true;for(const m of sources)m.visible=e.isLayerVisible(m);}
 function invalidate(){generation++;rejectPreview?.(Error('Split preview cancelled.'));rejectPreview=null;worker?.terminate();worker=null;if(loading){loading=false;e.busy(false);}$('#previewSplit').disabled=false;clearPreview();status('Guides changed. Preview again before applying.');}
 function setLevel(value){level=value;document.querySelectorAll('[data-split-level]').forEach(b=>b.classList.toggle('active',+b.dataset.splitLevel===level));if(settings){settings.level=level;invalidate();buildGuides();}$('#accessoryOptions').hidden=level!==2;for(const option of $('#splitGuide').options)option.hidden=level===1&&option.value!=='neck';if(level===1){guideKey='neck';$('#splitGuide').value='neck';}if(settings)selectGuide(guideKey);}
 function bake(){
  const orientation=new T.Quaternion();if(sources.length===1)sources[0].getWorldQuaternion(orientation);
  const axis=$('#splitUp').value,up=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0));orientation.multiply(up);
  const bounds=new T.Box3();sources.forEach(m=>bounds.expandByObject(m));frame.compose(bounds.getCenter(new T.Vector3()),orientation,new T.Vector3(1,1,1));const inverse=frame.clone().invert(),positions=[];
  for(const m of sources){m.updateMatrixWorld(true);const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld));for(const v of g.attributes.position.array)positions.push(v);g.dispose();}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeBoundingBox();const b=g.boundingBox,size=b.getSize(new T.Vector3());settings={...estimateSplit(g,references()),min:b.min.toArray(),size:size.toArray(),level,allowRepair:$('#splitRepair').checked};g.dispose();
  root.matrixAutoUpdate=false;root.matrix.copy(frame);root.updateMatrixWorld(true);signature=sourceSignature();
  $('#splitPrompt').textContent='Drag a guide handle or adjust the boundary. Preview to see separate closed parts.';
  status(settings.neckConfidence+' · '+settings.referenceCount+' library reference(s).');buildGuides();selectGuide('neck');
 }
 function chooseSources(items){sources=items.filter(m=>e.pieces().includes(m)&&e.canEdit(m));if(!sources.length)return false;waiting=false;e.select([]);transform.enabled=false;transform.detach();$('#splitSettings').hidden=false;bake();return true;}
 function start(value){
  if(e.isBusy()&&!loading)return e.say('Wait for the current operation to finish.');
  let requested=value==null||String(value).trim()===''?null:Number(String(value).replace(/^level\s*/i,''));if(requested!==null&&![1,2].includes(requested))return e.say('Use Split, Split 1 or Split 2.');
  if(active){if(requested)setLevel(requested);return;}
  e.cad().cancel();e.cad().leavePlane();active=true;waiting=true;previous=e.selection().slice();panel.hidden=false;$('#viewport').classList.add('splitting');setLevel(requested||1);$('#splitSettings').hidden=true;status('');
  if(!chooseSources(previous)){$('#splitPrompt').textContent='Select a base figure in the main viewport, then choose Level 1 or Level 2.';transform.detach();transform.enabled=false;}
  e.say('Split: choose Level 1 or Level 2, adjust the guides, then Preview.');
 }
 function cancel(){
  if(!active)return;invalidate();guides.splice(0).forEach(release);control.detach();active=waiting=false;panel.hidden=true;$('#viewport').classList.remove('splitting');transform.enabled=true;orbit.enabled=true;settings=null;const restore=previous;previous=[];sources=[];e.select(restore.filter(m=>e.pieces().includes(m)&&e.canEdit(m)));
 }
 function buildGuides(){
  control.detach();guides.splice(0).forEach(release);if(!settings)return;const min=new T.Vector3(...settings.min),size=new T.Vector3(...settings.size),center=min.clone().addScaledVector(size,.5);
  const plane=(key,normal,point,color)=>{const width=(normal.x?size.z:size.x)*1.2,height=(normal.y?size.z:size.y)*1.2,g=new T.PlaneGeometry(Math.max(width,.001),Math.max(height,.001)),m=new T.Mesh(g,new T.MeshBasicMaterial({color,transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false}));m.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);m.position.copy(point);m.userData.guideKey=key;const outline=new T.LineSegments(new T.EdgesGeometry(g),new T.LineBasicMaterial({color,transparent:true,opacity:.85}));m.add(outline);root.add(m);guides.push(m);return m;};
  plane('neck',new T.Vector3(0,1,0),center.clone().setY(min.y+size.y*settings.neck),0x21e0ed);
  if(level===2){plane('hip',new T.Vector3(0,1,0),center.clone().setY(min.y+size.y*settings.hip),0xdc24f4);plane('armBottom',new T.Vector3(0,1,0),center.clone().setY(min.y+size.y*settings.armBottom),0xff5284);for(const sign of [-1,1]){const m=plane('halfWidth',new T.Vector3(1,0,0),center.clone().setX(center.x+sign*size.x*settings.halfWidth),0xff5284);m.userData.sign=sign;}plane('legCenter',new T.Vector3(1,0,0),center.clone().setX(min.x+size.x*settings.legCenter),0xdc24f4);
   const box=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xdc24f4,transparent:true,opacity:.1,depthWrite:false}));box.position.fromArray(settings.accessoryCenter);box.scale.fromArray(settings.accessorySize);if(settings.accessoryQuaternion)box.quaternion.fromArray(settings.accessoryQuaternion);box.userData.guideKey='accessoryBox';const line=new T.LineSegments(new T.EdgesGeometry(box.geometry),new T.LineBasicMaterial({color:0xdc24f4}));box.add(line);box.visible=settings.accessory;root.add(box);guides.push(box);
  }
 }
 function selectGuide(key){
  if(!settings)return;guideKey=key;$('#splitGuide').value=key;const box=key==='accessoryBox',m=guides.find(g=>g.userData.guideKey===key);if(box&&!settings.accessory){$('#splitAccessory').checked=true;settings.accessory=true;if(m)m.visible=true;invalidate();}
  control.setMode('translate');control.showX=control.showY=control.showZ=box;if(!box)control.showZ=true;
  if(m){control.attach(m);m.material.opacity=.25;}guides.forEach(g=>{if(g!==m)g.material.opacity=.09;});$('#splitValue').hidden=box;$('#splitValueLabel').parentElement.hidden=box;syncValue();
 }
 function syncValue(){if(!settings)return;const value=settings[guideKey];$('#splitValue').min=guideKey==='halfWidth'?'5':'1';$('#splitValue').max=guideKey==='halfWidth'?'49':'99';$('#splitValue').value=(value||0)*100;$('#splitValueOutput').textContent=((value||0)*100).toFixed(1)+'%';$('#splitValueLabel').textContent=$('#splitGuide').selectedOptions[0]?.textContent||'Boundary';}
 function clampSettings(){settings.neck=T.MathUtils.clamp(settings.neck,.1,.98);settings.hip=T.MathUtils.clamp(settings.hip,.01,settings.neck-.01);settings.armBottom=T.MathUtils.clamp(settings.armBottom,.01,settings.neck-.01);settings.halfWidth=T.MathUtils.clamp(settings.halfWidth,.05,.49);settings.legCenter=T.MathUtils.clamp(settings.legCenter,.01,.99);}
 control.addEventListener('dragging-changed',ev=>orbit.enabled=!ev.value);
 control.addEventListener('mouseDown',invalidate);
 control.addEventListener('objectChange',()=>{
  if(!active||!control.object||!settings)return;const m=control.object,key=m.userData.guideKey,min=settings.min,size=settings.size;
  if(key==='accessoryBox'){settings.accessoryCenter=m.position.toArray();settings.accessorySize=m.scale.toArray().map(Math.abs);settings.accessoryQuaternion=m.quaternion.toArray();}
  else{settings[key]=key==='halfWidth'?Math.abs(m.position.x-(min[0]+size[0]/2))/size[0]:key==='legCenter'?(m.position.x-min[0])/size[0]:(m.position.y-min[1])/size[1];clampSettings();syncValue();}
  previewValid=false;$('#applySplit').disabled=true;
 });
 control.addEventListener('mouseUp',()=>{if(!settings)return;buildGuides();selectGuide(guideKey);});
 function workerSettings(){const box=guides.find(g=>g.userData.guideKey==='accessoryBox');return {...settings,level,allowRepair:$('#splitRepair').checked,accessoryBox:box?{center:box.position.toArray(),size:box.scale.toArray().map(Math.abs),quaternion:box.quaternion.toArray()}:null};}
 async function makePreview(){
  if(!active||waiting||loading)return;if(sources.some(m=>!e.canEdit(m))||signature!==sourceSignature())return cancel();
  invalidate();loading=true;e.busy(true);control.detach();$('#previewSplit').disabled=true;const token=generation;status('Building closed parts…');
  try{
   const inverse=frame.clone().invert(),meshes=sources.map(m=>{m.updateMatrixWorld(true);const g=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld)),positions=g.attributes.position.array.slice();g.dispose();return {positions,name:m.name,category:m.userData.featureCategory};});
   worker=new Worker('./split-worker.js',{type:'module'});const result=await new Promise((resolve,reject)=>{rejectPreview=reject;worker.onmessage=ev=>{const data=ev.data;if(data.type==='progress')status(data.text);else if(data.type==='error')reject(Error(data.error));else resolve(data);};worker.onerror=()=>reject(Error('Split could not start. Reload and try again.'));worker.postMessage({meshes,settings:workerSettings(),references:references()},meshes.map(m=>m.positions.buffer));});
   if(!active||token!==generation)return;
   report=result.report;result.parts.forEach((part,i)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(part.positions,3));g.computeVertexNormals();g.computeBoundingBox();const palette={heads:0x21e0ed,body:0x2789a1,appendages:i%2?0xff5284:0xdc24f4,accessories:0xffbf6b},mesh=new T.Mesh(g,new T.MeshStandardMaterial({color:palette[part.category],roughness:.38,metalness:.16}));mesh.userData={splitPart:part.name,category:part.category,volume:part.volume};root.add(mesh);preview.push(mesh);});
   sources.forEach(m=>m.visible=false);previewValid=true;$('#applySplit').disabled=false;
   const names=result.parts.map(p=>p.name).join(' · ');status(result.parts.length+' closed parts: '+names+'.'+(report.reconstructed?' Source was rebuilt; review the shape and dimensions before applying.':report.repaired?' Seams and openings were repaired.':' Original surfaces retained; new cuts are capped.')+' Exported faces are quads.');
  }catch(error){if(token===generation){status(error.message);e.say(error.message);}}
  finally{if(token===generation){rejectPreview=null;worker?.terminate();worker=null;loading=false;e.busy(false);$('#previewSplit').disabled=false;if(active&&settings)selectGuide(guideKey);}}
 }
 function apply(){
  if(!previewValid||loading||sources.some(m=>!e.canEdit(m))||signature!==sourceSignature())return status('Sources changed. Cancel and start a fresh Split.');
  const results=preview.map(m=>({geometry:m.geometry.clone(),name:m.userData.splitPart,category:m.userData.category,color:m.material.color.getHex()})),baseName=sources[0].name,parent=sources[0].userData.layerId,originals=sources.slice();
  originals.forEach(m=>m.visible=e.isLayerVisible(m));e.select(originals);e.checkpoint();const splitLayer=e.createLayers(baseName,parent,[...new Set(results.map(r=>r.category))]);
  cancel();e.select([]);for(const m of originals){scene.remove(m);e.pieces().splice(e.pieces().indexOf(m),1);m.geometry.dispose();m.material.dispose();}
  const q=new T.Quaternion().setFromRotationMatrix(frame),output=results.map(r=>{const m=e.add({geometry:r.geometry,name:baseName+' · '+r.name,offset:new T.Vector3().setFromMatrixPosition(frame),folderId:r.category,layerId:splitLayer[r.category]});m.quaternion.copy(q);m.material.color.setHex(r.color);m.userData.closedQuad=true;r.geometry.dispose();return m;});
  e.select(output);e.mark(output);e.say('Split applied · '+output.length+' closed quad parts. Undo restores the originals.');
 }
 $('#cancelSplit').onclick=cancel;$('#splitLevel1').onclick=()=>setLevel(1);$('#splitLevel2').onclick=()=>setLevel(2);$('#splitGuide').onchange=ev=>selectGuide(ev.target.value);$('#splitUp').onchange=()=>{invalidate();bake();};
 $('#splitValue').oninput=ev=>{if(!settings)return;invalidate();settings[guideKey]=Number(ev.target.value)/100;clampSettings();buildGuides();selectGuide(guideKey);};
 $('#splitAccessory').onchange=ev=>{if(!settings)return;settings.accessory=ev.target.checked;invalidate();buildGuides();selectGuide(settings.accessory?'accessoryBox':'neck');};$('#splitRepair').onchange=invalidate;
 for(const b of panel.querySelectorAll('[data-split-mode]'))b.onclick=()=>{selectGuide('accessoryBox');control.setMode(b.dataset.splitMode);control.showX=control.showY=control.showZ=true;};
 $('#previewSplit').onclick=makePreview;$('#applySplit').onclick=apply;
 renderer.domElement.addEventListener('pointerdown',ev=>{
  if(!active||loading||ev.button!==0||control.axis)return;const r=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((ev.clientX-r.left)/r.width*2-1,-(ev.clientY-r.top)/r.height*2+1),camera);
  if(waiting){const hit=ray.intersectObjects(e.pieces().filter(e.canEdit),false)[0];if(hit){ev.preventDefault();ev.stopImmediatePropagation();chooseSources([hit.object]);}return;}
  const hit=ray.intersectObjects(guides.filter(g=>g.visible),false)[0];if(hit)selectGuide(hit.object.userData.guideKey);
 },true);
 document.addEventListener('keydown',ev=>{if(!active||ev.key!=='Escape')return;ev.preventDefault();ev.stopImmediatePropagation();cancel();},true);
 return {start,cancel,preview:makePreview,apply,get active(){return active;},get loading(){return loading;},get settings(){return settings;},get previewParts(){return preview;},control,isSuppressed:m=>active&&previewValid&&sources.includes(m),update(){if(!active)return;if(sources.some(m=>!e.pieces().includes(m)||!e.canEdit(m))||(!waiting&&sourceSignature()!==signature)){cancel();e.say('Split cancelled because a source changed.');}if(active){transform.enabled=false;transform.detach();for(const m of preview){if(e.wire()&&!m.userData.wire){const line=new T.LineSegments(quadEdges(m.geometry),new T.LineBasicMaterial({color:m.material.color}));m.add(line);m.userData.wire=line;}m.material.visible=!e.wire();if(m.userData.wire)m.userData.wire.visible=e.wire();}}}};
}
