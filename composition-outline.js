import * as T from './three.js';

export function installOutline(e,panel){
 const section=document.createElement('section');
 section.innerHTML='<h3>Composition outline</h3><label class="field-label" for="outlineDetail">Outline detail <output id="outlinePercent">100%</output></label><input type="range" id="outlineDetail" min="0" max="100" value="100"><label class="field-label" for="outlineCurvature">Curvature <output id="outlineCurvatureValue">50%</output></label><input type="range" id="outlineCurvature" min="0" max="100" value="50"><div class="range-labels"><span>Sharp</span><span>Curved</span></div><button type="button" id="drawOutline">Draw</button><button type="button" id="outlineMode" aria-pressed="false">Outline mode · Combined</button><button type="button" id="bakeOutline" disabled>Bake</button><p class="hint" role="status"></p>';
 panel.append(section);
 const viewport=e.$('#viewport'),overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
 Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2'});
 overlay.hidden=true;
 viewport.append(overlay);
 const slider=section.querySelector('input'),status=section.querySelector('p');
 const curvature=section.querySelector('#outlineCurvature');
 const bake=section.querySelector("#bakeOutline");
 const mode=section.querySelector('#outlineMode');
 let loops=[],width=0,height=0,projection=null,depth=0,each=false,overall=[];
 const tolerance=()=>0.6+(1-Number(slider.value)/100)**2*Math.min(width,height)*0.055;
 const contours=(source=loops)=>source.map(loop=>simplifyContour(loop,tolerance()));
 function paint(){
  if(overlay.hidden)return;
  overlay.setAttribute('viewBox','0 0 '+width+' '+height);
  const path=document.createElementNS(overlay.namespaceURI,'path');
  path.setAttribute('d',contours().map(loop=>'M'+loop.map(point=>point.join(',')).join(' L')+' Z').join(' '));
  path.setAttribute('fill','none');path.setAttribute('stroke',each?'#dc24f4':'#80ddff');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linejoin','round');overlay.replaceChildren(path);
 }
 slider.oninput=()=>{section.querySelector('#outlinePercent').textContent=slider.value+'%';paint();};
 curvature.oninput=()=>{section.querySelector('#outlineCurvatureValue').textContent=curvature.value+'%';};
 function clear(){if(overlay.hidden)return;overlay.hidden=true;overlay.style.display='none';overlay.replaceChildren();loops=[];projection=null;bake.disabled=true;status.textContent='';}
 e.orbit.addEventListener('change',clear);
 new ResizeObserver(clear).observe(viewport);
 function draw(){
  if(e.isBusy())return;
  const selected=e.selection().filter(m=>m.visible&&e.workflow().inStage(m));
  if(!selected.length){clear();status.textContent='Select one or more visible objects first.';return;}
  width=Math.max(1,Math.min(1400,viewport.clientWidth));height=Math.max(1,Math.round(width*viewport.clientHeight/Math.max(1,viewport.clientWidth)));
  const camera=e.camera;projection=camera.clone();projection.updateMatrixWorld(true);
  depth=selected.reduce((max,m)=>Math.max(max,new T.Box3().setFromObject(m).max.z),-Infinity);
  const meshes=selected.filter(m=>m.isMesh);
  const mask=new T.Scene(),material=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});
  for(const mesh of meshes){
   mesh.updateWorldMatrix(true,false);
   const copy=new T.Mesh(mesh.geometry,material);
   copy.matrixAutoUpdate=false;copy.matrix.copy(mesh.matrixWorld);mask.add(copy);
  }
  const target=new T.WebGLRenderTarget(width,height),pixels=new Uint8Array(width*height*4),renderer=e.renderer;
  const previousTarget=renderer.getRenderTarget(),color=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
  function trace(){
   renderer.clear();renderer.render(mask,camera);
   renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
   return traceMask(pixels,width,height);
  }
  loops=[];overall=[];
  try{
   if(meshes.length){
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);
    if(each){
     overall=trace();
     for(const copy of mask.children)copy.visible=false;
     for(const copy of mask.children){copy.visible=true;loops.push(...trace());copy.visible=false;}
    }else loops=trace();
   }
  }finally{
   renderer.setRenderTarget(previousTarget);renderer.setClearColor(color,alpha);target.dispose();material.dispose();
  }
  for(const line of selected.filter(m=>m.isLine)){
   line.updateWorldMatrix(true,false);
   const points=line.geometry.attributes.position;
   let contour=[];
   for(let i=0;i<points.count;i+=2){
    const start=new T.Vector3().fromBufferAttribute(points,i);
    const end=new T.Vector3().fromBufferAttribute(points,i+1);
    const projected=start.clone().applyMatrix4(line.matrixWorld).project(camera);
    contour.push([(projected.x+1)*width/2,(1-projected.y)*height/2]);
    const next=new T.Vector3().fromBufferAttribute(points,(i+2)%points.count);
    if(!end.equals(next)||i+2===points.count){if(contour.length>=3){loops.push(contour);if(each)overall.push(contour);}contour=[];}
   }
  }
  overlay.hidden=!loops.length;overlay.style.display=loops.length?'block':'none';
  paint();bake.disabled=!loops.length;
  status.textContent=loops.length?'Outline drawn from the selection.':'No edges are visible.';
 }
 section.querySelector('#drawOutline').onclick=draw;
 mode.onclick=()=>{
  each=!each;
  mode.textContent=each?'Outline mode · Individual':'Outline mode · Combined';
  mode.setAttribute('aria-pressed',String(each));
  if(!overlay.hidden)draw();
 };
 bake.onclick=()=>{
  if(!projection||!loops.length||e.isBusy()||e.workflow().active!=='resolution')return;
  const pixel=(projection.top-projection.bottom)/height;
  e.checkpoint();
  function bakePaths(source,color,name,clipped=false){
  const paths=(clipped?clipPaths(contours(source),contours(overall)):contours(source)).map(loop=>loop.map(([x,y])=>{
   const point=new T.Vector3(x/width*2-1,1-y/height*2,0).unproject(projection);
   return new T.Vector2(point.x,point.y);
  }));
  if(!paths.length)return null;
  const geometry=outlineGeometry(paths,clipped);
  geometry.computeBoundingBox();
  const center=geometry.boundingBox.getCenter(new T.Vector3());
  geometry.translate(-center.x,-center.y,0);
  geometry.computeBoundingBox();
  const mesh=e.add({geometry,name,offset:new T.Vector3(center.x,center.y,depth+pixel*3),stage:'program-outline',curve:true});
  geometry.dispose();
  if(!clipped)mesh.userData.outlineCorners=paths.map(path=>path.map(point=>[point.x-center.x,point.y-center.y,0]));
  mesh.material.color.setHex(color);
  return mesh;
  }
  const baked=[bakePaths(loops,each?0xdc24f4:0x80ddff,each?"Individual outlines":"Baked outline",each)].filter(Boolean);
  if(each&&overall.length)baked.push(bakePaths(overall,0x80ddff,"Overall outline"));
  if(baked.length>1){const id=crypto.randomUUID();for(const mesh of baked)mesh.userData.groupId=id;}
  e.select(baked);e.mark(baked);
  clear();
  status.textContent='Outline baked. Drag its handles to move it in XY.';
 };
 const handles=document.createElementNS(overlay.namespaceURI,'svg');
 Object.assign(handles.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'3'});
 viewport.append(handles);
 let handleKey='';
 function updateHandles(){
  const selected=e.selection().filter(mesh=>mesh.visible&&mesh.userData.outlineCorners&&e.canEdit(mesh));
  if(!selected.length){if(handleKey){handles.replaceChildren();handleKey='';}return;}
  const camera=e.camera,w=viewport.clientWidth,h=viewport.clientHeight;
  if(!w||!h)return;
  for(const mesh of selected)mesh.updateWorldMatrix(true,false);
  const key=JSON.stringify([w,h,camera.projectionMatrix.elements,camera.matrixWorld.elements,selected.map(m=>[m.uuid,m.geometry.uuid,m.matrixWorld.elements])]);
  if(key===handleKey)return;
  handleKey=key;handles.replaceChildren();
  handles.setAttribute('viewBox','0 0 '+w+' '+h);
  const projected=new T.Vector3();
  function point(mesh,corner){
   projected.set(corner[0],corner[1],0).applyMatrix4(mesh.matrixWorld).project(camera);
   return [(projected.x+1)*w/2,(1-projected.y)*h/2];
  }
  for(const mesh of selected)for(const loop of mesh.userData.outlineCorners){
   const occupied=new Set();
   loop.forEach((corner,i)=>{
    const previous=loop[(i+loop.length-1)%loop.length],next=loop[(i+1)%loop.length];
    const a=new T.Vector2(corner[0]-previous[0],corner[1]-previous[1]).normalize();
    const b=new T.Vector2(next[0]-corner[0],next[1]-corner[1]).normalize();
    if(a.dot(b)>.985)return;
    const [x,y]=point(mesh,corner);
    if(x<0||x>w||y<0||y>h)return;
    const cell=Math.floor(x/9)+','+Math.floor(y/9);
    if(occupied.has(cell))return;
    occupied.add(cell);
    const handle=document.createElementNS(handles.namespaceURI,'circle');
    handle.setAttribute('cx',x);handle.setAttribute('cy',y);handle.setAttribute('r','3.5');
    handle.setAttribute('fill',corner[2]?'#dc24f4':'#80ddff');handle.setAttribute('stroke','#041014');
    handle.style.pointerEvents='all';handle.style.cursor='crosshair';
    const title=document.createElementNS(handles.namespaceURI,'title');
    title.textContent='Double-click to fillet this corner';handle.append(title);
    handle.onpointerdown=event=>event.stopPropagation();
    handle.ondblclick=event=>{
     event.preventDefault();event.stopPropagation();
     if(e.isBusy()||!e.canEdit(mesh))return;
     e.checkpoint();
     const updated=mesh.userData.outlineCorners.map(path=>path.map(p=>p===corner?[p[0],p[1],Number(curvature.value)/100]:p));
     mesh.userData.outlineCorners=updated;
     const geometry=outlineGeometry(updated.map(path=>roundedContour(path)));
     geometry.computeBoundingBox();
     mesh.geometry.dispose();mesh.geometry=geometry;
     e.mark([mesh]);status.textContent=Number(curvature.value)?'Corner filleted.':'Corner sharpened.';
    };
    handles.append(handle);
   });
  }
 }
 return {update(){if(e.workflow().active==='resolution')updateHandles();else{clear();if(handleKey){handles.replaceChildren();handleKey='';}}}};
}

