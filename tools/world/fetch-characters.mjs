// Builds the HD character assets from Quaternius CC0 packs:
//   - Universal Base Characters [Standard] (itch.io, free/"name your price" — download it in a browser,
//     then pass the zip or its extracted folder): realistic male + female bodies, hairstyles, eyebrows, eyes
//   - Universal Animation Library [Standard] (direct download, OpenGameArt): the animations, which are
//     RETARGETED here from the library's rig (DEF-* bones) onto the bodies' rig (pelvis, spine_01, …)
//   node fetch-characters.mjs --ubc "path/to/Universal Base Characters[Standard].zip"
// Writes assets/characters/{body-male.glb, body-female.glb, hair-*.glb} and the credits.
import { mkdirSync, writeFileSync, rmSync, existsSync, statSync, readdirSync, copyFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import * as THREE from "three";
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, weld, simplify, prune, resample, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "assets", "characters");
const TMP = join(here, "work-characters"); // untrusted downloads + extraction, deleted at the end
const UAL_URL = "https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip";
const ubcArg = process.argv.indexOf("--ubc");
const UBC = ubcArg > 0 ? process.argv[ubcArg + 1] : null;
const FPS = 30;

// Animations we use (names from the library)
const CLIPS = [
  "Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop",
  "Jump_Start", "Jump_Loop", "Jump_Land",
  "Sitting_Enter", "Sitting_Idle_Loop", "Sitting_Exit", "Sitting_Talking_Loop",
  "Idle_Talking_Loop", "Interact", "Dance_Loop", "PickUp_Table", "Walk_Formal_Loop"
];
const HAIR = ["Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_Buzzed", "Hair_BuzzedFemale"];

// Library bone → body bone. Both rigs stand in the same T-pose with matching bone axes.
const BONES = {
  root: "root", "DEF-hips": "pelvis", "DEF-spine.001": "spine_01", "DEF-spine.002": "spine_02", "DEF-spine.003": "spine_03",
  "DEF-neck": "neck_01", "DEF-head": "Head"
};
for (const [s, t] of [["L", "l"], ["R", "r"]]) {
  Object.assign(BONES, {
    [`DEF-shoulder.${s}`]: `clavicle_${t}`, [`DEF-upper_arm.${s}`]: `upperarm_${t}`, [`DEF-forearm.${s}`]: `lowerarm_${t}`, [`DEF-hand.${s}`]: `hand_${t}`,
    [`DEF-thigh.${s}`]: `thigh_${t}`, [`DEF-shin.${s}`]: `calf_${t}`, [`DEF-foot.${s}`]: `foot_${t}`, [`DEF-toe.${s}`]: `ball_${t}`
  });
  for (const f of ["index", "middle", "ring", "pinky"]) for (const k of [1, 2, 3]) BONES[`DEF-f_${f}.0${k}.${s}`] = `${f}_0${k}_${t}`;
  for (const k of [1, 2, 3]) BONES[`DEF-thumb.0${k}.${s}`] = `thumb_0${k}_${t}`;
}

