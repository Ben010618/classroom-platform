// Exports the Katuro University world as a Hubs scene (.glb).
//   node export.mjs [out.glb]        (default: ../../assets/scenes/katuro-university.glb)
// Steps: build the world with three.js (same world.js as the preview) → GLTFExporter (binary)
//        → gltf-transform (dedup, weld, Draco) → move each node's extras.MOZ_hubs_components into
//        the MOZ_hubs_components glTF extension that Hubs reads.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, draco } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const out = resolve(process.argv[2] || join(here, "../../assets/scenes/katuro-university.glb"));

// ---------- 1. three.js in Node, plus the two non-module example scripts and our world
globalThis.window = globalThis;
globalThis.THREE = { ...require("three") };
globalThis.FileReader = class {
  // GLTFExporter (r128) reads Blobs with FileReader; Node only has Blob#arrayBuffer
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      this.onloadend && this.onloadend();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = "data:" + (blob.type || "application/octet-stream") + ";base64," + Buffer.from(buf).toString("base64");
      this.onloadend && this.onloadend();
    });
  }
};
const load = p => vm.runInThisContext(readFileSync(p, "utf8"), { filename: p });
load(require.resolve("three/examples/js/utils/BufferGeometryUtils.js"));
load(require.resolve("three/examples/js/exporters/GLTFExporter.js"));
load(join(here, "world.js"));

const { scene } = globalThis.buildWorld(THREE);
// Lights travel as Hubs components (hemisphere-light, directional-light) on empty nodes, not as
// KHR_lights_punctual, so Hubs doesn't light the scene twice.
for (const light of scene.children.filter(o => o.isLight)) {
  const node = new THREE.Object3D();
  node.name = light.name;
  node.position.copy(light.position);
  node.userData = light.userData;
  scene.remove(light);
  scene.add(node);
}
scene.updateMatrixWorld(true);

// ---------- 2. three → GLB
const raw = await new Promise((ok, fail) => {
  try {
    new THREE.GLTFExporter().parse(scene, ok, { binary: true, onlyVisible: false, includeCustomExtensions: false });
  } catch (e) {
    fail(e);
  }
});

// ---------- 3. optimise (extras survive gltf-transform)
const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({
    "draco3d.encoder": await draco3d.createEncoderModule(),
    "draco3d.decoder": await draco3d.createDecoderModule()
  });
const doc = await io.readBinary(new Uint8Array(raw));
// UVs are unused (flat colours, no textures): drop them before compressing
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) prim.setAttribute("TEXCOORD_0", null);
await doc.transform(dedup(), weld(), draco({ method: "edgebreaker" }));
const optimized = await io.writeBinary(doc);

// ---------- 4. extras.MOZ_hubs_components → extensions.MOZ_hubs_components (raw GLB JSON patch)
function patchGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const rest = bytes.subarray(20 + jsonLen); // BIN chunk (header included)
  let count = 0;
  for (const node of json.nodes || []) {
    const comps = node.extras && node.extras.MOZ_hubs_components;
    if (!comps) continue;
    delete node.extras.MOZ_hubs_components;
    if (!Object.keys(node.extras).length) delete node.extras;
    if (!Object.keys(comps).length) continue;
    node.extensions = { ...(node.extensions || {}), MOZ_hubs_components: comps };
    count++;
  }
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), "MOZ_hubs_components"])];
  json.extensions = { ...(json.extensions || {}), MOZ_hubs_components: { version: 4 } };
  json.asset = { ...json.asset, generator: "classroom-platform tools/world/export.mjs" };

  let text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (text.length % 4)) % 4;
  const jsonChunk = new Uint8Array(text.length + pad);
  jsonChunk.set(text);
  jsonChunk.fill(0x20, text.length);
  const total = 12 + 8 + jsonChunk.length + rest.length;
  const outBytes = new Uint8Array(total);
  const ov = new DataView(outBytes.buffer);
  ov.setUint32(0, 0x46546c67, true); // "glTF"
  ov.setUint32(4, 2, true);
  ov.setUint32(8, total, true);
  ov.setUint32(12, jsonChunk.length, true);
  ov.setUint32(16, 0x4e4f534a, true); // "JSON"
  outBytes.set(jsonChunk, 20);
  outBytes.set(rest, 20 + jsonChunk.length);
  return { bytes: outBytes, count, json };
}
const { bytes, count, json } = patchGlb(optimized);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);

const names = json.nodes.filter(n => n.extensions && n.extensions.MOZ_hubs_components).map(n => n.name);
const seats = names.filter(n => /^seat-\d+$/.test(n)).length;
console.log(`Wrote ${out}`);
console.log(`  ${(bytes.length / 1024).toFixed(0)} KB · ${json.meshes.length} meshes · ${count} Hubs component nodes`);
console.log(`  seats: ${seats} · podium: ${names.includes("podium")} · screen: ${names.includes("screen")} · pods: ${names.filter(n => /^pod-[a-d]$/.test(n)).length} · spawns: ${names.filter(n => n.startsWith("spawn-")).length} · navmesh: ${names.includes("navmesh")}`);
