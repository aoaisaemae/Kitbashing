export function organizeProperties(e){
 const {$}=e,section=$('.inspector>.section');
 const make=(title,id,open=false)=>{const d=document.createElement('details');d.className='property-group';d.id=id;d.open=open;const summary=document.createElement('summary');summary.textContent=title;const content=document.createElement('div');content.className='property-group-content';d.append(summary,content);return {element:d,content};};
 const workspace=make('Workspace','propertiesWorkspace',true),transform=make('Transform','propertiesTransform',true),fusion=make('Grouping','propertiesFusion'),clipping=make('Clipping Plane','propertiesClipping');
 const commands=$('.workspace-commands');if(commands){for(const b of commands.querySelectorAll('button'))workspace.content.append(b);}
 const arrange=$('#arrange');arrange.textContent='Arrange in grid';for(const id of ['addAllImports','clearWorkspace','arrange','lastEdited','previousSelection']){const button=$('#'+id);if(button)workspace.content.append(button);}
 const reset=$('#reset');reset.parentElement.querySelector('h3').textContent='Selection';transform.content.append(reset.parentElement);
 const fields=$('#transforms'),presets=$('.rotation-presets'),scaleLabel=[...fields.querySelectorAll('.transform-label')].find(n=>n.textContent==='Scale');presets.querySelector('h3').textContent='Rotation selection';fields.insertBefore(presets,scaleLabel);transform.content.append(fields,$('#snap').closest('.row'),$('.mirror-panel'),$('#duplicate').parentElement,$('#copyObjects').parentElement,$('#beginAlign'));
 const group=$('#fuse');group.textContent='Group selected';fusion.content.append(group);
 const ungroup=document.createElement('button');ungroup.textContent='Ungroup selected';ungroup.id='ungroupComposition';fusion.content.append(ungroup);
 const saved=make('Save Composition','propertiesSaveComposition');e.compositions(saved.content);fusion.content.append(saved.element);
 const repairPanel=$('.repair-panel'),density=$('#detail');
 const hidden=document.createElement('div');hidden.hidden=true;hidden.style.display='none';hidden.append(density.previousElementSibling,density,density.nextElementSibling,repairPanel);
 const cad=$('.cad-panel'),clipButtons=$('#clipMove').parentElement;for(const id of ['enableClip','disableClip','clipMove','clipRotate','applyClip','flipClip'])clipButtons.append($('#'+id));clipping.content.append($('#makeClip'),clipButtons);
 const eyebrow=section.querySelector(':scope>.eyebrow'),title=section.querySelector(':scope>h2'),selected=section.querySelector('.selected');hidden.append(selected);section.replaceChildren(eyebrow,title,workspace.element,transform.element,fusion.element,clipping.element,hidden);
}
