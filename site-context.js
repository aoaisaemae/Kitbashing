import {installSiteHighlights, installSiteKitbash} from './site-controls.js?v=site-sections-20261122';
import {addParcelGraphics, addVegetation, waterHatch} from './site-graphics.js?v=site-sections-20261122';
import {installSiteBuilding} from './site-building.js?v=site-sections-20261122';
import * as T from './three.js';
export function insideBoundary(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function placeWithinSite(meshes,boundary){if(!meshes.length)return;const bounds=new T.Box3();meshes.forEach(m=>{m.updateMatrixWorld(true);bounds.expandByObject(m);});const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());const xs=boundary.map(p=>p[0]),ys=boundary.map(p=>p[1]),width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);let scale=Math.min(1,width*.88/Math.max(size.x,1),height*.88/Math.max(size.y,1));while(scale>1e-6){const corners=[[-size.x/2,-size.y/2],[size.x/2,-size.y/2],[size.x/2,size.y/2],[-size.x/2,size.y/2]].map(p=>p.map(v=>v*scale));if(corners.every(p=>insideBoundary(p,boundary)))break;scale*=.95;}for(const mesh of meshes){mesh.position.x=(mesh.position.x-center.x)*scale;mesh.position.y=(mesh.position.y-center.y)*scale;mesh.scale.multiplyScalar(scale);mesh.userData.sitePlaced=true;mesh.updateMatrixWorld(true);}}
export function installSiteContext(e,slot){
 let enabled=false,mode='3d',loaded=false,loading=null,active=false,currentSite=false,visited=false,pendingFit=false,seen=new Set(),boundary=[];
 const root=new T.Group();root.name='One Herald Plaza site context';root.visible=false;e.scene.add(root);
 const originalRatio=e.renderer?.getPixelRatio?.();let appliedRatio=originalRatio;
 const noop=()=>{};if(!slot)return {setVisible:noop,update:noop,save:()=>({enabled:false}),restore:noop,is3D:()=>false};
 slot.innerHTML='<h3>ONE HERALD PLAZA</h3><button class="site-toggle" type="button" aria-pressed="false">Show site</button><div class="button-pair"><button class="site-3d" type="button">3D aerial</button></div><button class="site-fit" type="button">Fit site</button><button class="site-boundary" type="button">Zoom to site boundary</button><p class="site-status hint" role="status"></p><p class="hint">One Herald Plaza · Miami<br>Pink hatching marks water. The gray parcel shows the site boundary.</p><p class="hint">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>. Building heights come from the supplied Rhino model; offshore bridge elevation remains approximate.</p>';
 const building=installSiteBuilding(e,slot);
 const highlights=installSiteHighlights(slot,()=>e.mark([]));
 const kitbash=installSiteKitbash(e,slot,async()=>{
  show(true);
  await load();
  return {boundary,focus:()=>frame('boundary')};
 });
 root.add(kitbash.group);
 const status=slot.querySelector('.site-status'),toggle=slot.querySelector('.site-toggle');
 function frame(which='site'){
  if(!loaded||!e.baseCamera)return;const box=which==='boundary'?new T.Box3(new T.Vector3(-49000,-80000,-1000),new T.Vector3(49000,80000,1000)):new T.Box3().setFromObject(root);const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),distance=Math.max(size.x/Math.max(e.baseCamera.aspect,.2),size.y,size.z)*1.5;
  const direction=mode==='3d'?new T.Vector3(.35,-.65,1).normalize():new T.Vector3(0,0,1);e.orbit.target.copy(center);e.baseCamera.up.set(0,mode==='3d'?0:1,mode==='3d'?1:0);e.baseCamera.position.copy(center).addScaledVector(direction,distance);e.baseCamera.near=1;e.baseCamera.far=Math.max(1e8,distance*20);e.baseCamera.updateProjectionMatrix();e.orbit.update();
 }
 async function load(){if(loaded)return;if(loading)return loading;status.textContent='Loading local site…';loading=(async()=>{try{
  const response=await fetch(new URL('./site-context.json?v=site-sections-20261122',import.meta.url));if(!response.ok)throw Error('Site data unavailable');const data=await response.json();const bx=data.boundary.slice(0,-1).reduce((s,p)=>s+p[0],0)/4,by=data.boundary.slice(0,-1).reduce((s,p)=>s+p[1],0)/4;
  boundary=data.boundary.map(([x,y])=>[(x-bx)*1000,(y-by)*1000]);
  const materials={building:new T.MeshBasicMaterial({color:0x303030,side:T.DoubleSide,transparent:true,opacity:.22,depthWrite:false}),road:new T.MeshBasicMaterial({color:0x989898,side:T.DoubleSide}),water:waterHatch()};
  highlights.add('building',materials.building);
  highlights.add('road',materials.road);
  for(const [cat,positions] of Object.entries(data.triangles)){const array=new Float32Array(positions.length);for(let i=0;i<array.length;i+=3){array[i]=(positions[i]-1242.5-bx)*1000;array[i+1]=(-positions[i+2]-140-by)*1000;array[i+2]=positions[i+1]*1000;}const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(array,3));if(materials[cat])root.add(new T.Mesh(g,materials[cat]));}
  if(data.buildingEdges?.length){const positions=data.buildingEdges.map((v,i)=>i%3===0?(v-1242.5-bx)*1000:i%3===1?(-data.buildingEdges[i+1]-140-by)*1000:data.buildingEdges[i-1]*1000);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));const material=new T.LineBasicMaterial({color:0xc4c4c4,transparent:true,opacity:.58});highlights.add('building',material);root.add(new T.LineSegments(g,material));}
  for(const [cat,segments] of Object.entries(data.paths)){const positions=[];for(const line of segments)for(const [x,y] of line)positions.push((x-bx)*1000,(y-by)*1000,10);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));const layer={green:'vegetation',road:'road',path:'road',building:'building',landmark:'building'}[cat];const material=new T.LineBasicMaterial({color:cat==='water'?0xb34e99:cat==='green'?0x606060:layer==='road'?0xf1f1f1:0xb3b3b3,transparent:true,opacity:.55});highlights.add(layer,material);root.add(new T.LineSegments(g,material));}
  for(const material of addVegetation(root,data,bx,by))highlights.add('vegetation',material);
  addParcelGraphics(root,boundary);
  kitbash.render(boundary);
  seen=new Set(e.pieces());loaded=true;status.textContent='Site context loaded.';if(pendingFit){pendingFit=false;if(active&&currentSite&&enabled)frame();}
 }catch(error){enabled=false;status.textContent='Could not load site: '+error.message;throw error;}finally{loading=null;}})();return loading;}
 function show(value){if(e.scene.userData.spacesDisplay)e.scene.userData.spacesDisplay.site=value;enabled=value;toggle.textContent=enabled?'Hide site':'Show site';toggle.setAttribute('aria-pressed',String(enabled));if(enabled)load().catch(()=>{toggle.textContent='Show site';toggle.setAttribute('aria-pressed','false');});root.visible=active&&enabled&&loaded&&e.scene.userData.spacesDisplay?.site!==false;}
 toggle.onclick=()=>show(!enabled);
 slot.querySelector('.site-3d').onclick=()=>{show(true);load().then(()=>frame()).catch(()=>{});};
 slot.querySelector('.site-fit').onclick=()=>{show(true);load().then(()=>frame()).catch(()=>{});};slot.querySelector('.site-boundary').onclick=()=>{show(true);load().then(()=>frame('boundary')).catch(()=>{});};
 return {sendCurves:kitbash.send,setVisible:show,is3D:()=>active&&enabled,save:()=>({enabled,mode:'3d',building:building.save(),highlights:highlights.save(),kitbash:kitbash.save()}),restore(state){enabled=e.scene.userData.spacesDisplay?.site??!!state?.enabled;mode='3d';building.restore(state?.building);highlights.restore(state?.highlights);kitbash.restore(state?.kitbash);if(loaded)kitbash.render(boundary);visited=enabled;if(enabled)show(true);},update(on,siteTab,showContext=true){active=on;currentSite=siteTab;if(on&&siteTab)kitbash.update();building.update(on,siteTab||!!e.scene.userData.spacesOperate);const ratio=on&&siteTab&&enabled?Math.min(globalThis.devicePixelRatio||1,1.25):originalRatio;if(ratio&&ratio!==appliedRatio&&e.renderer?.setPixelRatio){e.renderer.setPixelRatio(ratio);appliedRatio=ratio;}if(on&&siteTab&&!visited){visited=true;}root.visible=showContext&&active&&enabled&&loaded&&e.scene.userData.spacesDisplay?.site!==false;if(on&&loaded&&showContext){const added=e.pieces().filter(m=>['spaces','spaces-operate'].includes(m.userData.workspaceStage)&&!seen.has(m)&&!m.userData.sitePlaced);if(added.length)placeWithinSite(added,boundary);seen=new Set(e.pieces());}}};
}
