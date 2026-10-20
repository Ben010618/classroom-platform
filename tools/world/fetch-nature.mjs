// Builds assets/nature/nature.glb from two Quaternius CC0 packs (download them in a browser first):
//   - Stylized Nature MegaKit [Standard]   → trees, bushes, flowers, rocks (glTF, textured)
//   - Nature Crops Pack                     → coconut palms, bamboo, garden crops in growth stages (FBX)
//   node fetch-nature.mjs --megakit "<Stylized Nature MegaKit[Standard] folder>" --crops "<Nature Crops Pack folder>"
// Every model becomes a node named after it in one file (far-away trees are impostors made at load by nature.js).
// Crop colours are baked into vertex colours (one material → one draw call per model).
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, weld, simplify, prune, join as joinPrims, clearNodeTransform, mergeDocuments, unpartition, meshopt } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";
import convertFbx from "fbx2gltf";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "assets", "nature");
const TMP = join(here, "work-nature");
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const MEGAKIT = arg("--megakit"), CROPS = arg("--crops");
if (!MEGAKIT || !CROPS || !existsSync(MEGAKIT) || !existsSync(CROPS)) {
  console.error('Usage: node fetch-nature.mjs --megakit "<Stylized Nature MegaKit[Standard]>" --crops "<Nature Crops Pack>"');
  process.exit(1);
}
const findDir = (base, name) => {
  if (base.endsWith(name)) return base;
  for (const e of readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const r = findDir(join(base, e.name), name);
    if (r) return r;
  }
  return null;
};

// name → { tris: target triangles }
const KIT = {
  CommonTree_1: { tris: 1800 }, CommonTree_3: { tris: 1500 },   // far trees are impostors made at load (nature.js)
  Bush_Common: { tris: 450 }, Bush_Common_Flowers: { tris: 650 },
  Flower_3_Group: { tris: 420 }, Flower_4_Group: { tris: 700 },
  Rock_Medium_1: { tris: 342 }, Rock_Medium_2: { tris: 244 }, Fern_1: { tris: 288 }, Plant_1_Big: { tris: 360 }
};
const CROP = {
  PalmTree_4: { tris: 1100 }, PalmTree_3: { tris: 800 },
  Bamboo_4: { tris: 420 }, Bamboo_3: { tris: 300 }, Coconut_Half: { tris: 132 }, Orange_4: { tris: 700 },
  Tomato_2: { tris: 200 }, Tomato_3: { tris: 380 }, Tomato_4: { tris: 480 },
  Lettuce_2: { tris: 220 }, Lettuce_3: { tris: 300 }, Lettuce_4: { tris: 380 },
  Corn_2: { tris: 140 }, Corn_3: { tris: 260 }, Corn_4: { tris: 420 },
  Pumpkin_2: { tris: 300 }, Pumpkin_3: { tris: 380 }, Pumpkin_4: { tris: 480 },
  Carrot_2: { tris: 200 }, Carrot_3: { tris: 280 }, Carrot_4: { tris: 340 },
  Watermelon_3: { tris: 380 }, Watermelon_4: { tris: 480 },
  Flower_4: { tris: 230 }, Flower_3: { tris: 152 }
};

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const triCount = doc => doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);

// one model → its own small document: transforms baked, optional colour baking, simplified to a triangle target
async function loadModel(file, opts) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  for (const n of root.listNodes()) if (!n.getParentNode()) clearNodeTransform(n);   // bake FBX centimetre scale etc. into the vertices
  for (const n of root.listNodes()) clearNodeTransform(n);
  if (opts.bakeColors) {
    const shared = doc.createMaterial("VertexColor").setRoughnessFactor(0.85).setMetallicFactor(0);
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
      const c = (p.getMaterial() ? p.getMaterial().getBaseColorFactor() : [1, 1, 1, 1]);
      const n = p.getAttribute("POSITION").getCount();
      const col = new Float32Array(n * 3);
      const old = p.getAttribute("COLOR_0");
      for (let i = 0; i < n; i++) {
        const o = old ? old.getElement(i, []) : [1, 1, 1];
        col[i * 3] = c[0] * o[0]; col[i * 3 + 1] = c[1] * o[1]; col[i * 3 + 2] = c[2] * o[2];
      }
      p.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(col).setBuffer(root.listBuffers()[0]));
      for (const s of p.listSemantics()) if (s.startsWith("TEXCOORD")) p.setAttribute(s, null);
      p.setMaterial(shared);
    }
  }
  for (const m of root.listMaterials()) m.setNormalTexture(null).setMetallicRoughnessTexture(null);
  // Low-poly models store one normal per face, so no two triangles share a vertex and nothing can be simplified.
  // Drop the normals (the preview draws these materials with flatShading, which computes them on the GPU),
  // then weld so neighbouring faces share vertices again.
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute("NORMAL", null);
  await doc.transform(prune(), dedup(), weld(), joinPrims({ keepNamed: false }));
  const before = triCount(doc);
  const simplifyTo = async (d, target, error) => {
    const t = triCount(d);
    if (t > target * 1.05) await d.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / t, error }));
  };
  await simplifyTo(doc, opts.tris, opts.error || 0.01);
  return { doc, before };
}

