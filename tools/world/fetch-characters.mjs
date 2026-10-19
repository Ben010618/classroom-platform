// Builds the HD character assets from Quaternius CC0 packs:
//   - Universal Animation Library (direct download, OpenGameArt): rigged mannequin + animations
//   - Universal Base Characters [Standard] (itch.io, free/"name your price" — download it in a browser,
//     then pass the zip path): hairstyles + eyebrows
//   node fetch-characters.mjs --ubc "path/to/Universal Base Characters[Standard].zip"
// Writes assets/characters/{character.glb, hair-*.glb, brows-*.glb} and appends credits.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, simplify, prune, resample, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "assets", "characters");
const TMP = join(here, "work-characters"); // untrusted downloads + extraction, deleted at the end
const UAL_URL = "https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip";
const ubcArg = process.argv.indexOf("--ubc");
const UBC_ZIP = ubcArg > 0 ? process.argv[ubcArg + 1] : null;

// Animations we use (names from the library)
const CLIPS = [
  "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop",
  "Jump_Start", "Jump_Loop", "Jump_Land",
  "Sitting_Enter", "Sitting_Idle_Loop", "Sitting_Exit", "Sitting_Talking_Loop",
  "Idle_Talking_Loop", "Interact", "Dance_Loop"
];
const HAIR = ["Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_Buzzed", "Hair_BuzzedFemale"];
const BROWS = ["Eyebrows_Regular", "Eyebrows_Female"];

const unzip = (zip, dest) => {
  mkdirSync(dest, { recursive: true });
  execFileSync("python", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); [z.extract(n, sys.argv[2]) for n in z.namelist() if '..' not in n and not n.startswith('/')]", zip, dest]);
};
const kb = n => (n / 1024).toFixed(0) + " KB";

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const sizes = [];

// ---------- 1. mannequin + animations
const ualZip = join(TMP, "ual.zip");
writeFileSync(ualZip, new Uint8Array(await (await fetch(UAL_URL)).arrayBuffer()));
unzip(ualZip, join(TMP, "ual"));
const doc = await io.read(join(TMP, "ual", "Animation Library[Standard]", "Godot", "AnimationLibrary_Godot_Standard.glb"));
const root = doc.getRoot();
for (const anim of root.listAnimations()) if (!CLIPS.includes(anim.getName())) anim.dispose();
const missing = CLIPS.filter(c => !root.listAnimations().some(a => a.getName() === c));
if (missing.length) throw new Error("missing animations: " + missing.join(", "));
// Finger and scale tracks barely show at classroom distance but are most of the file: drop them
for (const anim of root.listAnimations()) {
  for (const ch of anim.listChannels()) {
    const bone = ch.getTargetNode() ? ch.getTargetNode().getName() : "";
    if (ch.getTargetPath() === "scale" || /DEF-(f_|thumb|palm)/.test(bone)) { ch.getSampler().dispose(); ch.dispose(); }
  }
}
await doc.transform(
  dedup(), weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.45, error: 0.004 }),
  resample({ tolerance: 0.001 }),    // drop redundant keyframes
  prune()
);
await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));   // EXT_meshopt_compression (mesh + animation)
const charGlb = await io.writeBinary(doc);
writeFileSync(join(OUT, "character.glb"), charGlb);
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
sizes.push(["character.glb", charGlb.length, `${Math.round(tris)} tris, ${root.listAnimations().length} animations`]);

// ---------- 2. hairstyles + eyebrows (static, positioned in model space; attached to the head bone at runtime)
if (UBC_ZIP && existsSync(UBC_ZIP)) {
  unzip(UBC_ZIP, join(TMP, "ubc"));
  const dir = join(TMP, "ubc", "Universal Base Characters[Standard]", "Hairstyles", "Origin at 0", "glTF (Godot)");
  for (const name of [...HAIR, ...BROWS]) {
    const d = await io.read(join(dir, name + ".gltf"));
    await d.transform(dedup(), weld(), prune(), textureCompress({ encoder: sharp, targetFormat: "png", resize: [256, 256] }));
    // Normal maps are heavy and barely visible on hair at this size: drop them
    for (const m of d.getRoot().listMaterials()) { const t = m.getNormalTexture(); if (t) { m.setNormalTexture(null); } }
    await d.transform(prune());
    const glb = await io.writeBinary(d);
    const out = name.replace("Hair_", "hair-").replace("Eyebrows_", "brows-").toLowerCase() + ".glb";
    writeFileSync(join(OUT, out), glb);
    sizes.push([out, glb.length, ""]);
  }
} else {
  console.warn("No --ubc zip given: skipping hairstyles (download 'Universal Base Characters' from quaternius.itch.io).");
}
rmSync(TMP, { recursive: true, force: true });

writeFileSync(join(OUT, "CREDITS.md"), `# Character credits

All character assets are by **Quaternius** and released under **CC0** (public domain).

| Used as | Pack | Link |
| :--- | :--- | :--- |
| Rigged mannequin + ${CLIPS.length} animations | Universal Animation Library [Standard] | https://quaternius.com/packs/universalanimationlibrary.html (download: ${UAL_URL}) |
| Hairstyles (${HAIR.length}) + eyebrows (${BROWS.length}) | Universal Base Characters [Standard] | https://quaternius.itch.io/universal-base-characters |

Reduced for phones by \`tools/world/fetch-characters.mjs\` (mesh simplified, keyframes resampled, hair textures 256 px).
Clothes, skin tone and face are painted at runtime by \`avatar.js\` — no extra textures.
`);
console.log(sizes.map(s => `${s[0].padEnd(24)} ${kb(s[1]).padStart(8)}  ${s[2]}`).join("\n"));
console.log("TOTAL", kb(sizes.reduce((a, s) => a + s[1], 0)));