const unzip = (zip, dest) => {
  mkdirSync(dest, { recursive: true });
  execFileSync("python", ["-I", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); [z.extract(n, sys.argv[2]) for n in z.namelist() if '..' not in n and not n.startswith('/')]", zip, dest]);
};
const kb = n => (n / 1024).toFixed(0) + " KB";
const findDir = (base, name) => {   // first folder called `name` under base
  for (const e of readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(base, e.name);
    if (e.name === name) return p;
    const r = findDir(p, name);
    if (r) return r;
  }
  return null;
};

if (!UBC || !existsSync(UBC)) {
  console.error("Pass --ubc <Universal Base Characters[Standard].zip or folder> (free download from quaternius.itch.io).");
  process.exit(1);
}
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const sizes = [];

// ---------- 0. sources
let ubcRoot = UBC;
if (statSync(UBC).isFile()) { unzip(UBC, join(TMP, "ubc")); ubcRoot = join(TMP, "ubc"); }
const bodyDir = findDir(ubcRoot, "Godot - UE");
const hairDir = findDir(ubcRoot, "glTF (Godot)");
if (!bodyDir || !hairDir) throw new Error("Couldn't find 'Base Characters/Godot - UE' and 'Hairstyles/Origin at 0/glTF (Godot)' in " + UBC);
// Work on a copy: the pack's .gltf files name a few textures that only exist without the "_png" suffix
const bodyWork = join(TMP, "bodies");
mkdirSync(bodyWork, { recursive: true });
for (const f of readdirSync(bodyDir)) copyFileSync(join(bodyDir, f), join(bodyWork, f));
const texDir = join(dirname(bodyDir), "Textures");
for (const f of ["T_Superhero_Male_Ligh.png", "T_Superhero_Female_Light_BaseColor.png"]) copyFileSync(join(texDir, f), join(bodyWork, f));
for (const g of readdirSync(bodyWork).filter(f => f.endsWith(".gltf"))) {
  for (const img of JSON.parse(readFileSync(join(bodyWork, g), "utf8")).images || []) {
    const alt = img.uri.replace(/_png\.png$/, ".png");
    if (!existsSync(join(bodyWork, img.uri)) && existsSync(join(bodyWork, alt))) copyFileSync(join(bodyWork, alt), join(bodyWork, img.uri));
  }
}

const ualZip = join(TMP, "ual.zip");
writeFileSync(ualZip, new Uint8Array(await (await fetch(UAL_URL)).arrayBuffer()));
unzip(ualZip, join(TMP, "ual"));
const lib = await io.read(join(TMP, "ual", "Animation Library[Standard]", "Godot", "AnimationLibrary_Godot_Standard.glb"));

// ---------- skeleton helpers (three.js maths in Node)
function skeletonInfo(doc) {
  const root = doc.getRoot();
  const parent = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parent.set(c, n);
  const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
  const restLocal = n => ({ t: new THREE.Vector3(...n.getTranslation()), q: new THREE.Quaternion(...n.getRotation()), s: new THREE.Vector3(...n.getScale()) });
  return { root, parent, byName, restLocal };
}
// world matrices for every node from a local-pose lookup (pose(n) → {t,q,s})
function worldPose(info, pose) {
  const out = new Map();
  const W = n => {
    if (out.has(n)) return out.get(n);
    const l = pose(n), m = new THREE.Matrix4().compose(l.t, l.q, l.s);
    const p = info.parent.get(n);
    const w = p ? W(p).clone().multiply(m) : m;
    out.set(n, w);
    return w;
  };
  for (const n of info.root.listNodes()) W(n);
  return out;
}
const quatOf = m => { const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
const posOf = m => new THREE.Vector3().setFromMatrixPosition(m);

// sample a glTF animation channel at time t
function sampler(ch) {
  const s = ch.getSampler(), times = s.getInput().getArray(), vals = s.getOutput().getArray();
  const interp = s.getInterpolation(), size = ch.getTargetPath() === "rotation" ? 4 : 3;
  const cubic = interp === "CUBICSPLINE";
  const at = i => { const o = (cubic ? i * 3 + 1 : i) * size; return Array.from(vals.slice(o, o + size)); };
  return t => {
    if (t <= times[0]) return at(0);
    if (t >= times[times.length - 1]) return at(times.length - 1);
    let i = 0; while (times[i + 1] < t) i++;
    if (interp === "STEP") return at(i);
    const k = (t - times[i]) / (times[i + 1] - times[i]), a = at(i), b = at(i + 1);
    if (size === 4) return new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), k).toArray();
    return a.map((v, j) => v + (b[j] - v) * k);
  };
}

const src = skeletonInfo(lib);
const srcRest = worldPose(src, n => src.restLocal(n));