// textures: 256 px; JPEG when opaque, PNG when the alpha is used (leaves, flowers)
async function shrinkTextures(doc) {
  for (const t of doc.getRoot().listTextures()) {
    const img = sharp(t.getImage());
    const meta = await img.metadata();
    const alpha = meta.hasAlpha;
    const buf = alpha ? await img.resize(256, 256, { fit: "fill" }).png({ compressionLevel: 9, palette: true }).toBuffer()
      : await img.resize(256, 256, { fit: "fill" }).jpeg({ quality: 80 }).toBuffer();
    t.setImage(new Uint8Array(buf)).setMimeType(alpha ? "image/png" : "image/jpeg").setURI("");
  }
}

const out = new Document();
out.createBuffer();
const scene = out.createScene("nature");
out.getRoot().setDefaultScene(scene);
const sizes = [];
async function add(name, doc) {
  const before = new Set(out.getRoot().listScenes());
  mergeDocuments(out, doc);
  const added = out.getRoot().listScenes().filter(s => !before.has(s) && s !== scene);
  const holder = out.createNode(name);
  for (const s of added) { for (const n of s.listChildren()) { s.removeChild(n); holder.addChild(n); } s.dispose(); }
  scene.addChild(holder);
  // measure the model once placed: height helps the world pick a scale
  let lo = Infinity, hi = -Infinity, w = 0;
  holder.traverse(n => { const m = n.getMesh(); if (!m) return; for (const p of m.listPrimitives()) { const a = p.getAttribute("POSITION"); lo = Math.min(lo, a.getMin([])[1]); hi = Math.max(hi, a.getMax([])[1]); w = Math.max(w, a.getMax([])[0] - a.getMin([])[0], a.getMax([])[2] - a.getMin([])[2]); } });
  holder.setExtras({ height: +(hi - lo).toFixed(3), width: +w.toFixed(3), base: +lo.toFixed(3) });
  sizes.push([name, triCount(doc), (hi - lo).toFixed(2)]);
}

// ---------- MegaKit (glTF)
const kitDir = findDir(MEGAKIT, "glTF");
for (const [name, opts] of Object.entries(KIT)) {
  const file = join(kitDir, name + ".gltf");
  const { doc } = await loadModel(file, opts);
  await shrinkTextures(doc);
  await add(name, doc);
}

// ---------- Crops (FBX → glTF with the bundled FBX2glTF, then baked to vertex colours)
const fbxDir = findDir(CROPS, "FBX");
for (const [name, opts] of Object.entries(CROP)) {
  const glb = join(TMP, name + ".glb");
  await convertFbx(join(fbxDir, name + ".fbx"), glb, []);
  const { doc } = await loadModel(glb, { ...opts, bakeColors: true });
  await add(name, doc);
}

await out.transform(unpartition(), dedup(), prune());
await out.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));
const glb = await io.writeBinary(out);
writeFileSync(join(OUT, "nature.glb"), glb);
rmSync(TMP, { recursive: true, force: true });
writeFileSync(join(OUT, "CREDITS.md"), `# Nature credits

All models are by **Quaternius** and released under **CC0** (public domain).

| Used as | Pack | Link |
| :--- | :--- | :--- |
| Shade trees, bushes, flowers, ferns, rocks | Stylized Nature MegaKit [Standard] | https://quaternius.com |
| Coconut palms, bamboo, calamansi tree, garden crops (tomato, pechay, corn, kalabasa, carrot, watermelon) | Nature Crops Pack | https://quaternius.com |

Built by \`tools/world/fetch-nature.mjs\`: textures 256 px without normal maps, crop colours baked into vertex colours,
meshes simplified for phones. Far-away trees are impostors (a picture on crossed planes) made at load time.
`);
console.log(sizes.map(s => `${s[0].padEnd(22)} ${String(Math.round(s[1])).padStart(6)} tris  h ${s[2]} m`).join("\n"));
console.log("nature.glb", (glb.length / 1024).toFixed(0), "KB");
