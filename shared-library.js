export async function installSharedLibrary(anchor,{addPiece,canImport,finish,catalog}){
 const panel=document.createElement('section');
 panel.id='sharedLibrary';
 panel.innerHTML='<div class="shared-heading"><h3>Shared models</h3><output></output></div><label class="shared-filter">Collection <select><option value="">All collections</option></select></label><label class="shared-filter">Feature <select><option value="">All features</option></select></label><button type="button" class="shared-add-all">Add all</button><div class="shared-cards"></div><p class="hint" role="status"></p>';
 anchor.before(panel);
 const filter=panel.querySelector('select'),cards=panel.querySelector('.shared-cards'),status=panel.querySelector('[role=status]');
 const feature=panel.querySelectorAll('select')[1];
 const all=panel.querySelector('.shared-add-all');
 all.disabled=true;
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
 const shown=()=>library.filter(item=>(!filter.value||item.family===filter.value)&&(!feature.value||item.category===feature.value));
 function render(){
  cards.replaceChildren();
  const models=shown();
  all.disabled=loading||!models.length;
  all.textContent='Add all ('+models.length+')';
  for(const model of models){
   const card=document.createElement('article');
   const image=document.createElement('div'),name=document.createElement('strong'),size=document.createElement('small'),add=document.createElement('button');
   image.className='library-thumbnail';image.style.backgroundPosition=(model.col/12*100)+'% '+(model.row/17*100)+'%';
   name.textContent=model.name;
   size.textContent=(model.transferBytes/1048576).toFixed(2)+' MiB on load';
   add.type='button';add.textContent='Add';add.disabled=loading;add.setAttribute('aria-label','Add '+model.name);
   add.onclick=()=>load([model]);
   card.append(image,name,size,add);
   cards.append(card);
  }
 }
 async function load(models){
  if(loading||!models.length)return;
  if(!canImport()){status.textContent='Open Figures and wait for the current operation to finish.';return;}
  loading=true;
  for(const button of panel.querySelectorAll('button'))button.disabled=true;
  const added=[];
  const packs=new Map();
  try{
   for(const model of models){
    if(!canImport())break;
    status.textContent='Adding '+(added.length+1)+' of '+models.length+' · '+model.name;
    let packed;
    if(models.length>1){
     if(!packs.has(model.url)){
      const response=await fetch(model.url);
      if(!response.ok)throw Error('Model pack unavailable.');
      packs.set(model.url,await response.blob());
     }
     packed=packs.get(model.url).slice(model.start,model.end+1);
    }else{
     const response=await fetch(model.url,{headers:{Range:'bytes='+model.start+'-'+model.end}});
     if(!response.ok)throw Error('Model file unavailable.');
     const body=await response.blob();
     packed=response.status===206?body:body.slice(model.start,model.end+1);
    }
    if(packed.size!==model.transferBytes)throw Error('Model data is incomplete.');
    const bytes=await new Response(packed.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if(bytes.byteLength!==model.bytes)throw Error('Model data is incomplete.');
    if(!canImport())break;
    const mesh=addPiece(model,new Float32Array(bytes),added.length===0);
    if(!mesh)break;
    added.push(mesh);
   }
   status.textContent=added.length===models.length?'Added '+added.length+' '+(added.length===1?'piece.':'pieces.'):'Stopped after adding '+added.length+' of '+models.length+' pieces.';
  }catch(error){status.textContent='Added '+added.length+' of '+models.length+' pieces. '+error.message;}
  finally{if(added.length)finish(added);loading=false;render();}
 }
 all.onclick=()=>load(shown());
 filter.onchange=feature.onchange=render;
 render();
}
