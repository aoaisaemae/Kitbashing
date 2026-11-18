// Shared saved-item dropdown: inline selection, insertion, and deletion.
export function installSavedPicker(select,{insertButton,deleteButton,onInsert,onDelete,status,isBusy=()=>false}){
 if(select.dataset.savedPicker)return;select.dataset.savedPicker='true';select.hidden=true;
 const controls=document.createElement('details');controls.className='saved-picker';
 const title=select.getAttribute('aria-label')||select.closest('label')?.firstChild?.textContent?.trim()||'Saved items';
 controls.innerHTML='<summary></summary><div class="saved-picker-menu"><div class="saved-picker-tools"><button type="button" class="saved-picker-all">Select all</button><button type="button" class="saved-picker-clear">Clear</button></div><div class="saved-picker-options" role="listbox" aria-multiselectable="true"></div><p class="hint">Shift-click to select a range. Click × to delete the selected items.</p><button type="button" class="saved-picker-insert">Insert selected</button></div>';
 select.after(controls);
 const summary=controls.querySelector('summary'),list=controls.querySelector('[role=listbox]'),insideInsert=controls.querySelector('.saved-picker-insert');
 summary.setAttribute('aria-label',title);list.setAttribute('aria-label',title);
 if(!insertButton){insertButton=document.createElement('button');insertButton.type='button';controls.after(insertButton);}
 if(deleteButton)deleteButton.hidden=true;
 let selected=new Set(),busy=false,anchor=null,empty=false;
 const options=()=>[...select.options].filter(option=>option.value&&!option.disabled);
 const ids=()=>options().map(option=>option.value).filter(id=>selected.has(id));
 function choose(id,event={}){
  const available=options(),index=available.findIndex(option=>option.value===id),previous=available.findIndex(option=>option.value===anchor);
  if(event.shiftKey&&previous>=0){for(const option of available.slice(Math.min(index,previous),Math.max(index,previous)+1))selected.add(option.value);}
  else if(event.ctrlKey||event.metaKey){if(!selected.delete(id))selected.add(id);}
  else selected=new Set([id]);
  if(!event.shiftKey||previous<0)anchor=id;
  empty=!selected.size;select.value=id;
  select.dispatchEvent(new Event('change',{bubbles:true}));sync();
 }
 function updateActions(){
  const chosen=ids(),available=options();
  summary.textContent=chosen.length===1?available.find(option=>option.value===chosen[0]).textContent:chosen.length?chosen.length+' selected':'Choose saved items';
  const actionLabel=insertButton.dataset.actionLabel||'Insert';insertButton.textContent=insideInsert.textContent=chosen.length>1?actionLabel+' selected ('+chosen.length+')':actionLabel;
  insertButton.disabled=insideInsert.disabled=busy||isBusy()||!chosen.length;
  if(deleteButton){deleteButton.hidden=true;deleteButton.disabled=busy||isBusy()||!chosen.length;}
 }
 function sync(){
  const available=options();selected=new Set([...selected].filter(id=>available.some(option=>option.value===id)));
  if(!selected.size&&!empty&&available.length)selected.add(available.some(option=>option.value===select.value)?select.value:available[0].value);
  if(anchor===null&&selected.size)anchor=[...selected][0];
  select.hidden=true;list.replaceChildren();
  for(const option of available){
   const row=document.createElement('div');row.className='saved-picker-row';
   const item=document.createElement('button');item.type='button';item.className='saved-picker-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(selected.has(option.value)));item.textContent=(selected.has(option.value)?'✓ ':'')+option.textContent;item.disabled=busy;
   item.onclick=event=>{event.preventDefault();event.stopPropagation();choose(option.value,event);};
   const remove=document.createElement('button');remove.type='button';remove.className='saved-picker-remove';remove.textContent='×';remove.setAttribute('aria-label','Delete '+option.textContent);remove.disabled=busy;
   remove.onclick=event=>{event.preventDefault();event.stopPropagation();if(event.shiftKey)choose(option.value,event);else if(!selected.has(option.value))choose(option.value);return run('delete');};
   row.append(item,remove);list.append(row);
  }
  if(!available.length)list.textContent='No saved items';updateActions();
 }
 async function run(action){
  const chosen=ids();if(busy||isBusy()||!chosen.length)return;
  if(action==='delete'&&!window.confirm('Delete '+chosen.length+' saved item'+(chosen.length===1?'':'s')+'? Placed objects remain in the workspace.'))return;
  busy=true;sync();
  try{await(action==='insert'?onInsert:onDelete)(chosen);if(action==='insert')controls.open=false;else{for(const id of chosen)selected.delete(id);empty=false;}}
  catch(error){if(status)status.textContent=error.message||String(error);}
  finally{busy=false;sync();}
 }
 controls.querySelector('.saved-picker-all').onclick=event=>{event.preventDefault();selected=new Set(options().map(option=>option.value));empty=false;anchor=options()[0]?.value;sync();};
 controls.querySelector('.saved-picker-clear').onclick=event=>{event.preventDefault();selected.clear();empty=true;sync();};
 controls.addEventListener('keydown',event=>{if(event.key==='Escape')controls.open=false;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selected=new Set(options().map(option=>option.value));empty=false;sync();}});
 select.addEventListener('change',()=>{if(!selected.size&&!empty&&select.value)selected.add(select.value);sync();});
 new MutationObserver(sync).observe(select,{childList:true,subtree:true});
 insertButton.onclick=insideInsert.onclick=()=>run('insert');if(deleteButton)deleteButton.onclick=()=>run('delete');sync();
 return {sync,ids,controls,update:updateActions};
}
