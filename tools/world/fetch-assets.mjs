// Downloads the CC0 assets the realistic world uses from Poly Haven, shrinks them for budget phones,
// and writes assets/ + assets/CREDITS.md. Re-run to refresh; output is committed so the preview
// works without running this.
//   node fetch-assets.mjs
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, simplify, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "assets");
const TMP = join(here, "work-download");   // untrusted downloads live only here, deleted at the end
const API = "https://api.polyhaven.com";
const TEX_SIZE = 512;

// Tiled surface materials: Poly Haven texture id → our material name
const TEXTURES = [
  { id: "terrazzo_tiles", as: "floor" },
  { id: "painted_plaster_wall", as: "wall" },
  { id: "corrugated_iron", as: "roof" },
  { id: "concrete_floor_02", as: "concrete" },
  { id: "leafy_grass", as: "grass" },
  { id: "asphalt_floor", as: "court" },
  { id: "wood_table", as: "wood" }
];
// Models: simplify ratio keeps budget phones in mind (35 desks + 35 chairs are instanced)
const MODELS = [
  { id: "SchoolDesk_01", as: "desk", ratio: 0.12, error: 0.02 },
  { id: "SchoolChair_01", as: "chair", ratio: 0.1, error: 0.02 },
  { id: "metal_office_desk", as: "teacher-desk", ratio: 0.5 },
  { id: "ceiling_fan", as: "ceiling-fan", ratio: 0.1, error: 0.01 },
  { id: "Shelf_01", as: "shelf", ratio: 1 }
];
const HDRI = { id: "kloofendal_48d_partly_cloudy_puresky", res: "1k" };

const getJson = async url => {
  const r = await fetch(url, { headers: { "User-Agent": "classroom-platform asset fetch" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const getBytes = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
};
const kb = n => (n / 1024).toFixed(0) + " KB";
const credits = [];
const sizes = [];

mkdirSync(join(OUT, "tex"), { recursive: true });
mkdirSync(join(OUT, "models"), { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// ---------- textures: Diffuse + normal (OpenGL), 1k JPG → 512 px JPG
for (const t of TEXTURES) {
  const files = await getJson(`${API}/files/${t.id}`);
  const info = await getJson(`${API}/info/${t.id}`);
  for (const [map, suffix, quality] of [["Diffuse", "diff", 82], ["nor_gl", "nor", 88]]) {
    const src = await getBytes(files[map]["1k"].jpg.url);
    const out = await sharp(src).resize(TEX_SIZE, TEX_SIZE).jpeg({ quality, mozjpeg: true }).toBuffer();
    writeFileSync(join(OUT, "tex", `${t.as}_${suffix}.jpg`), out);
    sizes.push([`tex/${t.as}_${suffix}.jpg`, out.length]);
  }
  credits.push([t.as, info.name, `https://polyhaven.com/a/${t.id}`, Object.keys(info.authors || {}).join(", ")]);
}

// ---------- sky: HDR for lighting + background
{
  const files = await getJson(`${API}/files/${HDRI.id}`);
  const info = await getJson(`${API}/info/${HDRI.id}`);
  const hdr = await getBytes(files.hdri[HDRI.res].hdr.url);
  writeFileSync(join(OUT, "sky.hdr"), hdr);
  sizes.push(["sky.hdr", hdr.length]);
  // Sharper background: the tone-mapped JPG (8K source) reduced to 2048×1024
  const bg = await sharp(await getBytes(files.tonemapped.url)).resize(2048, 1024).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  writeFileSync(join(OUT, "sky.jpg"), bg);
  sizes.push(["sky.jpg", bg.length]);
  credits.push(["sky", info.name, `https://polyhaven.com/a/${HDRI.id}`, Object.keys(info.authors || {}).join(", ")]);
}

// ---------- models: glTF 1k → simplify → 512 px JPEG textures → GLB
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
for (const m of MODELS) {
  const files = await getJson(`${API}/files/${m.id}`);
  const info = await getJson(`${API}/info/${m.id}`);
  const g = files.gltf["1k"].gltf;
  const dir = join(TMP, m.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "model.gltf"), await getBytes(g.url));
  for (const [rel, inc] of Object.entries(g.include || {})) {
    if (rel.includes("..") || rel.startsWith("/")) throw new Error("unsafe path in " + m.id + ": " + rel);
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, await getBytes(inc.url));
  }
  const doc = await io.read(join(dir, "model.gltf"));
  const before = triangles(doc);
  const steps = [dedup(), weld()];
  if (m.ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: m.ratio, error: m.error ?? 0.002 }));
  steps.push(prune(), textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [TEX_SIZE, TEX_SIZE], quality: 82 }));
  await doc.transform(...steps);
  const glb = await io.writeBinary(doc);
  writeFileSync(join(OUT, "models", `${m.as}.glb`), glb);
  sizes.push([`models/${m.as}.glb`, glb.length, `${before} → ${triangles(doc)} tris`]);
  credits.push([m.as, info.name, `https://polyhaven.com/a/${m.id}`, Object.keys(info.authors || {}).join(", ")]);
}
rmSync(TMP, { recursive: true, force: true });

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      n += Math.floor((idx ? idx.getCount() : p.getAttribute("POSITION").getCount()) / 3);
    }
  return n;
}

// ---------- credits
const total = sizes.reduce((s, x) => s + x[1], 0);
writeFileSync(
  join(OUT, "CREDITS.md"),
  `# Asset credits

All assets are from [Poly Haven](https://polyhaven.com) and released under **CC0** (public domain):
free for any use, no attribution required. We credit them anyway. Downloaded and reduced for budget
phones by \`tools/world/fetch-assets.mjs\` (textures 512 px JPEG, models simplified).

| Used as | Asset | Link | Author(s) |
| :--- | :--- | :--- | :--- |
${credits.map(c => `| ${c[0]} | ${c[1]} | ${c[2]} | ${c[3]} |`).join("\n")}

Total size: ${kb(total)}
`
);
console.log(sizes.map(s => `${s[0].padEnd(26)} ${kb(s[1]).padStart(8)}  ${s[2] || ""}`).join("\n"));
console.log("TOTAL", kb(total));
