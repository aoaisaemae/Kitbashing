// Shared selection behavior for every saved-item library.
export function installSavedPicker(select,{insertButton,deleteButton,onInsert,onDelete,status,isBusy=()=>false}){
 if(select.dataset.savedPicker)return;select.dataset.savedPicker='true';
 const controls=document.createElement('section');controls.className='saved-picker-controls';
 controls.innerHTML='<label>Selection <select class="saved-selection-mode" aria-label="Saved item selection mode"><option value="one">Select one</option><option value="multiple">Select multiple</option><option value="all">Select all</option></select></label><div class="saved-picker-checks" hidden></div><p class="hint saved-picker-count" aria-live="polite"></p>';
 select.closest('label')?.after(controls);if(!controls.isConnected)select.after(controls);
 const mode=controls.querySelector('select'),checks=controls.querySelector('div'),count=controls.querySelector('p');
 if(!insertButton){insertButton=document.createElement('button');insertButton.type='button';controls.after(insertButton);}
 if(!deleteButton){deleteButton=document.createElement('button');deleteButton.type='button';insertButton.after(deleteButton);}
 insertButton.textContent='Insert';deleteButton.textContent='Delete';
 let selected=new Set(),busy=false;
 const options=()=>[...select.options].filter(option=>option.value&&!option.disabled);
 const ids=()=>mode.value==='all'?options().map(option=>option.value):mode.value==='one'?[select.value].filter(id=>options().some(option=>option.value===id)):[...selected].filter(id=>options().some(option=>option.value===id));
 function sync(){
  const available=options();selected=new Set([...selected].filter(id=>available.some(option=>option.value===id)));
  select.hidden=mode.value!=='one';checks.hidden=mode.value==='one';
  checks.replaceChildren();
  for(const option of available){const label=document.createElement('label'),check=document.createElement('input');label.className='ranking-option';check.type='checkbox';check.value=option.value;check.checked=mode.value==='all'||selected.has(option.value);check.disabled=mode.value==='all'||busy;check.onchange=()=>{if(check.checked)selected.add(check.value);else selected.delete(check.value);sync();};label.append(check,document.createTextNode(option.textContent));checks.append(label);}
  updateActions();
 }
 function updateActions(){
  insertButton.textContent=mode.value==='all'?'Insert all':mode.value==='multiple'?'Insert selected':'Insert';
  deleteButton.textContent=mode.value==='all'?'Delete all':mode.value==='multiple'?'Delete selected':'Delete';
  count.textContent=ids().length+' of '+options().length+' selected';
  insertButton.disabled=deleteButton.disabled=busy||isBusy()||!ids().length;
 }
 mode.onchange=()=>{if(mode.value==='multiple'&&!selected.size&&select.value)selected.add(select.value);sync();};
 select.addEventListener('change',sync);
 const observer=new MutationObserver(sync);observer.observe(select,{childList:true,subtree:true});
 async function run(action){
  const chosen=ids();if(busy||isBusy()||!chosen.length)return;
  if(action==='delete'&&!window.confirm('Delete '+chosen.length+' saved item'+(chosen.length===1?'':'s')+' from this list? Placed objects remain in the workspace.'))return;
  busy=true;sync();
  try{await (action==='insert'?onInsert:onDelete)(chosen);}
  catch(error){if(status)status.textContent=error.message||String(error);}
  finally{busy=false;sync();}
 }
 insertButton.onclick=()=>run('insert');deleteButton.onclick=()=>run('delete');sync();
 return {sync,ids,controls,update:updateActions};
}
