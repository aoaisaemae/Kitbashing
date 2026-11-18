function pointSegmentDistance([x,y],[ax,ay],[bx,by]){
 const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)):0;
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}

function segmentDistance(a,b,c,d){
 const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 if(((abC>0&&abD<0)||(abC<0&&abD>0))&&((cdA>0&&cdB<0)||(cdA<0&&cdB>0)))return 0;
 return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}

export function programBoundaryGap(parts,layout,from,to){
 const segments=program=>parts.flatMap((part,i)=>{
  if(part.program?.trim()!==program)return [];
  const [x,y,degrees,scale=1]=layout[i],angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return part.paths.flatMap(({points})=>{
   const transformed=points.map(([px,py])=>{
    const dx=(px-part.center.x)*scale,dy=(py-part.center.y)*scale;
    return [x+c*dx-s*dy,y+s*dx+c*dy];
   });
   return transformed.slice(1).map((point,j)=>[transformed[j],point]);
  });
 });
 const first=segments(from),second=segments(to);
 let gap=Infinity;
 for(const [a,b] of first)for(const [c,d] of second){
  gap=Math.min(gap,segmentDistance(a,b,c,d));
  if(gap<1e-7)return 0;
 }
 return gap;
}
