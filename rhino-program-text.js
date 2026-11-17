// Native editable Rhino TextDot labels, kept separate from curve geometry.
export function addProgramText(rhino,doc,program,points,sourceAttributes){
 const text=program?.trim();if(!text||!points?.length)return;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 let point=[(minX+maxX)/2,(minY+maxY)/2],best=-1;
 for(let row=0;row<17;row++)for(let column=0;column<17;column++){
  const x=minX+(column+.5)/17*(maxX-minX),y=minY+(row+.5)/17*(maxY-minY);
  let inside=false,distance=Infinity;
  for(let i=0;i<points.length;i++){
   const [ax,ay]=points[i],[bx,by]=points[(i+1)%points.length],dx=bx-ax,dy=by-ay;
   if((ay>y)!==(by>y)&&x<ax+dx*(y-ay)/dy)inside=!inside;
   const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
   distance=Math.min(distance,Math.hypot(x-ax-t*dx,y-ay-t*dy));
  }
  if(inside&&distance>best){best=distance;point=[x,y];}
 }
 const label=new rhino.TextDot(text,[point[0],point[1],points[0][2]??0]);
 const attributes=new rhino.ObjectAttributes();
 try{
  label.fontFace='Arial';label.fontHeight=14;
  attributes.name=text+' · program text';attributes.layerIndex=sourceAttributes.layerIndex;
  attributes.visible=sourceAttributes.visible;attributes.mode=sourceAttributes.mode;
  attributes.objectColor=sourceAttributes.objectColor;attributes.colorSource=sourceAttributes.colorSource;
  attributes.setUserString('Program',text);attributes.setUserString('POPMARKIT type','Program text');
  doc.objects().add(label,attributes);
 }finally{label.delete();attributes.delete();}
}
