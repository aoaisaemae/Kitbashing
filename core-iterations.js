// All coordinates are millimeters on the XY floor plane.
const FOOT=304.8;

export function inside(point,polygon){
 let hit=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
 }
 return hit;
}

export function programPolygons(parts,layout,anchored=false){
 return parts.flatMap((part,index)=>{
  if(anchored&&!part.anchored)return [];
  const [x,y,degrees,scale=1]=layout[index],angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return part.paths.filter(path=>path.closed).map(path=>path.points.map(([px,py])=>{
   const dx=(px-part.center.x)*scale,dy=(py-part.center.y)*scale;
   return [x+c*dx-s*dy,y+s*dx+c*dy];
  }));
 });
}

export function coreCorners(core,placement){
 const [x,y,angle]=placement,c=Math.cos(angle),s=Math.sin(angle);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[
  x+c*u*core.width/2-s*v*core.depth/2,
  y+s*u*core.width/2+c*v*core.depth/2
 ]);
}

function shuffle(items){
 for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
 return items;
}

function boundsOf(corners){
 const xs=corners.map(point=>point[0]),ys=corners.map(point=>point[1]);
 return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}

function footprintFits(core,placement,polygons,placed){
 const corners=coreCorners(core,placement),insideUnion=point=>polygons.some(polygon=>inside(point,polygon));
 // Check the full rectangular footprint, rather than just its center, so a core
 // cannot straddle the edge of its program or anchoring space.
 for(let i=0;i<corners.length;i++){
  const a=corners[i],b=corners[(i+1)%corners.length];
  for(let step=0;step<=8;step++){
   const t=step/8;
   if(!insideUnion([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]))return false;
  }
 }
 for(let row=1;row<8;row++)for(let column=1;column<8;column++){
  const u=column/8,v=row/8,a=corners[0],b=corners[1],d=corners[3];
  if(!insideUnion([a[0]+(b[0]-a[0])*u+(d[0]-a[0])*v,a[1]+(b[1]-a[1])*u+(d[1]-a[1])*v]))return false;
 }
 const bounds=boundsOf(corners);
 return !placed.some(other=>bounds[0]<other[2]&&bounds[2]>other[0]&&bounds[1]<other[3]&&bounds[3]>other[1]);
}

function stairCandidates(core,polygons){
 const candidates=[],stepOut=core.depth/2+2*FOOT,probe=2*FOOT;
 for(const polygon of polygons){
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(length<core.width)continue;
   for(let step=1;step<12;step++){
    const t=step/12,edgeX=a[0]+dx*t,edgeY=a[1]+dy*t;
    for(const sign of [-1,1]){
     const nx=-dy/length*sign,ny=dx/length*sign;
     // Keep only exterior edges, so stairs are never tucked against an
     // internal seam between adjoining program spaces.
     if(polygons.some(p=>inside([edgeX-nx*probe,edgeY-ny*probe],p)))continue;
     if(!polygons.some(p=>inside([edgeX+nx*probe,edgeY+ny*probe],p)))continue;
     candidates.push([edgeX+nx*stepOut,edgeY+ny*stepOut,Math.atan2(dy,dx)]);
    }
   }
  }
 }
 return candidates;
}

function interiorCandidates(core,polygons){
 const candidates=[];
 for(const polygon of polygons){
  const xs=polygon.map(point=>point[0]),ys=polygon.map(point=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  for(let row=0;row<=12;row++)for(let column=0;column<=12;column++)for(const angle of [0,Math.PI/2]){
   candidates.push([minX+(maxX-minX)*column/12,minY+(maxY-minY)*row/12,angle]);
  }
 }
 return candidates;
}

export function placeIterationCores(parts,layout,cores){
 const programs=programPolygons(parts,layout),anchors=programPolygons(parts,layout,true),result=[],placed=[];
 for(const core of cores){
  // Elevators must be contained by one anchored footprint. They are not allowed
  // to fall back to an unanchored program or to the whole floor.
  const allowed=core.kind==='elevator'?anchors:programs;
  if(!allowed.length)return null;
  const candidates=core.kind==='stairs'?stairCandidates(core,programs):interiorCandidates(core,allowed);
  let found=null;
  for(const candidate of shuffle(candidates)){
   const region=core.kind==='elevator'?anchors.filter(polygon=>footprintFits(core,candidate,[polygon],placed)):programs;
   if(footprintFits(core,candidate,region,placed)){found=candidate;break;}
  }
  if(!found)return null;
  result.push(found);
  placed.push(boundsOf(coreCorners(core,found)));
 }
 return result;
}
