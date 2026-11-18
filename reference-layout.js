import * as T from './three.js';
export function installReferenceLayout(e){
 const {$,scene,camera,renderer,orbit,transform,grid}=e,workspace=$('.workspace'),library=$('.library'),inspector=$('.inspector'),main=$('main');
 const outline=()=>'<svg class="panel-outline" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path d="M1 1 H70 L85 18 H985 L999 35 V965 L970 999 H1 Z" fill="none" stroke="#15cbd7" vector-effect="non-scaling-stroke"/></svg>';
 renderer.setClearColor(0x000000);const dock=document.createElement('aside');dock.className='reference-dock';main.append(dock);const plan=document.createElement('section');plan.className='plan-panel';plan.innerHTML=outline()+'<div class="panel-heading"><div class="projection-tabs" role="tablist" aria-label="Orthographic view"><button id="planTop" role="tab" aria-selected="true">Plan</button><button id="planElevation" role="tab" aria-selected="false">Elevation</button></div><button id="flatView" type="button" aria-pressed="false">2D</button><button id="planZoom" type="button" title="Zoom to selection">Zoom</button><button id="planFit">FIT ↗</button></div><div id="planViewport"></div><p>TOP PROJECTION · drag to pan / scroll to zoom / click to select</p>';dock.append(plan);
 const controls=document.createElement('section');controls.className='reference-controls';controls.innerHTML=outline()+'<div class="panel-heading"><span>CONTROL PANEL</span><small>03</small></div><div class="panel-tabs"><button id="tabFigures" class="active">01 / FIGURES</button><button id="tabProperties">02 / PROPERTIES</button></div><div class="control-content"></div>';dock.append(controls);controls.querySelector('.control-content').append(library,inspector);
 function tab(which){const figures=which==='figures';library.hidden=!figures;inspector.hidden=which!=='properties';$('#tabFigures').classList.toggle('active',figures);$('#tabProperties').classList.toggle('active',which==='properties');}
 $('#tabFigures').onclick=()=>tab('figures');$('#tabProperties').onclick=()=>tab('properties');tab('figures');
 workspace.insertAdjacentHTML('afterbegin',outline());const head=$('.canvas-head'),undoGroup=$('#undo').parentElement,actions=$('#fit').parentElement;head.replaceChildren();const title=document.createElement('div');title.className='view-label';title.innerHTML='<i></i>PERSPECTIVE <small>01 / LIVE GEOMETRY</small>';head.append(title,undoGroup,actions);const auto=document.createElement('button');auto.textContent='AUTO ROTATE';auto.id='autoRotate';auto.onclick=()=>{orbit.autoRotate=!orbit.autoRotate;auto.classList.toggle('active',orbit.autoRotate);};actions.append(auto);const wire=document.createElement('button');wire.textContent='WIRE';wire.onclick=()=>$('#wire').click();actions.append(wire);
 const toolbar=document.createElement('div');toolbar.className='reference-toolbar';const tools=$('.tools');toolbar.append(tools);head.after(toolbar);function action(label,fn){const b=document.createElement('button');b.textContent=label;b.onclick=fn;toolbar.append(b);return b;}
 action('ORBIT',()=>{orbit.autoRotate=false;auto.classList.remove('active');});action('ALIGN FACES',()=>e.cad().execute('Align'));action('MIRROR',()=>$('#mirror').click());action('MOVE CLIP',()=>e.cad().execute('MoveClippingPlane'));action('ROTATE CLIP',()=>e.cad().execute('RotateClippingPlane'));action('CLIP OFF',()=>e.cad().execute('DisableClippingPlane'));action('CLIPPING PLANE',()=>e.cad().execute('ClippingPlane'));
 const alignment=document.createElement('div');alignment.className='alignment-strip';alignment.append($('#alignPrompt'),$('#alignFaces'));toolbar.after(alignment);
 $('.canvas-title').innerHTML='<span class="eyebrow">FIGURE FIELD</span><p>KITBASHING WORKSPACE</p>';
 library.querySelector('.eyebrow').textContent='01 / FIGURE LIBRARY';library.querySelector('h2').firstChild.textContent='FEATURE COLLECTION ';$('.inspector .section>.eyebrow').textContent='02 / MODEL CONTROLS';$('.inspector h2').textContent='OBJECT PROPERTIES';
 const flatButton=document.querySelector('#flatView');
 let previousCamera=null,program=false,wasFlat=false,floor=false,axonometric=false,floorPlan=false;
 const views=document.createElement('div');
 views.className='projection-tabs floor-views';views.setAttribute('role','tablist');views.setAttribute('aria-label','Floor plates view');
 for(const [label,axon] of [['Perspective','perspective'],['Axonometric','axon'],['2D Plan','plan']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','tab');
  button.onclick=()=>{floorPlan=axon==='plan';axonometric=axon==='axon';orientFloor();};views.append(button);
 }
 views.hidden=true;title.after(views);
 function orientFloor(){
  const distance=Math.max(.01,camera.position.distanceTo(orbit.target));
  camera.up.set(0,floorPlan?0:1,floorPlan?-1:0);orbit.enableRotate=!floorPlan;
  if(floorPlan){orbit.autoRotate=false;auto.classList.remove('active');}
  const direction=floorPlan?new T.Vector3(0,1,0):new T.Vector3(1,axonometric?1:.65,1).normalize();
  camera.position.copy(orbit.target).addScaledVector(direction,distance);
  orbit.update();e.fit();
  [...views.children].forEach((button,i)=>button.setAttribute('aria-selected',String(i===(floorPlan?2:Number(axonometric)))));
 }
 function setFlat(enabled){
  if(enabled===!!previousCamera)return;
  if(enabled){
   previousCamera={offset:camera.position.clone().sub(orbit.target),autoRotate:orbit.autoRotate};
   orbit.autoRotate=false;
   camera.up.set(0,1,0);
   camera.position.copy(orbit.target).add(new T.Vector3(0,0,Math.max(previousCamera.offset.length(),.1)));
  }else{
   camera.position.copy(orbit.target).add(previousCamera.offset);
   orbit.autoRotate=previousCamera.autoRotate;
   previousCamera=null;
  }
  orbit.enableRotate=!enabled;
  document.querySelector('#autoRotate').disabled=enabled;
  flatButton.setAttribute('aria-pressed',String(enabled));
  orbit.update();
 }
 flatButton.onclick=()=>setFlat(!previousCamera);
 const planView=$('#planViewport'),planRenderer=new T.WebGLRenderer({antialias:true,alpha:false,stencil:true});planRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));planRenderer.setClearColor(0x000000);planRenderer.localClippingEnabled=true;planView.append(planRenderer.domElement);const planCamera=new T.OrthographicCamera(-25,25,25,-25,.01,1000000);let elevation=false;for(const [id,front] of [['#planTop',false],['#planElevation',true]]){ document.querySelector(id).onclick=()=>{if(elevation===front)return;elevation=front;zoom=1;pan.set(0,0);planDown=null;document.querySelector('#planTop').setAttribute('aria-selected',String(!front));document.querySelector('#planElevation').setAttribute('aria-selected',String(front));plan.querySelector('p').textContent=(front?'FRONT PROJECTION':'TOP PROJECTION')+' · drag to pan / scroll to zoom / click to select';};}let zoom=1,pan=new T.Vector2(),frames=0,planDown=null;const bounds=new T.Box3(),boundary=new T.Box3Helper(bounds,0x165761);scene.add(boundary);grid.visible=false;
 const resize=new ResizeObserver(()=>{planRenderer.setSize(Math.max(1,planView.clientWidth),Math.max(1,planView.clientHeight));});resize.observe(planView);
 $('#planZoom').onclick=()=>{
  const visible=e.pieces(),selected=e.selection().filter(mesh=>visible.includes(mesh));
  if(!selected.length)return e.say('Select an object to zoom in.');
  const target=new T.Box3(),overall=new T.Box3();
  for(const mesh of selected)target.expandByObject(mesh);
  for(const mesh of e.boundsPieces())overall.expandByObject(mesh);
  if(target.isEmpty()||overall.isEmpty())return;
  const aspect=Math.max(.2,planView.clientWidth/Math.max(1,planView.clientHeight));
  const extent=box=>{const size=box.getSize(new T.Vector3());return Math.max(size.x/aspect,elevation?size.y:size.z,.001);};
  const offset=target.getCenter(new T.Vector3()).sub(overall.getCenter(new T.Vector3()));
  zoom=extent(overall)/extent(target);
  pan.set(offset.x,elevation?offset.y:-offset.z);
 };
 $('#planFit').onclick=()=>{zoom=1;pan.set(0,0);};planRenderer.domElement.addEventListener('wheel',ev=>{ev.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(-ev.deltaY*.001),.05,Math.max(20,zoom));},{passive:false});
 planRenderer.domElement.addEventListener('pointerdown',ev=>{if(e.blocked?.())return;planDown={x:ev.clientX,y:ev.clientY,pan:pan.clone()};planRenderer.domElement.setPointerCapture(ev.pointerId);});planRenderer.domElement.addEventListener('pointermove',ev=>{if(!planDown)return;pan.x=planDown.pan.x-(ev.clientX-planDown.x)*(planCamera.right-planCamera.left)/Math.max(1,planView.clientWidth);pan.y=planDown.pan.y-(ev.clientY-planDown.y)*(planCamera.top-planCamera.bottom)/Math.max(1,planView.clientHeight);});planRenderer.domElement.addEventListener('pointerup',ev=>{if(!planDown)return;const down=planDown;planDown=null;if(Math.hypot(ev.clientX-down.x,ev.clientY-down.y)>4)return;const r=planRenderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((ev.clientX-r.left)/r.width*2-1,-(ev.clientY-r.top)/r.height*2+1),planCamera);const hit=ray.intersectObjects(e.pieces(),false)[0];if(hit){if(e.cad().interceptsPointer)e.cad().acceptObject(hit.object);else e.select([hit.object]);}});
 return {tab,get flat(){return !!previousCamera;},get axonometric(){return axonometric;},get floorPlan(){return floorPlan;},planRenderer,planCamera,update(){const on=e.program();if(on!==program){program=on;if(on)wasFlat=!!previousCamera;if(e.site3D?.()){previousCamera=null;orbit.enableRotate=true;}else setFlat(on||wasFlat);flatButton.disabled=on;flatButton.textContent=on?'Plan':'2D';$('#planTop').hidden=on;$('#planElevation').hidden=on;$(on?'#planElevation':'#planTop').click();title.innerHTML=on?'<i></i>2D / XY':'<i></i>PERSPECTIVE';}const inFloor=e.floor();if(inFloor!==floor){floor=inFloor;views.hidden=!floor;title.hidden=floor;if(floor){setFlat(false);orientFloor();}else{camera.up.set(0,1,0);orbit.enableRotate=!previousCamera;}}if(floor&&floorPlan){const distance=Math.max(.01,camera.position.distanceTo(orbit.target));camera.up.set(0,0,-1);camera.position.copy(orbit.target).add(new T.Vector3(0,distance,0));camera.lookAt(orbit.target);orbit.enableRotate=false;orbit.autoRotate=false;}if(e.site3D?.()){previousCamera=null;camera.up.set(0,0,1);orbit.enableRotate=true;orbit.autoRotate=false;}if(previousCamera){const distance=camera.position.distanceTo(orbit.target);camera.position.copy(orbit.target).add(new T.Vector3(0,0,distance));camera.lookAt(orbit.target);}if(e.site3D?.()&&e.cameraMoving?.())return;bounds.makeEmpty();for(const m of (e.boundsPieces?.()||e.pieces())){m.updateMatrixWorld(true);bounds.union((m.geometry.boundingBox||new T.Box3().setFromBufferAttribute(m.geometry.attributes.position)).clone().applyMatrix4(m.matrixWorld));}boundary.visible=scene.userData.showBoundingBoxes!==false&&!bounds.isEmpty();if(++frames%(e.site3D?.()?12:4))return;const b=bounds.isEmpty()?new T.Box3(new T.Vector3(-10,-10,-10),new T.Vector3(10,10,10)):bounds,center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),aspect=Math.max(.2,planView.clientWidth/Math.max(1,planView.clientHeight)),half=Math.max(size.x/aspect,elevation?size.y:size.z,.001)*.58/zoom;planCamera.left=-half*aspect;planCamera.right=half*aspect;planCamera.top=half;planCamera.bottom=-half;planCamera.far=Math.max(size.length()*20,1000);const depth=Math.max(size.length()*3,100);const focus=new T.Vector3(center.x+pan.x,center.y+(elevation?pan.y:0),center.z+(elevation?0:-pan.y));planCamera.up.set(0,elevation?1:0,elevation?0:-1);planCamera.position.copy(focus);if(elevation)planCamera.position.z+=depth;else planCamera.position.y+=depth;planCamera.lookAt(focus);planCamera.updateProjectionMatrix();const helpers=[transform.getHelper(),e.cad().control.getHelper(),e.splitControl?.()?.getHelper()].filter(Boolean),visible=helpers.map(h=>h.visible);helpers.forEach(h=>h.visible=false);planRenderer.render(scene,planCamera);helpers.forEach((h,i)=>h.visible=visible[i]);}};
}


