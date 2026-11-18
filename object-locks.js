export function setObjectLock(e,locking,previous=[]){
 if(e.isBusy()||e.commandBlocked?.())return {targets:previous,message:'Finish the current operation first.'};
 let targets=(e.commandSelection?.()||e.selection()).filter(m=>e.pieces().includes(m)&&e.isVisible(m));
 if(!locking&&!targets.length)targets=previous.filter(m=>e.pieces().includes(m)&&e.isVisible(m)&&m.userData.objectLocked);
 if(!targets.length)return {targets:previous,message:'Select one or more objects first.'};
 e.checkpoint();for(const m of targets)m.userData.objectLocked=locking;e.select(targets);e.mark(targets);
 return {targets:locking?targets:[],message:(locking?'Locked ':'Unlocked ')+targets.length+' object(s).'};
}
