export function organizeProperties(e){
 const {$}=e,section=$('.inspector>.section');
 const make=(title,id,open=false)=>{const d=document.createElement('details');d.className='property-group';d.id=id;d.open=open;const summary=document.createElement('summary');summary.textContent=title;const content=document.createElement('div');content.className='property-group-content';d.append(summary,content);return {element:d,content};};
 const workspace=make('Workspace','propertiesWorkspace',true),transform=make('Transform','propertiesTransform',true),fusion=make('Fusion','propertiesFusion'),clipping=make('Clipping Plane','propertiesClipping');
 const commands=$('.workspace-commands');if(commands){for(const b of commands.querySelectorAll('button'))workspace.content.append(b);}
 const arrange=$('#arrange');arrange.textContent='Arrange in grid';for(const id of ['addAllImports','clearWorkspace','arrange','lastEdited','previousSelection'])workspace.content.append($('#'+id));
 const split=document.createElement('button');split.id='splitFromProperties';split.textContent='Split · Level 1 / Level 2';split.onclick=e.split;workspace.content.append(split);
 const reset=$('#reset');reset.parentElement.querySelector('h3').textContent='Selection';transform.content.append(reset.parentElement);
 const fields=$('#transforms'),presets=$('.rotation-presets'),scaleLabel=[...fields.querySelectorAll('.transform-label')].find(n=>n.textContent==='Scale');presets.querySelector('h3').textContent='Rotation selection';fields.insertBefore(presets,scaleLabel);transform.content.append(fields,$('#snap').closest('.row'),$('.mirror-panel'),$('#duplicate').parentElement,$('#copyObjects').parentElement,$('#beginAlign'));
 const densityLabel=$('#detail').previousElementSibling,densityRange=$('#detail').nextElementSibling;fusion.content.append(densityLabel,$('#detail'),densityRange,$('#fuse'));
 const repair=make('Mesh repair & print checks','propertiesRepair');const repairPanel=$('.repair-panel');repairPanel.querySelector('hr')?.remove();repair.content.append(repairPanel);fusion.content.append(repair.element,section.querySelector('.note'));
 const cad=$('.cad-panel'),clipButtons=$('#clipMove').parentElement;for(const id of ['enableClip','disableClip','clipMove','clipRotate','applyClip','flipClip'])clipButtons.append($('#'+id));clipping.content.append($('#makeClip'),clipButtons);for(const hint of cad.querySelectorAll('.hint'))clipping.content.append(hint);
 const eyebrow=section.querySelector(':scope>.eyebrow'),title=section.querySelector(':scope>h2'),selected=section.querySelector('.selected');section.replaceChildren(eyebrow,title,selected,workspace.element,transform.element,fusion.element,clipping.element);
}
