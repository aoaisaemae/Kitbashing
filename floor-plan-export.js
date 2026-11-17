import {planInterior} from './floor-specs.js?v=saved-selection-and-project';
const foot=304.8;
const key=point=>point.map(v=>Math.round(v*10000)).join(',');
export function sectionSegments(record,base,cut){
 const segments=[],seen=new Set(),edges=new Map();
 const add=(a,b,kind)=>{if(Math.hypot(a[0]-b[0],a[2]-b[2])<1e-5)return;const id=[key(a),key(b)].sort().join('|')+kind;if(seen.has(id))return;seen.add(id);segments.push({points:[[a[0],-a[2]],[b[0],-b[2]]],kind,color:kind==='Cut'?[.08,.08,.1]:[.45,.48,.5]});};
 for(const face of record.faces||[]){
  const ids=face.filter((v,i)=>i===0||v!==face[i-1]);if(ids.length<3)continue;
  const points=ids.map(i=>record.vertices[i]);
  const a=points[0],b=points[1],c=points[2],u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;normal.forEach((_,i)=>normal[i]/=length);
  for(let i=0;i<points.length;i++){
   const first=points[i],second=points[(i+1)%points.length],id=[key(first),key(second)].sort().join('|');
   if(!edges.has(id))edges.set(id,{a:first,b:second,normals:[]});edges.get(id).normals.push(normal);
  }
  for(let i=1;i<points.length-1;i++){
   const triangle=[points[0],points[i],points[i+1]],hits=[];
   for(let j=0;j<3;j++){
    const a=triangle[j],b=triangle[(j+1)%3],da=a[1]-cut,db=b[1]-cut;
    if(Math.abs(da)<1e-6)hits.push(a);
    if(da*db<0){const t=da/(da-db);hits.push(a.map((v,k)=>v+t*(b[k]-v)));}
   }
   const unique=[...new Map(hits.map(p=>[key(p),p])).values()];if(unique.length===2)add(unique[0],unique[1],'Cut');
  }
 }
 for(const {a,b,normals}of edges.values()){
  if(normals.length>1&&normals.every(n=>Math.abs(n.reduce((s,v,i)=>s+v*normals[0][i],0))>.9999))continue;
  const dy=b[1]-a[1];let low=0,high=1;
  if(Math.abs(dy)<1e-8){if(a[1]<base-1e-5||a[1]>cut+1e-5)continue;}
  else{const t0=(base-a[1])/dy,t1=(cut-a[1])/dy;low=Math.max(0,Math.min(t0,t1));high=Math.min(1,Math.max(t0,t1));if(low>high)continue;}
  add(a.map((v,i)=>v+low*(b[i]-v)),a.map((v,i)=>v+high*(b[i]-v)),'Projection');
 }
 return segments;
}
export function floorPlanPages(records,plans,selected=0){
 return [...plans].sort((a,b)=>a[0]-b[0]).filter(([n])=>!selected||n===selected).map(([n,plan])=>{
  const curves=[{points:plan.points.map(([x,z])=>[x,-z]),closed:true,kind:'Outline',color:[.05,.15,.2]}],labels=[];
  for(const record of records){
   if(record.points){
    if(!record.layer.startsWith('Floor '+String(n).padStart(2,'0')+' - Pieces'))continue;
    curves.push({points:record.points.map(([x,y,z])=>[x,-z]),closed:true,kind:'Program',color:[.6,.63,.65]});
    if(record.program){const p=record.points.map(([x,y,z])=>[x,-z]);const point=planInterior(p);if(point){let radius=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));radius=Math.min(radius,Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy));}labels.push({text:record.program,point,radius});}}
   }else if(record.vertices&&!record.layer.endsWith(' - Surface'))curves.push(...sectionSegments(record,plan.y,plan.y+4*foot));
  }
  return {name:'Floor '+String(n).padStart(2,'0'),curves,labels};
 });
}
const literal=text=>'('+Array.from(text).map(char=>{const n=char.charCodeAt(0);return n>255?'?':n<32||n>126?'\\'+n.toString(8).padStart(3,'0'):'()\\'.includes(char)?'\\'+char:char;}).join('')+')';
export function illustratorFloorPlans(pages){
 if(!pages.length)throw Error('Add floor plates before exporting.');
 const w=1191,h=842,margin=42,all=pages.flatMap(p=>p.curves.flatMap(c=>c.points)),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
 const minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
 const scale=Math.min((w-2*margin)/Math.max(maxX-minX,1),(h-2*margin-45)/Math.max(maxY-minY,1));
 const xy=([x,y])=>[(x-minX)*scale+margin,(y-minY)*scale+margin];
 const f=n=>Number(n.toFixed(3));
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
 const kids=[];
 for(const page of pages){
  const lines=['1 J 1 j','0.1 0.1 0.12 rg','BT /F1 15 Tf 42 805 Td '+literal(page.name+' - Plan | Cut: 4 ft above floor')+' Tj ET'];
  for(const {points,closed,kind,color}of page.curves){if(!points.length)continue;lines.push((color||[.2,.2,.2]).join(' ')+' RG '+(kind==='Cut'?1.5:kind==='Outline'?1:.35)+' w '+points.map((p,i)=>xy(p).map(f).join(' ')+(i?' l':' m')).join(' ')+(closed?' h':'')+' S');}
  for(const label of page.labels){const [x,y]=xy(label.point),size=Math.min(9,label.radius*scale*1.6/Math.max(label.text.length*.6,1));lines.push('0.1 0.1 0.12 rg BT /F1 '+size+' Tf '+f(x-label.text.length*size*.23)+' '+f(y)+' Td '+literal(label.text)+' Tj ET');}
  const stream=lines.join('\n')+'\n',pageId=objects.length+1,streamId=pageId+1;kids.push(pageId+' 0 R');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /Font << /F1 3 0 R >> >> /Contents '+streamId+' 0 R >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
 }
 objects[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages.length+' >>';
 let pdf='%PDF-1.4\n% Illustrator-compatible vector floor plans\n';const offsets=objects.map((object,i)=>{const at=pdf.length;pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';return at;});const xref=pdf.length;
 pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return pdf;
}
