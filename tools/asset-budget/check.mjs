#!/usr/bin/env node
// Checks .glb/.gltf files against the classroom asset budget (budget.json).
// Usage: node check.mjs <file-or-dir>... [--budget path] [--json]
// Exit code 1 if any file exceeds a hard cap. Writes a Markdown table to $GITHUB_STEP_SUMMARY when set.
import { readFile, readdir, stat, appendFile } from "node:fs/promises";
import { join, extname, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, ImageUtils } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder } from "meshoptimizer";

const TRIANGLES = 4, TRIANGLE_STRIP = 5, TRIANGLE_FAN = 6;

export async function createIO() {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "meshopt.decoder": MeshoptDecoder,
    });
}

function primitiveTriangles(prim) {
  const mode = prim.getMode();
  const indices = prim.getIndices();
  const position = prim.getAttribute("POSITION");
  const count = indices ? indices.getCount() : position ? position.getCount() : 0;
  if (mode === TRIANGLES) return Math.floor(count / 3);
  if (mode === TRIANGLE_STRIP || mode === TRIANGLE_FAN) return Math.max(0, count - 2);
  return 0; // points / lines don't count toward the triangle budget
}

/** Measures one document. Counts each mesh once per node that uses it (instancing multiplies cost). */
export function measure(doc) {
  const root = doc.getRoot();
  let triangles = 0, drawCalls = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const gpuInstancing = node.getExtension("EXT_mesh_gpu_instancing");
    const instances = gpuInstancing ? gpuInstancing.listAttributes()[0]?.getCount() ?? 1 : 1;
    for (const prim of mesh.listPrimitives()) {
      triangles += primitiveTriangles(prim) * instances;
      drawCalls += 1; // one draw per primitive (GPU instancing is still a single draw)
    }
  }
  let textureMaxSize = 0;
  const oversized = [];
  for (const tex of root.listTextures()) {
    const image = tex.getImage();
    const size = image && ImageUtils.getSize(image, tex.getMimeType());
    if (!size) continue;
    const max = Math.max(size[0], size[1]);
    textureMaxSize = Math.max(textureMaxSize, max);
    oversized.push({ name: tex.getName() || tex.getURI() || "(unnamed)", w: size[0], h: size[1], max });
  }
  oversized.sort((a, b) => b.max - a.max);
  return { triangles, drawCalls, textureMaxSize, textures: root.listTextures().length, largestTextures: oversized.slice(0, 3) };
}

export function grade(metrics, budget) {
  const rows = [];
  let fail = false;
  for (const key of Object.keys(budget)) {
    if (key.startsWith("_") || !(key in metrics)) continue;
    const { target, cap } = budget[key];
    const value = metrics[key];
    const status = value > cap ? "FAIL" : value > target ? "WARN" : "OK";
    if (status === "FAIL") fail = true;
    rows.push({ key, value, target, cap, status });
  }
  return { rows, fail };
}

async function collect(paths) {
  const files = [];
  for (const p of paths) {
    const s = await stat(p);
    if (s.isDirectory()) {
      for (const entry of await readdir(p, { recursive: true })) {
        if ([".glb", ".gltf"].includes(extname(entry).toLowerCase())) files.push(join(p, entry));
      }
    } else files.push(p);
  }
  return files;
}

const fmt = (key, v) => key === "fileSizeMB" ? v.toFixed(2) : Number.isInteger(v) ? v.toLocaleString("en-US") : String(v);
const ICON = { OK: "✅", WARN: "⚠️", FAIL: "❌" };

async function main(argv) {
  const args = argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  let budgetPath = join(here, "budget.json");
  const bi = args.indexOf("--budget");
  if (bi !== -1) { budgetPath = args[bi + 1]; args.splice(bi, 2); }
  const asJson = args.includes("--json");
  const inputs = args.filter((a) => a !== "--json");
  if (!inputs.length) { console.error("usage: check.mjs <file-or-dir>... [--budget budget.json] [--json]"); return 2; }

  const budget = JSON.parse(await readFile(budgetPath, "utf8"));
  const io = await createIO();
  const files = await collect(inputs);
  if (!files.length) { console.error("no .glb/.gltf files found"); return 2; }

  const results = [];
  let anyFail = false;
  for (const file of files) {
    const fileSizeMB = (await stat(file)).size / (1024 * 1024);
    let metrics;
    try {
      metrics = { fileSizeMB, ...measure(await io.read(file)) };
    } catch (e) {
      results.push({ file, error: String(e && e.message || e) });
      anyFail = true;
      continue;
    }
    const { rows, fail } = grade(metrics, budget);
    anyFail ||= fail;
    results.push({ file, metrics, rows, fail });
  }

  if (asJson) console.log(JSON.stringify(results, null, 2));
  const md = ["| File | Size MB | Triangles | Draw calls | Max texture | Result |", "| :--- | ---: | ---: | ---: | ---: | :---: |"];
  for (const r of results) {
    const name = relative(process.cwd(), r.file) || r.file;
    if (r.error) { md.push(`| ${name} | — | — | — | — | ❌ unreadable: ${r.error} |`); continue; }
    const cell = (k) => { const row = r.rows.find((x) => x.key === k); return `${ICON[row.status]} ${fmt(k, row.value)}`; };
    md.push(`| ${name} | ${cell("fileSizeMB")} | ${cell("triangles")} | ${cell("drawCalls")} | ${cell("textureMaxSize")} | ${r.fail ? "❌ FAIL" : r.rows.some((x) => x.status === "WARN") ? "⚠️ WARN" : "✅ OK"} |`);
  }
  md.push("", `Budget: ${Object.entries(budget).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k} ≤ ${v.target} (cap ${v.cap})`).join(" · ")}`);
  if (!asJson) console.log(md.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, "## Asset budget\n\n" + md.join("\n") + "\n");
  return anyFail ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv).then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
