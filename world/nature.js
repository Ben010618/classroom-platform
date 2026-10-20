// ============================================================================================
// NATURE — real trees, palms, bamboo, bushes, flowers, rocks and garden crops (Quaternius CC0, built by
// fetch-nature.mjs into assets/nature/nature.glb). Placements come from world.js (realNature).
// Draw calls stay low:
//   - trees and palms: one near (full model) + one far (impostor: 4 triangles) instanced mesh per model for the
//     whole campus; every quarter second each tree is put in the near or far set by its distance to the camera
//   - everything small: merged into one mesh per material per 40 m chunk, hidden beyond 70 m
//   - the garden: one merged mesh, rebuilt when a bed grows (W.nature.growBed, called when you water it)
// ============================================================================================
const W = await new Promise(ok => window.__world ? ok(window.__world) : window.addEventListener("world-ready", () => ok(window.__world), { once: true }));
const { THREE, scene } = W;
if (!W.nature || !W.nature.length) await new Promise(() => {});   // Simple graphics keeps the low-poly trees: nothing to do

const { MeshoptDecoder } = await import("https://cdn.jsdelivr.net/npm/meshoptimizer@1.3.0/meshopt_decoder.mjs");
await MeshoptDecoder.ready;
const loader = new THREE.GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await new Promise((ok, fail) => loader.load(`assets/nature/nature.glb?v=${W.build}`, ok, undefined, fail));