// ---------- 1. bodies with retargeted animations
const bodies = [["male", "Superhero_Male_FullBody.gltf", "T_Superhero_Male_Ligh.png"], ["female", "Superhero_Female_FullBody.gltf", "T_Superhero_Female_Light_BaseColor.png"]];
for (const [kind, file, lightTex] of bodies) {
  const doc = await io.read(join(bodyWork, file));
  const tgt = skeletonInfo(doc);
  const root = tgt.root;
  const tgtRest = worldPose(tgt, n => tgt.restLocal(n));
  const joints = root.listSkins()[0].listJoints();
  const jointSet = new Set(joints);
  // parents before children
  const order = [];
  const visit = n => { if (order.includes(n)) return; const p = tgt.parent.get(n); if (p && jointSet.has(p)) visit(p); order.push(n); };
  joints.forEach(visit);
  const srcOf = new Map();   // target joint → source node
  for (const [s, t] of Object.entries(BONES)) { const sn = src.byName.get(s), tn = tgt.byName.get(t); if (sn && tn) srcOf.set(tn, sn); }
  const hipsS = src.byName.get("DEF-hips"), pelvisT = tgt.byName.get("pelvis");
  const heightK = posOf(tgtRest.get(pelvisT)).y / posOf(srcRest.get(hipsS)).y;

  const buffer = root.listBuffers()[0];
  for (const name of CLIPS) {
    const anim = lib.getRoot().listAnimations().find(a => a.getName() === name);
    if (!anim) throw new Error("missing animation " + name);
    const tracks = new Map();   // source node → { rotation, translation, scale } samplers
    let duration = 0;
    for (const ch of anim.listChannels()) {
      const n = ch.getTargetNode(), path = ch.getTargetPath();
      if (!n || path === "weights") continue;
      (tracks.get(n) || tracks.set(n, {}).get(n))[path] = sampler(ch);
      const inp = ch.getSampler().getInput().getArray();
      duration = Math.max(duration, inp[inp.length - 1]);
    }
    const frames = Math.max(2, Math.round(duration * FPS) + 1);
    const times = new Float32Array(frames);
    const rot = new Map(order.map(j => [j, new Float32Array(frames * 4)]));
    const pelvisPos = new Float32Array(frames * 3);
    for (let f = 0; f < frames; f++) {
      const t = Math.min(duration, f / FPS);
      times[f] = t;
      const sWorld = worldPose(src, n => {
        const r = src.restLocal(n), tr = tracks.get(n);
        if (tr) { if (tr.rotation) r.q.fromArray(tr.rotation(t)); if (tr.translation) r.t.fromArray(tr.translation(t)); }
        return r;
      });
      const tWorldQ = new Map();
      const parentWorldQ = j => { const p = tgt.parent.get(j); return p && tWorldQ.has(p) ? tWorldQ.get(p) : quatOf(tgtRest.get(p) || new THREE.Matrix4()); };
      for (const j of order) {
        const s = srcOf.get(j);
        let wq;
        if (s) {
          // same world-space rotation away from the rest pose as the library bone
          wq = quatOf(sWorld.get(s)).multiply(quatOf(srcRest.get(s)).invert()).multiply(quatOf(tgtRest.get(j)));
        } else {
          wq = parentWorldQ(j).clone().multiply(tgt.restLocal(j).q);
        }
        tWorldQ.set(j, wq);
        const local = parentWorldQ(j).clone().invert().multiply(wq).normalize();
        const arr = rot.get(j);
        if (f > 0) {   // keep quaternions on one hemisphere so interpolation takes the short way
          const pq = new THREE.Quaternion(arr[(f - 1) * 4], arr[(f - 1) * 4 + 1], arr[(f - 1) * 4 + 2], arr[(f - 1) * 4 + 3]);
          if (pq.dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        }
        local.toArray(arr, f * 4);
      }
      // hips height/sway, scaled to the body, expressed in the pelvis' parent space
      const delta = posOf(sWorld.get(hipsS)).sub(posOf(srcRest.get(hipsS))).multiplyScalar(heightK);
      const wp = posOf(tgtRest.get(pelvisT)).add(delta);
      const parentM = tgtRest.get(tgt.parent.get(pelvisT)).clone();
      // the pelvis' parent (root) is posed by the retarget too: use its posed world rotation
      const rootQ = tWorldQ.get(tgt.parent.get(pelvisT));
      if (rootQ) parentM.compose(posOf(parentM), rootQ, new THREE.Vector3(1, 1, 1));
      wp.applyMatrix4(parentM.invert()).toArray(pelvisPos, f * 3);
    }
    const anim2 = doc.createAnimation(name);
    const input = doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer);
    for (const j of order) {
      const out = doc.createAccessor().setType("VEC4").setArray(rot.get(j)).setBuffer(buffer);
      const smp = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation("LINEAR");
      anim2.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(j).setTargetPath("rotation").setSampler(smp));
    }
    const outT = doc.createAccessor().setType("VEC3").setArray(pelvisPos).setBuffer(buffer);
    const smpT = doc.createAnimationSampler().setInput(input).setOutput(outT).setInterpolation("LINEAR");
    anim2.addSampler(smpT).addChannel(doc.createAnimationChannel().setTargetNode(pelvisT).setTargetPath("translation").setSampler(smpT));
  }

  // Real (pre-quantisation) bind-pose landmarks, for the clothes/skin shader in character.js
  const bone = n => posOf(tgtRest.get(tgt.byName.get(n)));
  const bodyMesh = root.listMeshes().find(m => m.listPrimitives().some(p => p.getMaterial()?.getName().startsWith("MI_Superhero")));
  const eyesMesh = root.listMeshes().find(m => m.listPrimitives().some(p => p.getMaterial()?.getName() === "MI_Eyes"));
  const bounds = mesh => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of mesh.listPrimitives()) { const a = p.getAttribute("POSITION"); const v = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); } } }
    return { min, max };
  };
  smoothTorso(bodyMesh, {
    waist: bone("pelvis").y, neck: bone("neck_01").y, shoulderX: bone("upperarm_l").x
  });
  const bb = bounds(bodyMesh), eb = bounds(eyesMesh);
  const r3 = v => +v.toFixed(4);
  bodyMesh.setExtras({
    bindMin: bb.min.map(r3), bindMax: bb.max.map(r3),
    land: {
      top: r3(bb.max[1]), head: r3(bone("Head").y), neck: r3(bone("neck_01").y), chest: r3(bone("spine_03").y), waist: r3(bone("pelvis").y + 0.05),
      hip: r3(bone("thigh_l").y), knee: r3(bone("calf_l").y), ankle: r3(bone("foot_l").y),
      shoulderX: r3(bone("upperarm_l").x), elbowX: r3(bone("lowerarm_l").x), wristX: r3(bone("hand_l").x), armY: r3(bone("upperarm_l").y),
      eyeY: r3((eb.min[1] + eb.max[1]) / 2), eyeX: r3(eb.max[0] - (eb.max[1] - eb.min[1]) / 2), eyeZ: r3(eb.max[2]), eyeR: r3((eb.max[1] - eb.min[1]) / 2)
    }
  });
  eyesMesh.setExtras({ bindMin: eb.min.map(r3), bindMax: eb.max.map(r3) });

  // Textures: light skin base (recoloured for every skin tone at runtime), small normal map, no roughness map
  const bodyMat = bodyMesh.listPrimitives()[0].getMaterial();
  let base = sharp(join(bodyWork, lightTex));
  if (kind === "male") base = await cleanStubble(join(bodyWork, lightTex));
  bodyMat.getBaseColorTexture().setImage(new Uint8Array(await base.resize(1024).jpeg({ quality: 82 }).toBuffer())).setMimeType("image/jpeg").setURI("");
  const nt = bodyMat.getNormalTexture();
  if (nt) nt.setImage(new Uint8Array(await sharp(nt.getImage()).resize(512).jpeg({ quality: 88 }).toBuffer())).setMimeType("image/jpeg").setURI("");
  bodyMat.setMetallicRoughnessTexture(null).setRoughnessFactor(0.62).setMetallicFactor(0);
  for (const m of root.listMaterials()) {
    if (m === bodyMat) continue;
    m.setNormalTexture(null);       // eyes + eyebrows: normal maps don't show at this size
    const t = m.getBaseColorTexture();
    if (t) t.setImage(new Uint8Array(await sharp(t.getImage()).resize(m.getName() === "MI_Eyes" ? 128 : 256).png().toBuffer())).setMimeType("image/png").setURI("");
  }
  await doc.transform(prune(), dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.002 }), resample({ tolerance: 0.0008 }), prune());
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const glb = await io.writeBinary(doc);
  const outName = `body-${kind}.glb`;
  writeFileSync(join(OUT, outName), glb);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  sizes.push([outName, glb.length, `${Math.round(tris)} tris, ${root.listAnimations().length} animations`]);
}