export function traceMask(pixels,width,height){
 const edges=new Map(),stride=width+1;
 const filled=(x,y)=>x>=0&&x<width&&y>=0&&y<height&&pixels[((height-1-y)*width+x)*4]>127;
 function edge(a,b){const next=edges.get(a)||[];next.push(b);edges.set(a,next);}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(!filled(x,y))continue;
  const a=y*stride+x,b=a+1,c=b+stride,d=a+stride;
  if(!filled(x,y-1))edge(a,b);
  if(!filled(x+1,y))edge(b,c);
  if(!filled(x,y+1))edge(c,d);
  if(!filled(x-1,y))edge(d,a);
 }
 const loops=[];
 while(edges.size){
  const start=edges.keys().next().value,loop=[];let vertex=start;
  do{
   loop.push([vertex%stride,Math.floor(vertex/stride)]);
   const next=edges.get(vertex);if(!next)break;
   const end=next.pop();if(!next.length)edges.delete(vertex);vertex=end;
  }while(vertex!==start);
  if(vertex===start&&loop.length>=4&&loop.reduce((area,[x,y],i)=>{const [nx,ny]=loop[(i+1)%loop.length];return area+x*ny-nx*y;},0)>0)loops.push(loop);
 }
 return loops;
}


export function simplifyContour(loop,tolerance){
 const first=loop[0];
 let split=1;
 const distance=([x,y])=>(x-first[0])**2+(y-first[1])**2;
 for(let i=2;i<loop.length;i++)if(distance(loop[i])>distance(loop[split]))split=i;
 const points=[...loop,first];
 const keep=new Set([0,split]);
 const ranges=[[0,split],[split,loop.length]];
 while(ranges.length){
  const [start,end]=ranges.pop(),[x,y]=points[start],[ex,ey]=points[end];
  const dx=ex-x,dy=ey-y,length=dx*dx+dy*dy;
  let farthest=-1,max=tolerance*tolerance;
  for(let i=start+1;i<end;i++){
   const [px,py]=points[i];
   const t=length?Math.max(0,Math.min(1,((px-x)*dx+(py-y)*dy)/length)):0;
   const error=(px-x-t*dx)**2+(py-y-t*dy)**2;
   if(error>max){max=error;farthest=i;}
  }
  if(farthest>=0){keep.add(farthest);ranges.push([start,farthest],[farthest,end]);}
 }
 // Keep a closed polygon even when the tolerance exceeds the size of a part.
 return keep.size<3?loop:[...keep].sort((a,b)=>a-b).map(i=>loop[i]);
}
function outlineGeometry(contours,open=false){
 const positions=[];
 for(const points of contours)points.forEach((point,i)=>{if(open&&i===points.length-1)return;const next=points[(i+1)%points.length];positions.push(point.x??point[0],point.y??point[1],0,next.x??next[0],next.y??next[1],0);});
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));return geometry;
}

