// Split triangle soup by shared geometric vertices, including OBJ seams.
export function splitParts(positions,sharedEdges=false){
 const n=positions.length/9,parent=Int32Array.from({length:n},(_,i)=>i),seen=new Map();
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let f=0;f<n;f++)for(let j=0;j<3;j++){const k=f*9+j*3,vertex=[positions[k],positions[k+1],positions[k+2]].join(',');let key=vertex;if(sharedEdges){const next=f*9+((j+1)%3)*3;const adjacent=[positions[next],positions[next+1],positions[next+2]].join(',');if(vertex===adjacent)continue;key=[vertex,adjacent].sort().join('|');}if(seen.has(key))parent[root(f)]=root(seen.get(key));else seen.set(key,f);}
 const groups=new Map();for(let f=0;f<n;f++){const r=root(f);if(!groups.has(r))groups.set(r,[]);const a=groups.get(r);for(let k=0;k<9;k++)a.push(positions[f*9+k]);}return [...groups.values()].map(a=>new Float32Array(a));
}