// The bodies are sculpted athletes (six-pack, pecs). Under a school uniform that reads wrong, so the torso is
// smoothed with Taubin smoothing (alternating shrink/inflate steps, so the overall shape keeps its volume).
// Vertices are grouped by position so UV seams move together and no cracks open.
function smoothTorso(mesh, L) {
  for (const prim of mesh.listPrimitives()) {
    const posA = prim.getAttribute("POSITION"), norA = prim.getAttribute("NORMAL"), idxA = prim.getIndices();
    const n = posA.getCount(), P = posA.getArray(), idx = idxA.getArray();
    const key = new Map(), group = new Int32Array(n), gp = [];
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
      let g = key.get(k);
      if (g === undefined) { g = gp.length; key.set(k, g); gp.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); }
      group[i] = g;
    }
    const G = gp.length, nb = Array.from({ length: G }, () => new Set());
    for (let t = 0; t < idx.length; t += 3) {
      const a = group[idx[t]], b = group[idx[t + 1]], c = group[idx[t + 2]];
      nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
    }
    // weight: 1 on the shirt area of the torso, fading out toward the neck, hips and arms
    const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const w = gp.map(([x, y]) => ss(L.waist - 0.08, L.waist + 0.04, y) * (1 - ss(L.neck - 0.1, L.neck - 0.03, y)) * (1 - ss(L.shoulderX - 0.02, L.shoulderX + 0.05, Math.abs(x))));
    let cur = gp.map(p => p.slice());
    for (let it = 0; it < 24; it++) {
      const f = it % 2 ? -0.53 : 0.5;
      cur = cur.map((p, g) => {
        if (w[g] <= 0 || nb[g].size === 0) return p;
        const m = [0, 0, 0];
        for (const o of nb[g]) { m[0] += cur[o][0]; m[1] += cur[o][1]; m[2] += cur[o][2]; }
        const k = f * w[g], s = nb[g].size;
        return [p[0] + (m[0] / s - p[0]) * k, p[1] + (m[1] / s - p[1]) * k, p[2] + (m[2] / s - p[2]) * k];
      });
    }
    // write back and recompute normals of the moved area from the faces
    const newP = new Float32Array(P);
    for (let i = 0; i < n; i++) { const p = cur[group[i]]; newP.set(p, i * 3); }
    posA.setArray(newP);
    const gn = Array.from({ length: G }, () => [0, 0, 0]);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [group[idx[t]], group[idx[t + 1]], group[idx[t + 2]]];
      const A = cur[a], Bp = cur[b], C = cur[c];
      const u = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      for (const g of [a, b, c]) { gn[g][0] += nn[0]; gn[g][1] += nn[1]; gn[g][2] += nn[2]; }
    }
    if (norA) {
      const N = new Float32Array(norA.getArray());
      for (let i = 0; i < n; i++) {
        const g = group[i]; if (w[g] <= 0) continue;
        const v = gn[g], l = Math.hypot(...v) || 1;
        for (let k = 0; k < 3; k++) N[i * 3 + k] = N[i * 3 + k] + (v[k] / l - N[i * 3 + k]) * Math.min(1, w[g] * 1.5);
        const l2 = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
        for (let k = 0; k < 3; k++) N[i * 3 + k] /= l2;
      }
      norA.setArray(N);
    }
  }
}

