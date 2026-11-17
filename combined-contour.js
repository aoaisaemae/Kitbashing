import * as T from './three.js';
import {traceMask,simplifyContour} from './composition-outline.js';

export function traceCombinedContour(parts){
  const vertices=parts.map(path=>path.points);
  const bounds=new T.Box3();
  for(const points of vertices)for(const [x,y] of points)bounds.expandByPoint(new T.Vector3(x,y,0));
  const size=bounds.getSize(new T.Vector3()),span=Math.max(size.x,size.y);
  if(!(span>0))return [];
  const scale=192/span,pad=8;
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(size.x*scale)+pad*2;canvas.height=Math.ceil(size.y*scale)+pad*2;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.fillStyle=context.strokeStyle='#fff';
  context.lineJoin=context.lineCap='round';
  const draw=(points,closed)=>{
   context.beginPath();
   points.forEach(([x,y],i)=>context[i?'lineTo':'moveTo']((x-bounds.min.x)*scale+pad,(bounds.max.y-y)*scale+pad));
   if(closed){context.closePath();context.fill();}
   context.stroke();
  };
  context.lineWidth=2.5;
  for(const {points,closed} of parts)draw(points,closed);
  // Join neighboring outlines with short rounded connections, leaving wider recesses visible.
  const samples=vertices.map(points=>points.filter((_,i)=>i%Math.max(1,Math.ceil(points.length/64))===0));
  const linked=new Set([0]);
  while(linked.size<vertices.length){
   let best=Infinity,bridge=null,next=-1;
   for(const source of linked)for(let target=0;target<vertices.length;target++){
    if(linked.has(target))continue;
    for(const a of samples[source])for(const b of samples[target]){
     const distance=(a[0]-b[0])**2+(a[1]-b[1])**2;
     if(distance<best){best=distance;bridge=[a,b];next=target;}
    }
   }
   if(!bridge)break;
   context.lineWidth=4;draw(bridge,false);linked.add(next);
  }
  const field=document.createElement('canvas');
  field.width=canvas.width;field.height=canvas.height;
  const blend=field.getContext('2d',{willReadFrequently:true});
  blend.filter='blur(1.5px)';
  blend.drawImage(canvas,0,0);
  const pixels=blend.getImageData(0,0,field.width,field.height).data;
  for(let i=0;i<pixels.length;i+=4)pixels[i]=pixels[i+3]>=105?255:0;
  const loops=traceMask(pixels,canvas.width,canvas.height);
  const area=loop=>Math.abs(loop.reduce((sum,[x,y],i)=>{
   const [nx,ny]=loop[(i+1)%loop.length];return sum+x*ny-nx*y;
  },0));
  const outer=loops.sort((a,b)=>area(b)-area(a))[0];
  const contour=outer?simplifyContour(outer,1.2).map(([x,y])=>[
   bounds.min.x+(x-pad)/scale,bounds.max.y-(canvas.height-y-pad)/scale
  ]):[];
 return contour;
}
