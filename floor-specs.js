import * as T from './three.js';

const foot=304.8;
const number=new Intl.NumberFormat(undefined,{maximumFractionDigits:2});

export function planArea(points){
 if(points.length<3)return 0;
 const [ox,oz]=points[0];
 return Math.abs(points.reduce((sum,[x,z],i)=>{
  const [nx,nz]=points[(i+1)%points.length];
  return sum+(x-ox)*(nz-oz)-(z-oz)*(nx-ox);
 },0))/2/(foot*foot);
}

export function planInterior(points){
 if(points.length<3)return null;
 const bounds=new T.Box2();
 for(const [x,z] of points)bounds.expandByPoint(new T.Vector2(x,z));
 const width=bounds.max.x-bounds.min.x,depth=bounds.max.y-bounds.min.y;
 let best=null,clearance=0;
 for(let row=0;row<19;row++)for(let column=0;column<19;column++){
  const x=bounds.min.x+(column+.5)/19*width,z=bounds.min.y+(row+.5)/19*depth;
  let inside=false,distance=Infinity;
  for(const [i,[ax,az]] of points.entries()){
   const [bx,bz]=points[(i+1)%points.length];
   const dx=bx-ax,dz=bz-az,length=dx*dx+dz*dz;
   if((az>z)!==(bz>z)&&x<ax+dx*(z-az)/dz)inside=!inside;
   const t=length?T.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/length,0,1):0;
   distance=Math.min(distance,(x-ax-t*dx)**2+(z-az-t*dz)**2);
  }
  if(inside&&distance>clearance){best=[x,z];clearance=distance;}
 }
 return best;
}

export function scaleFigure(){
 const positions=[];
 function append(primitive,x,y,z){
  primitive.translate(x*foot,y*foot,z*foot);
  const triangles=primitive.toNonIndexed();
  for(const value of triangles.attributes.position.array)positions.push(value);
  triangles.dispose();primitive.dispose();
 }
 const tube=(top,bottom,height,x,y)=>append(new T.CylinderGeometry(top*foot,bottom*foot,height*foot,8),x,y,0);
 append(new T.SphereGeometry(.45*foot,12,8),0,5.55,0);
 tube(.16,.16,.28,0,5.02);
 tube(.62,.42,1.8,0,4.03);
 for(const side of [-1,1]){
  tube(.22,.15,2.95,side*.25,1.515);
  tube(.15,.11,1.78,side*.69,3.93);
  append(new T.BoxGeometry(.36*foot,.18*foot,.66*foot),side*.25,.09,.12);
 }
 const result=new T.BufferGeometry();
 result.setAttribute('position',new T.Float32BufferAttribute(positions,3));result.computeVertexNormals();result.computeBoundingBox();
 return result;
}

export function installFloorSpecs(e,plans,spawnScalee){
 const element=document.createElement('details');
 element.className='property-group';element.id='floorSpecs';
 element.innerHTML='<summary>Specs</summary><div class="property-group-content iteration-editor"><h3>Area</h3><div class="spec-floor-areas"></div><h3>Distance</h3><div class="spec-distance-pair"><select aria-label="Measure from"></select><span>to</span><select aria-label="Measure to"></select></div><button class="spec-calculate" type="button">Calculate distance</button><p class="hint" role="status"></p><label>Scalee floor <select class="spec-scalee-floor"></select></label><button class="spec-add-scalee" type="button">Add scalee</button></div>';
 const inspector=e.$('.inspector .section');
 const transform=e.$('#propertiesTransform');
 if(transform)transform.after(element);else inspector.append(element);
 const area=element.querySelector('.spec-floor-areas'),[from,to,floor]=element.querySelectorAll('select');
 const calculate=element.querySelector('.spec-calculate'),status=element.querySelector('[role=status]');
 const add=element.querySelector('.spec-add-scalee');
 const endpoints=new T.Float32BufferAttribute(new Float32Array(6),3);
 const geometry=new T.BufferGeometry().setAttribute('position',endpoints);
 const line=new T.Line(geometry,new T.LineBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false}));
 const dots=new T.Points(geometry,new T.PointsMaterial({color:0xffffff,size:7,sizeAttenuation:false,depthTest:false,depthWrite:false}));
 line.add(dots);line.visible=false;line.frustumCulled=dots.frustumCulled=false;
 line.renderOrder=dots.renderOrder=100;
 e.scene.add(line);
 let previous='',previousFloors='',measuring=false,objects=[];
 const floorLines=Array.from({length:5},(_,i)=>{
  const row=document.createElement('p');
  row.textContent='Floor 0'+(i+1)+': —';
  area.append(row);return row;
 });
 function measure(){
  const a=objects.find(mesh=>mesh.studioId===from.value),b=objects.find(mesh=>mesh.studioId===to.value);
  if(!a||!b||a===b){clear();return;}
  const position=mesh=>{
   mesh.updateWorldMatrix(true,false);
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   return mesh.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(mesh.matrixWorld);
  };
  const x=position(a),y=position(b),distance=Math.hypot(x.x-y.x,x.z-y.z)/foot;
  const yLevel=plans().get(a.userData.floorLevel)?.y??a.position.y;
  endpoints.setXYZ(0,x.x,yLevel,x.z);
  endpoints.setXYZ(1,y.x,yLevel,y.z);
  endpoints.needsUpdate=true;
  line.visible=true;
  const text=number.format(distance)+' ft · horizontal, center to center';
  if(status.textContent!==text)status.textContent=text;
 }
 function clear(){measuring=false;line.visible=false;status.textContent='';}
 from.onchange=to.onchange=clear;
 calculate.onclick=()=>{measuring=true;measure();};
 add.onclick=()=>{if(!floor.value)return;clear();status.textContent=spawnScalee(Number(floor.value));};
 return {
  update(active){
   element.hidden=!active;
   if(!active||!element.open){line.visible=false;return;}
   const floors=plans();
   for(const [i,row] of floorLines.entries()){
    const plan=floors.get(i+1);
    const text='Floor 0'+(i+1)+': '+(plan?.area>0?number.format(plan.area)+' sq ft':'—');
    if(row.textContent!==text)row.textContent=text;
   }
   const key=[...floors.keys()].sort().join(',');
   if(key!==previousFloors||!floor.options.length){
    const selected=floor.value;
    floor.replaceChildren(...[...floors.keys()].sort().map(n=>new Option('Floor 0'+n,String(n))));
    if([...floor.options].some(option=>option.value===selected))floor.value=selected;
    if(!floor.options.length)floor.add(new Option('No floors placed',''));
    previousFloors=key;
   }
   add.disabled=!floor.value||e.isBusy();
   objects=e.pieces().filter(mesh=>{
    const data=mesh.userData;
    return data.workspaceStage==='floor-plates'&&(data.egressStair||data.elevator||data.core||data.restroom||data.bathroom||data.scalee);
   });
   const objectKey=JSON.stringify(objects.map(mesh=>[mesh.studioId,mesh.name]));
   if(objectKey!==previous){
    for(const select of [from,to]){
     const selected=select.value;
     select.replaceChildren(new Option('Choose item',''),...objects.map(mesh=>new Option(mesh.name,mesh.studioId)));
     if(objects.some(mesh=>mesh.studioId===selected))select.value=selected;
    }
    previous=objectKey;
   }
   calculate.disabled=!from.value||!to.value||from.value===to.value;
   if(measuring)measure();
  }
 };
}