// The male texture has stubble around the mouth and jaw: recolour it to the surrounding skin.
async function cleanStubble(file) {
  const img = sharp(file);
  const { width: W, height: H } = await img.metadata();
  const px = await img.removeAlpha().raw().toBuffer();
  const s = W / 2048;
  // reference skin: the cheek just below the eyes
  let ref = [0, 0, 0], n = 0;
  for (let y = 400 * s; y < 460 * s; y++) for (let x = 110 * s; x < 190 * s; x++) { const i = (Math.round(y) * W + Math.round(x)) * 3; ref[0] += px[i]; ref[1] += px[i + 1]; ref[2] += px[i + 2]; n++; }
  ref = ref.map(v => v / n);
  const lum = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const refRB = ref[0] - ref[2], refL = lum(ref);
  const cx = 378 * s, cy = 575 * s, rx = 250 * s, ry = 190 * s;
  for (let y = Math.floor(cy - ry); y < Math.min(H, cy + ry); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, cx + rx); x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d >= 1) continue;
      const mask = Math.min(1, (1 - d) * 3);
      const i = (y * W + x) * 3, c = [px[i], px[i + 1], px[i + 2]];
      const stub = Math.max(0, Math.min(1, ((refRB - (c[0] - c[2])) / refRB) * 2.2));
      const k = mask * stub;
      if (k <= 0) continue;
      const l = lum(c) + (refL - lum(c)) * 0.75;
      for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round(c[ch] + (ref[ch] * (l / refL) - c[ch]) * k);
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } });
}

