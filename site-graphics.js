import * as T from './three.js';

export function waterHatch() {
 const material = new T.MeshBasicMaterial({
  color: 0xd654ae, side: T.DoubleSide, transparent: true, opacity: .66, depthWrite: false
 });
 material.onBeforeCompile = shader => {
  shader.vertexShader = 'varying vec2 hatchPosition;\n' + shader.vertexShader.replace(
   '#include <begin_vertex>',
   '#include <begin_vertex>\nhatchPosition = position.xy;'
  );
  shader.fragmentShader = 'varying vec2 hatchPosition;\n' + shader.fragmentShader.replace(
   '#include <color_fragment>',
   `#include <color_fragment>
    float phase = (hatchPosition.x - hatchPosition.y) / 7200.0;
    float filterWidth = max(fwidth(phase), .001);
    float stripe = 1.0 - smoothstep(.08 - filterWidth * .5, .08 + filterWidth * .5, abs(fract(phase + .5) - .5));
    diffuseColor.a *= mix(stripe, .16, smoothstep(.25, 1.0, filterWidth));
   `
  );
 };
 return material;
}

export function addParcelGraphics(root, boundary) {
 const corners = boundary.slice(0,4);
 const parcel = new T.Shape(corners.map(([x,y]) => new T.Vector2(x,y)));
 const ground = new T.Mesh(new T.ShapeGeometry(parcel), new T.MeshBasicMaterial({
  color: 0x292929, side: T.DoubleSide
 }));
 ground.position.z = -12;
 root.add(ground);
 const vertices = corners.map(([x,y]) => new T.Vector3(x,y,30));
 const border = new T.LineLoop(new T.BufferGeometry().setFromPoints(vertices),
  new T.LineBasicMaterial({color: 0xe4e4e4}));
 root.add(border);
}

export function addVegetation(root, data, originX, originY) {
 const plantingMaterial = new T.MeshBasicMaterial({color: 0x303030, side: T.DoubleSide});
 for (const polygon of data.planting || []) {
  const shape = new T.Shape(polygon.map(([x,y]) =>
   new T.Vector2((x-originX)*1000, (y-originY)*1000)));
  const bed = new T.Mesh(new T.ShapeGeometry(shape), plantingMaterial);
  bed.position.z = 20;
  root.add(bed);
 }
 const trees = data.trees || [];
 if (!trees.length) return [plantingMaterial];
 const canopy = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1),
  new T.MeshBasicMaterial({color: 0x484848}), trees.length);
 canopy.name = 'Mapped tree canopies';
 const transform = new T.Object3D();
 trees.forEach(([x,y,radius=2.1], index) => {
  const size = radius*1000;
  transform.position.set((x-originX)*1000, (y-originY)*1000, size*1.25);
  transform.scale.set(size, size, size*.85);
  transform.rotation.z = index*2.39996;
  transform.updateMatrix();
  canopy.setMatrixAt(index, transform.matrix);
 });
 root.add(canopy);
 return [plantingMaterial, canopy.material];
}
