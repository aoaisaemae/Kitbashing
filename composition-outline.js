import * as T from './three.js';

export function installOutline(e,panel){
 const section=document.createElement('section');
 section.innerHTML='<h3>Composition outline</h3><label class="field-label" for="outlineDetail">Outline detail <output id="outlinePercent">100%</output></label><input type="range" id="outlineDetail" min="0" max="100" value="100"><button type="button" id="drawOutline">Draw</button><button type="button" id="bakeOutline" disabled>Bake</button><p class="hint" role="status"></p>';
 panel.append(section);
 const viewport=e.$('#viewport'),overlay=document.createElement('canvas');
 Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2'});
 overlay.hidden=true;
 viewport.append(overlay);
 const ctx=overlay.getContext('2d'),slider=section.querySelector('input'),status=section.querySelector('p');
 const bake=section.querySelector("#bakeOutline");
 let loops=[],width=0,height=0,projection=null,depth=0;
 const tolerance=()=>0.6+(1-Number(slider.value)/100)**2*Math.min(width,height)*0.055;
 function paint(){
  if(overlay.hidden)return;
  ctx.clearRect(0,0,width,height);
  ctx.strokeStyle='#80ddff';ctx.lineWidth=4;ctx.lineJoin='round';ctx.beginPath();
  for(const loop of loops){
   const points=simplifyContour(loop,tolerance());
   ctx.moveTo(...points[0]);
   for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
   ctx.closePath();
  }
  ctx.stroke();
 }
 slider.oninput=()=>{section.querySelector('output').textContent=slider.value+'%';paint();};
 function clear(){if(overlay.hidden)return;overlay.hidden=true;overlay.style.display='none';ctx.clearRect(0,0,width,height);loops=[];projection=null;bake.disabled=true;status.textContent='';}
 e.orbit.addEventListener('change',clear);
 new ResizeObserver(clear).observe(viewport);
 section.querySelector('#drawOutline').onclick=()=>{
  if(e.isBusy())return;
  const meshes=e.selection().filter(m=>m.visible&&e.workflow().inStage(m));
  if(!meshes.length){clear();status.textContent='Select one or more visible objects first.';return;}
  width=Math.max(1,Math.min(1400,viewport.clientWidth));height=Math.max(1,Math.round(width*viewport.clientHeight/Math.max(1,viewport.clientWidth)));
  const mask=new T.Scene(),material=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});
  for(const mesh of meshes){
   mesh.updateWorldMatrix(true,false);
   const copy=new T.Mesh(mesh.geometry,material);
   copy.matrixAutoUpdate=false;copy.matrix.copy(mesh.matrixWorld);mask.add(copy);
  }
  const camera=e.camera;projection=camera.clone();projection.updateMatrixWorld(true);
  depth=meshes.reduce((max,m)=>Math.max(max,new T.Box3().setFromObject(m).max.z),-Infinity);
  const target=new T.WebGLRenderTarget(width,height),pixels=new Uint8Array(width*height*4),renderer=e.renderer;
  const previousTarget=renderer.getRenderTarget(),color=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
  try{
   renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(mask,camera);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
  }finally{
   renderer.setRenderTarget(previousTarget);renderer.setClearColor(color,alpha);target.dispose();material.dispose();
  }
  loops=traceMask(pixels,width,height);
  overlay.width=width;overlay.height=height;overlay.hidden=!loops.length;overlay.style.display=loops.length?'block':'none';paint();bake.disabled=!loops.length;status.textContent=loops.length?'Outline drawn from the selection.':'No figure edges are visible.';
 };
 bake.onclick=()=>{
  if(!projection||!loops.length||e.isBusy()||e.workflow().active!=='resolution')return;
  const pixel=(projection.top-projection.bottom)/height;
  const geometry=outlineGeometry(loops.map(loop=>simplifyContour(loop,tolerance()).map(([x,y])=>{
   const point=new T.Vector3(x/width*2-1,1-y/height*2,0).unproject(projection);
   return new T.Vector2(point.x,point.y);
  })),pixel*2);
  geometry.computeBoundingBox();
  const center=geometry.boundingBox.getCenter(new T.Vector3());
  geometry.translate(-center.x,-center.y,0);
  geometry.computeBoundingBox();
  e.checkpoint();
  const mesh=e.add({geometry,name:'Baked outline',offset:new T.Vector3(center.x,center.y,depth+pixel*3),stage:'program-outline'});
  geometry.dispose();
  mesh.material.color.setHex(0x80ddff);
  e.mark([mesh]);
  clear();
  status.textContent='Outline baked. Drag its handles to move it in XY.';
 };
 return {update(){if(e.workflow().active!=='resolution')clear();}};
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
function outlineGeometry(contours,radius){
 const vertices=[];
 function quad(a,b,c,d){for(const p of [a,b,c,a,c,d])vertices.push(...p);}
 for(const points of contours){
  const rings=points.map((point,i)=>{
   const before=point.clone().sub(points[(i+points.length-1)%points.length]).normalize();
   const after=points[(i+1)%points.length].clone().sub(point).normalize();
   const normal=new T.Vector2(-before.y,before.x);
   const bisector=normal.clone().add(new T.Vector2(-after.y,after.x)).normalize();
   if(!bisector.lengthSq())bisector.copy(normal);
   const offset=bisector.multiplyScalar(radius/Math.max(.5,bisector.dot(normal)));
   const left=point.clone().add(offset),right=point.clone().sub(offset);
   return [[left.x,left.y,radius/2],[right.x,right.y,radius/2],[right.x,right.y,-radius/2],[left.x,left.y,-radius/2]];
  });
  rings.forEach((ring,i)=>{
   const next=rings[(i+1)%rings.length];
   for(let side=0;side<4;side++){
    const j=(side+1)%4;
    quad(ring[j],next[j],next[side],ring[side]);
   }
  });
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
 geometry.userData.quadLayout=true;
 geometry.computeVertexNormals();
 return geometry;
}
