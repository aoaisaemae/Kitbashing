export function installFolderLibrary(drop,{importFiles,isBusy}){
 const panel=document.createElement('section');
 panel.className='folder-library';
 panel.innerHTML='<h3>Desktop folder</h3><div class="button-pair"><button type="button">Connect Folder</button><button type="button" disabled>Refresh Folder</button></div><input type="file" webkitdirectory multiple hidden><label class="field-label">Folder models <select disabled aria-label="Folder models"></select></label><button type="button" disabled>Add</button><p class="hint" role="status"></p>';
 drop.after(panel);
 const [connect,refresh,add]=panel.querySelectorAll('button'),input=panel.querySelector('input'),picker=panel.querySelector('select'),status=panel.querySelector('p');
 let directory=null,entries=[],working=false;
 const persistent=typeof window.showDirectoryPicker==='function';
 const database=persistent?new Promise((resolve,reject)=>{
  const request=indexedDB.open('popmarkit-desktop-folder',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('settings');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 }):null;
 async function setting(mode,operation){
  const db=await database;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('settings',mode),request=operation(tx.objectStore('settings'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onabort=()=>reject(tx.error);
  });
 }
 function buttons(){
  connect.disabled=working;
  refresh.disabled=working||(!directory&&!entries.length);
  picker.disabled=working||!entries.length;
  add.disabled=working||!entries.length;
 }
 function render(items,name){
  const previous=picker.value;
  entries=items.sort((a,b)=>a.path.localeCompare(b.path));
  picker.replaceChildren();
  for(const item of entries)picker.add(new Option(item.path,item.path));
  if(entries.some(item=>item.path===previous))picker.value=previous;
  status.textContent=name+' · '+entries.length+' OBJ '+(entries.length===1?'file':'files');
  buttons();
 }
 async function scan(folder,path,items){
  for await(const entry of folder.values()){
   const relative=path+entry.name;
   if(entry.kind==='directory')await scan(entry,relative+'/',items);
   else if(/\.obj$/i.test(entry.name))items.push({path:relative,read:()=>entry.getFile()});
  }
 }
 async function run(action){
  if(working)return;
  working=true;buttons();
  try{await action();}
  catch(error){if(error.name!=='AbortError')status.textContent='Could not use the folder. '+error.message;}
  finally{working=false;buttons();}
 }
 async function readDirectory(folder){
  const items=[];
  await scan(folder,'',items);
  directory=folder;
  render(items,folder.name);
 }
 connect.onclick=()=>{
  if(!persistent){input.click();return;}
  run(async()=>{
   const folder=await window.showDirectoryPicker({mode:'read',id:'popmarkit-models'});
   await readDirectory(folder);
   await setting('readwrite',store=>store.put(folder,'folder')).catch(()=>{
    status.textContent+=' · Folder must be reconnected next time.';
   });
  });
 };
 refresh.onclick=()=>{
  if(!persistent){input.click();return;}
  run(async()=>{
   if(await directory.requestPermission({mode:'read'})!=='granted'){
    status.textContent='Allow folder access to refresh the list.';
    return;
   }
   await readDirectory(directory);
  });
 };
 input.onchange=()=>{
  const files=Array.from(input.files);
  if(files.length)render(files.filter(file=>/\.obj$/i.test(file.name)).map(file=>({path:file.webkitRelativePath||file.name,read:()=>file})),files[0].webkitRelativePath.split('/')[0]||'Selected folder');
  input.value='';
 };
 add.onclick=()=>run(async()=>{
  const entry=entries.find(item=>item.path===picker.value);
  if(!entry)return;
  if(isBusy()){status.textContent='Wait for the current operation to finish.';return;}
  status.textContent='Loading '+entry.path+'…';
  const file=await entry.read();
  if(isBusy()){status.textContent='Wait for the current operation to finish.';return;}
  await importFiles([file]);
  status.textContent='';
 });
 if(persistent)setting('readonly',store=>store.get('folder')).then(folder=>{
  if(!folder||working||directory)return;
  return run(async()=>{
   directory=folder;
   if(await folder.queryPermission({mode:'read'})==='granted')await readDirectory(folder);
   else status.textContent=folder.name+' · Click Refresh Folder to restore access.';
  });
 }).catch(()=>{});
}