export function roundedContour(points){
 const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 return points.flatMap((corner,i)=>{
  const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
  const before=Math.hypot(previous[0]-corner[0],previous[1]-corner[1]);
  const after=Math.hypot(next[0]-corner[0],next[1]-corner[1]);
  if(!before||!after)return [[corner[0],corner[1]]];
  const trim=Math.min(before,after)*(corner[2]||0)*.48;
  if(!trim)return [[corner[0],corner[1]]];
  const start=mix(corner,previous,trim/before),end=mix(corner,next,trim/after);
  const steps=Math.min(24,Math.max(4,Math.ceil(Math.sqrt(trim)*2)));
  return Array.from({length:steps+1},(_,step)=>{
   const t=step/steps;
   return mix(mix(start,corner,t),mix(corner,end,t),t);
  });
 });
}

function clipPaths(paths,boundaries){
 const edges=boundaries.flatMap(loop=>loop.map((a,i)=>[a,loop[(i+1)%loop.length]]));
 const cross=(x,y,u,v)=>x*v-y*u;
 const inside=(x,y)=>boundaries.some(loop=>{
  let hit=false;
  for(let i=0;i<loop.length;i++){
   const [ax,ay]=loop[i],[bx,by]=loop[(i+1)%loop.length];
   if(Math.abs(cross(bx-ax,by-ay,x-ax,y-ay))<1e-7&&x>=Math.min(ax,bx)-1e-7&&x<=Math.max(ax,bx)+1e-7&&y>=Math.min(ay,by)-1e-7&&y<=Math.max(ay,by)+1e-7)return true;
   if((ay>y)!==(by>y)&&x<ax+(y-ay)*(bx-ax)/(by-ay))hit=!hit;
  }
  return hit;
 });
 const segments=[];
 for(const loop of paths)for(let i=0;i<loop.length;i++){
  const [x,y]=loop[i],[nx,ny]=loop[(i+1)%loop.length],dx=nx-x,dy=ny-y;
  const cuts=[0,1];
  for(const [[ax,ay],[bx,by]] of edges){
   const ex=bx-ax,ey=by-ay,d=cross(dx,dy,ex,ey);
   if(Math.abs(d)<1e-9)continue;
   const t=cross(ax-x,ay-y,ex,ey)/d,u=cross(ax-x,ay-y,dx,dy)/d;
   if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  for(let j=1;j<cuts.length;j++){
   const a=cuts[j-1],b=cuts[j],mid=(a+b)/2;
   if(b-a>1e-8&&inside(x+dx*mid,y+dy*mid))segments.push([[x+dx*a,y+dy*a],[x+dx*b,y+dy*b]]);
  }
 }
 return segments;
}