// ---------- 2. hairstyles (static, positioned in model space; attached to the head bone at runtime)
for (const name of HAIR) {
  const d = await io.read(join(hairDir, name + ".gltf"));
  await d.transform(dedup(), weld(), prune(), textureCompress({ encoder: sharp, targetFormat: "png", resize: [256, 256] }));
  // Normal maps are heavy and barely visible on hair at this size: drop them
  for (const m of d.getRoot().listMaterials()) { if (m.getNormalTexture()) m.setNormalTexture(null); }
  await d.transform(prune());
  const glb = await io.writeBinary(d);
  const out = name.replace("Hair_", "hair-").toLowerCase() + ".glb";
  writeFileSync(join(OUT, out), glb);
  sizes.push([out, glb.length, ""]);
}
// assets from the previous (mannequin) build
for (const old of ["character.glb", "brows-regular.glb", "brows-female.glb"]) rmSync(join(OUT, old), { force: true });
rmSync(TMP, { recursive: true, force: true });

writeFileSync(join(OUT, "CREDITS.md"), `# Character credits

All character assets are by **Quaternius** and released under **CC0** (public domain).

| Used as | Pack | Link |
| :--- | :--- | :--- |
| Male + female bodies, eyes, eyebrows, ${HAIR.length} hairstyles | Universal Base Characters [Standard] | https://quaternius.itch.io/universal-base-characters |
| ${CLIPS.length} animations (retargeted onto the bodies) | Universal Animation Library [Standard] | https://quaternius.com/packs/universalanimationlibrary.html (download: ${UAL_URL}) |

Built by \`tools/world/fetch-characters.mjs\`: animations retargeted bone by bone, mesh lightly simplified,
skin texture 1024 px (stubble removed), normal map 512 px, hair textures 256 px.
Clothes and skin tone are painted at runtime by \`character.js\`.
`);
console.log(sizes.map(s => `${s[0].padEnd(24)} ${kb(s[1]).padStart(8)}  ${s[2]}`).join("\n"));
console.log("TOTAL", kb(sizes.reduce((a, s) => a + s[1], 0)));