// ---------------------------------------------------------------- wind: leaves and fronds sway with height
const wind = { t: { value: 0 } };
function addSway(mat, amp) {
  if (mat.userData.sway) return;
  mat.userData.sway = true;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = wind.t;
    shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  #ifdef USE_INSTANCING
    // instanced trees: positions are quantised, so measure in world metres and convert the offset back
    vec3 ip = instanceMatrix[3].xyz;
    float h = max(0.0, (instanceMatrix * vec4(position, 1.0)).y);
    float k = 1.0 / length(instanceMatrix[0].xyz);
  #else
    // merged plants: vertices are already in world metres
    vec3 ip = position;
    float h = max(0.0, position.y);
    float k = 1.0;
  #endif
  float ph = ip.x * 0.31 + ip.z * 0.27;
  float a = ${amp.toFixed(3)} * clamp(h / 5.0, 0.0, 1.0) * 0.4 * k;   // tips move most, trunks stay put
  transformed.x += (sin(uTime * 1.6 + ph) + 0.3 * sin(uTime * 4.1 + ph * 2.0)) * a;
  transformed.z += cos(uTime * 1.2 + ph * 0.8) * a * 0.6;`);
  };
  mat.customProgramCacheKey = () => "nature-sway" + amp;
}

// ---------------------------------------------------------------- templates: name → parts [{ geometry, material, local }]
const templates = {};
gltf.scene.updateMatrixWorld(true);
for (const holder of gltf.scene.children) {
  const parts = [];
  holder.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    m.flatShading = true;                        // the build dropped the per-face normals
    if (m.alphaTest > 0 || /Leaves|Leaf|Grass|Flowers/i.test(m.name)) { m.side = THREE.DoubleSide; m.alphaTest = Math.max(m.alphaTest, 0.45); m.transparent = false; }
    if (!/Bark|Rocks/i.test(m.name)) addSway(m, /Leaves_NormalTree|VertexColor/.test(m.name) ? 0.25 : 0.45);
    m.needsUpdate = true;
    // the part's transform includes the dequantisation of its positions
    parts.push({ geometry: o.geometry, material: m, local: new THREE.Matrix4().copy(holder.matrixWorld).invert().multiply(o.matrixWorld) });
  });
  templates[holder.name] = { parts, ...holder.userData };
}
const placeMatrix = (p, out) => out.compose(new THREE.Vector3(p.x, p.y || 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.ry || 0), new THREE.Vector3(p.s || 1, p.s || 1, p.s || 1));

// Quantised attribute → plain floats (three r128 doesn't de-normalise in getX/applyMatrix4)
function floats(attr) {
  const a = attr.array, n = attr.count, size = attr.itemSize, out = new Float32Array(n * size);
  const div = !attr.normalized ? 1 : a instanceof Int8Array ? 127 : a instanceof Uint8Array ? 255 : a instanceof Int16Array ? 32767 : a instanceof Uint16Array ? 65535 : 1;
  const signed = a instanceof Int8Array || a instanceof Int16Array;
  if (attr.isInterleavedBufferAttribute) {
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) out[i * size + c] = attr.getComponent ? attr.getComponent(i, c) / div : [attr.getX(i), attr.getY(i), attr.getZ(i), attr.getW(i)][c] / div;
  } else {
    for (let i = 0; i < n * size; i++) out[i] = signed ? Math.max(a[i] / div, -1) : a[i] / div;
  }
  return out;
}
// Merge many placed parts that share one material into a single world-space geometry
function mergeParts(list) {
  let verts = 0, idx = 0;
  for (const { part } of list) { verts += part.geometry.attributes.position.count; idx += part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count; }
  const pos = new Float32Array(verts * 3), hasColor = !!list[0].part.geometry.attributes.color, hasUv = !!list[0].part.geometry.attributes.uv;
  const col = hasColor ? new Float32Array(verts * 3) : null, uv = hasUv ? new Float32Array(verts * 2) : null;
  const index = new Uint32Array(idx);
  let vo = 0, io = 0;
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const { part, p } of list) {
    const g = part.geometry, n = g.attributes.position.count;
    placeMatrix(p, m).multiply(part.local);
    const P = floats(g.attributes.position);
    for (let i = 0; i < n; i++) { v.fromArray(P, i * 3).applyMatrix4(m); v.toArray(pos, (vo + i) * 3); }
    if (col) { const C = g.attributes.color ? floats(g.attributes.color) : null; const cs = g.attributes.color ? g.attributes.color.itemSize : 3; for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) col[(vo + i) * 3 + c] = C ? C[i * cs + c] : 1; }
    if (uv && g.attributes.uv) uv.set(floats(g.attributes.uv), vo * 2);
    if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) index[io + i] = I[i] + vo; io += I.length; }
    else { for (let i = 0; i < n; i++) index[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (col) out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
// placements → one mesh per material
function mergedMeshes(placements) {
  const byMat = new Map();
  for (const p of placements) {
    const t = templates[p.kind];
    if (!t) continue;
    for (const part of t.parts) (byMat.get(part.material) || byMat.set(part.material, []).get(part.material)).push({ part, p });
  }
  return [...byMat].map(([mat, list]) => { const mesh = new THREE.Mesh(mergeParts(list), mat); scene.add(mesh); return mesh; });
}

// ---------------------------------------------------------------- trees + palms: instanced, near/far by distance
const TREE = /^(CommonTree|PalmTree)/;
const treeSets = [];   // { list, near: [InstancedMesh], far: [InstancedMesh] }
const tmpM = new THREE.Matrix4();
function instancedSet(t, n) {
  return t.parts.map(part => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, n);
    mesh.frustumCulled = false;   // spread over the whole campus
    mesh.userData.local = part.local;
    scene.add(mesh);
    return mesh;
  });
}
// Impostor for far trees: the model rendered once into a texture at load, shown on two crossed planes
// (4 triangles). Simplifying the mesh instead strips the leaf cards and fronds and leaves bare trunks.
function impostor(t) {
  const holder = new THREE.Group();
  for (const part of t.parts) { const m = new THREE.Mesh(part.geometry, part.material); m.applyMatrix4(part.local); holder.add(m); }
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const w = Math.max(size.x, size.z), h = size.y;
  const s2 = new THREE.Scene();
  s2.add(new THREE.HemisphereLight(0xe8f1ff, 0x8a8170, 1.1), holder);
  const sun = new THREE.DirectionalLight(0xfff2dc, 0.9); sun.position.set(0.5, 1, 1); s2.add(sun);
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100);
  cam.position.set(c.x, c.y, c.z + 50); cam.lookAt(c.x, c.y, c.z);
  const rt = new THREE.WebGLRenderTarget(256, 512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const r = W.renderer, oldClear = r.getClearColor(new THREE.Color()), oldAlpha = r.getClearAlpha(), oldMap = r.toneMapping;
  r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.toneMapping = THREE.NoToneMapping; r.clear(); r.render(s2, cam);
  r.setRenderTarget(null); r.setClearColor(oldClear, oldAlpha); r.toneMapping = oldMap;
  const planes = [0, Math.PI / 2].map(a => new THREE.PlaneGeometry(w, h).translate(0, c.y, 0).rotateY(a).translate(c.x, 0, c.z));
  const geometry = THREE.BufferGeometryUtils.mergeBufferGeometries(planes);
  const material = new THREE.MeshBasicMaterial({ map: rt.texture, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xd8d8d8 });
  return { parts: [{ geometry, material, local: new THREE.Matrix4() }] };
}
const byKind = new Map();
for (const p of W.nature) if (TREE.test(p.kind)) (byKind.get(p.kind) || byKind.set(p.kind, []).get(p.kind)).push(p);
for (const [kind, list] of byKind) {
  if (!templates[kind]) continue;
  treeSets.push({ list, near: instancedSet(templates[kind], list.length), far: instancedSet(impostor(templates[kind]), list.length) });
}
function updateTrees(cam) {
  for (const s of treeSets) {
    let nn = 0, nf = 0;
    for (const p of s.list) {
      const near = !s.far || Math.hypot(p.x - cam.x, p.z - cam.z) < 25;
      placeMatrix(p, tmpM);
      const set = near ? s.near : s.far, i = near ? nn++ : nf++;
      for (const mesh of set) mesh.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(tmpM, mesh.userData.local));
    }
    for (const mesh of s.near) { mesh.count = nn; mesh.visible = nn > 0; mesh.instanceMatrix.needsUpdate = true; }
    if (s.far) for (const mesh of s.far) { mesh.count = nf; mesh.visible = nf > 0; mesh.instanceMatrix.needsUpdate = true; }
  }
}

// ---------------------------------------------------------------- small plants: merged per 40 m chunk
const CELL = 40, HIDE = 70;
const chunks = [];   // { x, z, r, meshes }
const cells = new Map();
for (const p of W.nature) {
  if (TREE.test(p.kind)) continue;
  const key = Math.floor(p.x / CELL) + "," + Math.floor(p.z / CELL);
  (cells.get(key) || cells.set(key, []).get(key)).push(p);
}
for (const list of cells.values()) {
  const x = list.reduce((a, p) => a + p.x, 0) / list.length, z = list.reduce((a, p) => a + p.z, 0) / list.length;
  chunks.push({ x, z, r: Math.max(...list.map(p => Math.hypot(p.x - x, p.z - z))) + 2, meshes: mergedMeshes(list) });
}

// ---------------------------------------------------------------- garden beds: crops at growth stages, one mesh
const CROP_SCALE = { Tomato: 0.62, Lettuce: 0.85, Corn: 0.85, Pumpkin: 0.75, Carrot: 0.55, Watermelon: 0.7 };
const beds = (W.beds || []).map(b => ({ ...b }));
const garden = { x: -6, z: -38, r: 14, meshes: [] };
function plantGarden() {
  for (const m of garden.meshes) { scene.remove(m); m.geometry.dispose(); }
  const placements = [];
  for (const b of beds) b.spots.forEach(([x, z], k) => placements.push({ kind: `${b.crop}_${b.stage}`, x, z, y: b.y, ry: (k * 2.3) % 6.28, s: CROP_SCALE[b.crop] * (0.9 + (k % 3) * 0.08) }));
  garden.meshes = mergedMeshes(placements);
}
plantGarden();
chunks.push(garden);
W.nature.growBed = i => {   // returns the new stage, or 0 if the bed is already fully grown
  const b = beds[i];
  if (!b || b.stage >= 4) return 0;
  b.stage++;
  plantGarden();
  return b.stage;
};

// ---------------------------------------------------------------- per frame
let acc = 1;
W.hooks.push((dt, t) => {
  wind.t.value = t;
  acc += dt; if (acc < 0.25) return; acc = 0;
  const cam = W.camera.position;
  updateTrees(cam);
  for (const c of chunks) {
    const show = Math.hypot(c.x - cam.x, c.z - cam.z) - c.r < (c === garden ? 50 : HIDE);
    for (const m of c.meshes) m.visible = show;
  }
});
window.dispatchEvent(new Event("nature-ready"));
