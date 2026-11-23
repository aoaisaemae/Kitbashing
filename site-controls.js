import * as T from './three.js';

const features = [['vegetation', 'Vegetation'], ['road', 'Roads / streets'], ['building', 'Buildings']];

export function installSiteHighlights(slot, mark) {
 const controls = document.createElement('fieldset');
 controls.className = 'site-highlights';
 controls.innerHTML = '<legend>Show</legend>';
 controls.setAttribute('role', 'group');
 controls.setAttribute('aria-label', 'Highlight site features');
 slot.querySelector('.site-boundary').after(controls);
 const layers = new Map();
 const active = new Set();
 function update(key) {
  const layer = layers.get(key);
  const pressed = active.has(key);
  layer.checkbox.checked = pressed;
  for (const [material, base] of layer.materials) material.color.setHex(pressed ? 0x25edff : base);
 }
 for (const [key, title] of features) {
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  label.append(checkbox, title);
  checkbox.onchange = () => {
   if (!active.delete(key)) active.add(key);
   update(key);
   mark();
  };
  controls.append(label);
  layers.set(key, {checkbox, materials: new Map()});
  update(key);
 }
 return {
  add(key, material) {
   const layer = layers.get(key);
   if (!layer || layer.materials.has(material)) return;
   layer.materials.set(material, material.color.getHex());
   update(key);
  },
  save: () => [...active],
  restore(keys) {
   active.clear();
   for (const key of keys || []) if (layers.has(key)) active.add(key);
   for (const key of layers.keys()) update(key);
  }
 };
}


const locations = [
 ['waterfront', 'Waterfront', .78, .50],
 ['entry', 'Entry points', .23, .70],
 ['movement', 'Movement', .25, .28],
 ['gathering', 'Gathering areas', .52, .70]
];

export function installSiteKitbash(e, slot, prepare) {
 const panel = document.createElement('details');
 panel.className = 'property-group iteration-curves-group';
 panel.innerHTML = '<summary>KITBASH</summary><div class="property-group-content"><h3>Input curves</h3><p class="hint" role="status"></p></div>';
 slot.closest('details').nextElementSibling.after(panel);
 const content = panel.lastElementChild, status = content.querySelector('p');
 const fields = locations.map((_, index) => {
  const row = document.createElement('div');
  row.className = 'kitbash-row';
  const curve = document.createElement('select'), location = document.createElement('select');
  curve.setAttribute('aria-label', 'Curve or program ' + (index+1));
  location.setAttribute('aria-label', 'Site location ' + (index+1));
  location.append(new Option('Choose a location', ''), ...locations.map(([value,label]) => new Option(label,value)));
  row.append(curve, location);
  content.append(row);
  return {curve, location};
 });
 const deploy = document.createElement('button');
 deploy.type = 'button';
 deploy.textContent = 'Deploy';
 content.append(deploy);
 let sent = [], rows = [], deployed = [], sourceKey, busy = false;
 const group = new T.Group();
 const source = (requested = sent) => {
  const ids = new Set(requested);
  return new Map(e.pieces().filter(mesh => ids.has(mesh.studioId) && mesh.isLine).map(mesh => [mesh.studioId, mesh]));
 };
 function update() {
  const curves = [...source()].map(([id,mesh]) => [id,mesh.userData.program || mesh.name || 'Curve']);
  const key = JSON.stringify(curves);
  if (key === sourceKey) return;
  sourceKey = key;
  status.textContent = curves.length ? curves.length + ' from Assign' : 'Use Send to site in Assign.';
  for (const [i,{curve,location}] of fields.entries()) {
   curve.replaceChildren(new Option('Choose a curve', ''), ...curves.map(([id,name]) => new Option(name,id)));
   curve.value = curves.some(([id]) => id === rows[i]?.[0]) ? rows[i][0] : '';
   location.value = rows[i]?.[1] || '';
   curve.disabled = location.disabled = !curves.length;
  }
  deploy.disabled = busy || !curves.length;
 }
 for (const {curve,location} of fields) curve.onchange = location.onchange = () => {
  rows = fields.map(field => [field.curve.value,field.location.value]);
  e.mark([]);
 };
 function render(boundary) {
  const drawn = source(deployed.map(([id]) => id));
  for (const child of [...group.children]) {
   child.geometry.dispose();
   child.material.dispose();
   group.remove(child);
  }
  const [sw,se,ne,nw] = boundary.map(point => new T.Vector2(...point));
  const width = Math.min(sw.distanceTo(se),nw.distanceTo(ne));
  const height = Math.min(sw.distanceTo(nw),se.distanceTo(ne));
  for (const [id,,u,v] of locations) {
   const items = deployed.filter(([curve,location]) => location === id && drawn.has(curve));
   for (const [i,[curve]] of items.entries()) {
    const mesh = drawn.get(curve);
    mesh.updateWorldMatrix(true,false);
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new T.Vector3());
    const size = geometry.boundingBox.getSize(new T.Vector3());
    const scale = Math.min(1,width*.26/items.length/Math.max(size.x,1),height*.24/Math.max(size.y,1));
    const x = u + .26*((i+.5)/items.length-.5);
    const target = sw.clone().lerp(se,x).lerp(nw.clone().lerp(ne,x),v);
    geometry.translate(-center.x,-center.y,0).scale(scale,scale,0).translate(target.x,target.y,160);
    const line = new T.LineSegments(geometry,new T.LineBasicMaterial({color:0x70ffff}));
    line.name = mesh.userData.program || mesh.name;
    group.add(line);
   }
  }
  return group.children.length;
 }
 deploy.disabled = true;
 deploy.onclick = async () => {
  if (busy || e.isBusy()) return;
  if (rows.some(([curve,location]) => Boolean(curve) !== Boolean(location))) {
   status.textContent = 'Choose both a curve and a location in each used row.';
   return;
  }
  const mappings = rows.filter(([curve,location]) => source().has(curve) && locations.some(([id]) => id === location));
  if (!mappings.length) { status.textContent = 'Choose a curve and its site location first.'; return; }
  busy = deploy.disabled = true;
  try {
   const {boundary, focus} = await prepare();
   deployed = mappings;
   const count = render(boundary);
   focus();
   status.textContent = 'Deployed ' + count + (count === 1 ? ' curve.' : ' curves.');
   e.mark([]);
  } catch (error) { status.textContent = 'Could not deploy: ' + error.message; }
  finally { busy = deploy.disabled = false; }
 };
 return {
  group, render, update,
  send(ids) {
   sent = ids;
   rows = rows.map(([curve,location]) => [sent.includes(curve) ? curve : '',location]);
   sourceKey = undefined;
   update();
   panel.open = true;
  },
  save: () => ({sent,rows,deployed}),
  restore(state) {
   sent = state?.sent || [];
   rows = state?.rows || [];
   deployed = state?.deployed || [];
   sourceKey = undefined;
  }
 };
}
