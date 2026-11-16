export async function installSharedLibrary(anchor,{addPiece,canImport,catalog}){
 const panel=document.createElement('section');
 panel.id='sharedLibrary';
 panel.innerHTML='<div class="shared-heading"><h3>Shared models</h3><output></output></div><label class="shared-filter">Collection <select><option value="">All collections</option></select></label><label class="shared-filter">Feature <select><option value="">All features</option></select></label><div class="shared-cards"></div><p class="hint" role="status"></p>';
 anchor.before(panel);
 const filter=panel.querySelector('select'),cards=panel.querySelector('.shared-cards'),status=panel.querySelector('[role=status]');
 const feature=panel.querySelectorAll('select')[1];
 let library,loading=false;
 try{
  if(catalog)library=catalog;
  else{
   const response=await fetch('./shared-models.json');
   if(!response.ok)throw Error('Catalog unavailable.');
   library=await response.json();
  }
 }catch(error){status.textContent='Could not load shared models. '+error.message;return;}
 panel.querySelector('output').textContent=library.length+' models';
 for(const family of new Set(library.map(item=>item.family)))filter.add(new Option(family,family));
 for(const category of [...new Set(library.map(item=>item.category).filter(Boolean))].sort())feature.add(new Option(category[0].toUpperCase()+category.slice(1),category));
 function render(){
  cards.replaceChildren();
  for(const model of library.filter(item=>(!filter.value||item.family===filter.value)&&(!feature.value||item.category===feature.value))){
   const card=document.createElement('article');
   const image=document.createElement('div'),name=document.createElement('strong'),size=document.createElement('small'),add=document.createElement('button');
   image.className='library-thumbnail';image.style.backgroundPosition=(model.col/12*100)+'% '+(model.row/17*100)+'%';
   name.textContent=model.name;
   size.textContent=(model.transferBytes/1048576).toFixed(2)+' MiB on load';
   add.type='button';add.textContent='Add';add.disabled=loading;add.setAttribute('aria-label','Add '+model.name);
   add.onclick=async()=>{
    if(loading)return;
    if(!canImport()){status.textContent='Open Figures and wait for the current operation to finish.';return;}
    loading=true;
    for(const button of cards.querySelectorAll('button'))button.disabled=true;
    status.textContent='Loading '+model.name+'…';
    try{
     const response=await fetch(model.url,{headers:{Range:'bytes='+model.start+'-'+model.end}});
     if(!response.ok||!response.body)throw Error('Model file unavailable.');
     const packed=response.status===206?await response.blob():(await response.blob()).slice(model.start,model.end+1);
     if(packed.size!==model.transferBytes)throw Error('Model data is incomplete.');
     const uncompressed=packed.stream().pipeThrough(new DecompressionStream('gzip'));
     const bytes=await new Response(uncompressed).blob();
     if(bytes.size!==model.bytes)throw Error('Model data is incomplete.');
     if(!canImport()){status.textContent='Open Figures and try Add again.';return;}
     status.textContent='Importing '+model.name+'…';
     await new Promise(resolve=>requestAnimationFrame(resolve));
     if(!canImport()){status.textContent='Open Figures and try Add again.';return;}
     const before=addPiece(model,new Float32Array(await bytes.arrayBuffer()));
     status.textContent=before?'Added '+model.name+'.':model.name+' could not be added. Check the workspace message.';
    }catch(error){status.textContent='Could not load '+model.name+'. '+error.message;}
    finally{loading=false;for(const button of cards.querySelectorAll('button'))button.disabled=false;}
   };
   card.append(image,name,size,add);
   cards.append(card);
  }
 }
 filter.onchange=feature.onchange=render;
 render();
}
