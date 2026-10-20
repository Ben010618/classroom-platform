// Builds the HD character assets from Quaternius CC0 packs:
//   - Universal Base Characters [Standard] (itch.io, free/"name your price" — download it in a browser,
//     then pass the zip or its extracted folder): realistic male + female bodies, hairstyles, eyebrows, eyes
//   - Universal Animation Library [Standard] (direct download, OpenGameArt): the animations, which are
//     RETARGETED here from the library's rig (DEF-* bones) onto the bodies' rig (pelvis, spine_01, …)
//   - Ultimate Modular Men / Women Packs (FBX, converted with the bundled FBX2glTF): 16 school-appropriate characters
//     ("modular" rig) that get the same retargeted animations; colours baked into one material per character
//   node fetch-characters.mjs --ubc "<Universal Base Characters[Standard].zip>" --men "<Ultimate Modular Men Pack>" --women "<… Women Pack>"
//   (each pack is optional; only the ones given are rebuilt)
// Writes assets/characters/{body-male.glb, body-female.glb, hair-*.glb, mod-*.glb} and the credits.
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
import convertFbx from "fbx2gltf";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "assets", "characters");
const TMP = join(here, "work-characters"); // untrusted downloads + extraction, deleted at the end
const UAL_URL = "https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip";
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const UBC = arg("--ubc"), MEN = arg("--men"), WOMEN = arg("--women");
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

for (const p of [UBC, MEN, WOMEN]) if (p && !existsSync(p)) { console.error("Not found: " + p); process.exit(1); }
if (!UBC && !MEN && !WOMEN) {
  console.error('Pass --ubc "<Universal Base Characters[Standard].zip or folder>" and/or --men / --women "<Ultimate Modular … Pack folder>" (free downloads from quaternius.com).');
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
const bodyWork = join(TMP, "bodies");
let hairDir = null;
if (UBC) {
  let ubcRoot = UBC;
  if (statSync(UBC).isFile()) { unzip(UBC, join(TMP, "ubc")); ubcRoot = join(TMP, "ubc"); }
  const bodyDir = findDir(ubcRoot, "Godot - UE");
  hairDir = findDir(ubcRoot, "glTF (Godot)");
  if (!bodyDir || !hairDir) throw new Error("Couldn't find 'Base Characters/Godot - UE' and 'Hairstyles/Origin at 0/glTF (Godot)' in " + UBC);
  // Work on a copy: the pack's .gltf files name a few textures that only exist without the "_png" suffix
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

// ---------- retargeting: library clips → a target rig, written into the target document
// cfg.map: library bone → target bone; cfg.pelvis: target bone that gets the hips' translation;
// cfg.ikFeet: [{ foot, leg, src }] for rigs whose feet hang off the root (IK rigs): the foot follows the ankle
// at the end of `leg` and turns like the library's `src` foot bone.
function retargetClips(doc, cfg) {
  const tgt = skeletonInfo(doc);
  const root = tgt.root;
  const tgtRest = worldPose(tgt, n => tgt.restLocal(n));
  const joints = root.listSkins()[0].listJoints();
  const jointSet = new Set(joints);
  const order = [];   // parents before children
  const visit = n => { if (order.includes(n)) return; const p = tgt.parent.get(n); if (p && jointSet.has(p)) visit(p); order.push(n); };
  joints.forEach(visit);
  const ik = new Map((cfg.ikFeet || []).map(f => [tgt.byName.get(f.foot), { leg: tgt.byName.get(f.leg), src: src.byName.get(f.src) }]));
  const srcOf = new Map();   // target joint → source node
  for (const [s, t] of Object.entries(cfg.map)) { const sn = src.byName.get(s), tn = tgt.byName.get(t); if (sn && tn) srcOf.set(tn, sn); }
  const hipsS = src.byName.get("DEF-hips"), pelvisT = tgt.byName.get(cfg.pelvis);
  const heightK = posOf(tgtRest.get(pelvisT)).y / posOf(srcRest.get(hipsS)).y;
  // ankle of each IK foot in the bind pose: on the lower-leg line, at the library's ankle height scaled to this body
  for (const [foot, f] of ik) {
    const legM = tgtRest.get(f.leg), legP = posOf(legM), dir = new THREE.Vector3(0, 1, 0).applyQuaternion(quatOf(legM)).normalize();
    const ankleY = posOf(srcRest.get(f.src)).y * heightK;
    f.ankle = legP.clone().addScaledVector(dir, (legP.y - ankleY) / Math.max(0.2, -dir.y));
    f.ankleInLeg = f.ankle.clone().applyMatrix4(legM.clone().invert());
    f.footFromAnkle = posOf(tgtRest.get(foot)).sub(f.ankle);
  }
  const moved = new Set([pelvisT, ...ik.keys()]);   // joints that also get a translation track

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
    const pos = new Map([...moved].map(j => [j, new Float32Array(frames * 3)]));
    for (let f = 0; f < frames; f++) {
      const t = Math.min(duration, f / FPS);
      times[f] = t;
      const sWorld = worldPose(src, n => {
        const r = src.restLocal(n), tr = tracks.get(n);
        if (tr) { if (tr.rotation) r.q.fromArray(tr.rotation(t)); if (tr.translation) r.t.fromArray(tr.translation(t)); }
        return r;
      });
      const delta = s => quatOf(sWorld.get(s)).multiply(quatOf(srcRest.get(s)).invert());   // world rotation away from rest
      const tWorld = new Map();
      const parentW = j => { const p = tgt.parent.get(j); return (p && tWorld.get(p)) || (p && tgtRest.get(p)) || new THREE.Matrix4(); };
      const solve = j => {
        const s = srcOf.get(j), rest = tgt.restLocal(j), pW = parentW(j), pQ = quatOf(pW);
        // same world-space rotation away from the rest pose as the library bone
        const wq = s ? delta(s).multiply(quatOf(tgtRest.get(j))) : pQ.clone().multiply(rest.q);
        const local = pQ.clone().invert().multiply(wq).normalize();
        let lt = rest.t;
        if (j === pelvisT) {
          // hips height/sway, scaled to the body, in the parent's (posed) space
          const wp = posOf(tgtRest.get(j)).add(posOf(sWorld.get(hipsS)).sub(posOf(srcRest.get(hipsS))).multiplyScalar(heightK));
          lt = wp.applyMatrix4(pW.clone().invert());
        } else if (ik.has(j)) {
          const fk = ik.get(j), ankle = fk.ankleInLeg.clone().applyMatrix4(tWorld.get(fk.leg));
          const wp = ankle.add(fk.footFromAnkle.clone().applyQuaternion(delta(fk.src)));
          lt = wp.applyMatrix4(pW.clone().invert());
        }
        const arr = rot.get(j);
        if (f > 0) {   // keep quaternions on one hemisphere so interpolation takes the short way
          const pq = new THREE.Quaternion(arr[(f - 1) * 4], arr[(f - 1) * 4 + 1], arr[(f - 1) * 4 + 2], arr[(f - 1) * 4 + 3]);
          if (pq.dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        }
        local.toArray(arr, f * 4);
        if (moved.has(j)) lt.toArray(pos.get(j), f * 3);
        tWorld.set(j, pW.clone().multiply(new THREE.Matrix4().compose(lt, local, rest.s)));
      };
      order.filter(j => !ik.has(j)).forEach(solve);
      [...ik.keys()].forEach(solve);   // after the legs they follow
    }
    const anim2 = doc.createAnimation(name);
    const input = doc.createAccessor().setType("SCALAR").setArray(times).setBuffer(buffer);
    const channel = (j, path, type, arr) => {
      const out = doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
      const smp = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation("LINEAR");
      anim2.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(j).setTargetPath(path).setSampler(smp));
    };
    for (const j of order) channel(j, "rotation", "VEC4", rot.get(j));
    for (const j of moved) channel(j, "translation", "VEC3", pos.get(j));
  }
  return { tgt, tgtRest };
}

// ---------- 1. bodies with retargeted animations
const bodies = [["male", "Superhero_Male_FullBody.gltf", "T_Superhero_Male_Ligh.png"], ["female", "Superhero_Female_FullBody.gltf", "T_Superhero_Female_Light_BaseColor.png"]];
for (const [kind, file, lightTex] of UBC ? bodies : []) {
  const doc = await io.read(join(bodyWork, file));
  const { tgt, tgtRest } = retargetClips(doc, { map: BONES, pelvis: "pelvis" });
  const root = tgt.root;

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
for (const name of UBC ? HAIR : []) {
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
// ---------- 3. modular characters (Ultimate Modular Men / Women): same animations, one draw call each
// Library bone → modular rig bone. The modular feet hang off Root (an IK rig), so they follow the ankles.
const MOD_BONES = { root: "Root", "DEF-hips": "Body", "DEF-spine.001": "Abdomen", "DEF-spine.002": "Torso", "DEF-spine.003": "Chest", "DEF-neck": "Neck", "DEF-head": "Head" };
for (const s of ["L", "R"]) {
  Object.assign(MOD_BONES, { [`DEF-shoulder.${s}`]: `Shoulder.${s}`, [`DEF-upper_arm.${s}`]: `UpperArm.${s}`, [`DEF-forearm.${s}`]: `LowerArm.${s}`, [`DEF-hand.${s}`]: `Wrist.${s}`,
    [`DEF-thigh.${s}`]: `UpperLeg.${s}`, [`DEF-shin.${s}`]: `LowerLeg.${s}`, [`DEF-foot.${s}`]: `Foot.${s}` });
  for (const [f, g] of [["index", "Index"], ["middle", "Middle"], ["ring", "Ring"], ["pinky", "Pinky"]]) for (const k of [1, 2, 3]) MOD_BONES[`DEF-f_${f}.0${k}.${s}`] = `${g}${k}.${s}`;
  for (const k of [1, 2, 3]) MOD_BONES[`DEF-thumb.0${k}.${s}`] = `Thumb${k}.${s}`;
}
// file in the pack → id, label (labels are shown in the character picker)
// School-appropriate only. Deliberately left out: Swat, Soldier (military gear), SciFi (holds a gun-like device),
// Punk (both: ripped clothes, crop top). Don't add them back.
const MODULAR = {
  men: [["Casual_2", "m-casual", "Casual"], ["Casual_Hoodie", "m-hoodie", "Hoodie"], ["Suit", "m-suit", "Business suit"], ["Farmer", "m-farmer", "Farmer"],
    ["Worker", "m-worker", "Worker"], ["Beach", "m-beach", "Beach"], ["Adventurer", "m-adventurer", "Adventurer"],
    ["Spacesuit", "m-astronaut", "Astronaut"], ["King", "m-king", "King"]],
  women: [["Casual", "w-casual", "Casual"], ["Formal", "w-formal", "Formal"], ["Suit", "w-suit", "Business suit"], ["Worker", "w-worker", "Worker"],
    ["Adventurer", "w-adventurer", "Adventurer"], ["Medieval", "w-medieval", "Medieval"], ["Witch", "w-witch", "Witch"]]
};
const EXCLUDED = ["m-swat", "w-soldier", "w-scifi", "m-punk", "w-punk"];   // deleted from assets on every build
const findFile = (base, file) => {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, e.name);
    if (e.isFile() && e.name.toLowerCase() === file.toLowerCase()) return p;
    if (e.isDirectory()) { const r = findFile(p, file); if (r) return r; }
  }
  return null;
};
// The FBX export stores the first animation frame as the node pose; put every joint back in its bind pose
// (the T-pose the mesh was skinned in), recovered from the inverse bind matrices.
function resetToBind(doc) {
  const info = skeletonInfo(doc);
  const meshNode = info.root.listNodes().find(n => n.getSkin());
  const skin = meshNode.getSkin(), joints = skin.listJoints(), ibm = skin.getInverseBindMatrices().getArray();
  const cur = worldPose(info, n => info.restLocal(n));
  const meshW = cur.get(meshNode);
  const bind = new Map(joints.map((j, i) => [j, meshW.clone().multiply(new THREE.Matrix4().fromArray(ibm, i * 16).invert())]));
  const set = new Set(joints), order = [];
  const visit = n => { if (order.includes(n)) return; const p = info.parent.get(n); if (p && set.has(p)) visit(p); order.push(n); };
  joints.forEach(visit);
  for (const j of order) {
    const p = info.parent.get(j), pW = bind.get(p) || cur.get(p) || new THREE.Matrix4();
    const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    pW.clone().invert().multiply(bind.get(j)).decompose(t, q, s);
    j.setTranslation(t.toArray()).setRotation(q.toArray()).setScale(s.toArray());
  }
  return meshW;
}
// The pack splits each character into legs, feet, body and head, each a skinned mesh with its own skin over
// the same joints. Merge every primitive into one (one draw call): vertices are moved into the first part's
// space via the bind matrices, and joint indices are remapped onto the first skin's joint list.
function mergeSkinned(doc) {
  const root = doc.getRoot();
  // rigid props from the packs (swords, guns, staffs…) aren't skinned and don't belong in a school: drop them
  for (const n of root.listNodes()) if (n.getMesh() && !n.getSkin()) { const m = n.getMesh(); n.setMesh(null); m.dispose(); }
  const nodes = root.listNodes().filter(n => n.getMesh() && n.getSkin());
  const first = nodes[0], skin0 = first.getSkin(), joints0 = skin0.listJoints();
  const ibm0 = skin0.getInverseBindMatrices().getArray();
  const ibmOf = (skin, j) => new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getArray(), skin.listJoints().indexOf(j) * 16);
  const parts = [];
  for (const n of nodes) {
    const skin = n.getSkin(), js = skin.listJoints();
    const remap = js.map(j => { const i = joints0.indexOf(j); if (i < 0) throw new Error("joint not in first skin: " + j.getName()); return i; });
    // a vertex in this part's space → the first part's space. At rest, joint·IBMpart·v = joint·IBM0·v′,
    // so v′ = IBM0⁻¹·IBMpart·v (using any joint both skins share)
    const toFirst = new THREE.Matrix4().fromArray(ibm0, joints0.indexOf(js[0]) * 16).invert().multiply(ibmOf(skin, js[0]));
    for (const p of n.getMesh().listPrimitives()) parts.push({ p, remap, toFirst });
  }
  const sem = ["POSITION", "NORMAL", "COLOR_0", "JOINTS_0", "WEIGHTS_0"];
  const count = parts.reduce((a, q) => a + q.p.getAttribute("POSITION").getCount(), 0);
  const idxCount = parts.reduce((a, q) => a + q.p.getIndices().getCount(), 0);
  const out = { POSITION: new Float32Array(count * 3), NORMAL: new Float32Array(count * 3), COLOR_0: new Float32Array(count * 3), JOINTS_0: new Uint16Array(count * 4), WEIGHTS_0: new Float32Array(count * 4) };
  const index = new Uint32Array(idxCount);
  const nm = new THREE.Matrix3(), v = new THREE.Vector3(), el = [];
  let vo = 0, io = 0;
  for (const { p, remap, toFirst } of parts) {
    const n = p.getAttribute("POSITION").getCount();
    nm.getNormalMatrix(toFirst);
    for (let i = 0; i < n; i++) {
      v.fromArray(p.getAttribute("POSITION").getElement(i, el)).applyMatrix4(toFirst).toArray(out.POSITION, (vo + i) * 3);
      v.fromArray(p.getAttribute("NORMAL").getElement(i, el)).applyMatrix3(nm).normalize().toArray(out.NORMAL, (vo + i) * 3);
      out.COLOR_0.set(p.getAttribute("COLOR_0").getElement(i, el).slice(0, 3), (vo + i) * 3);
      const jn = p.getAttribute("JOINTS_0").getElement(i, el).slice();
      const w = p.getAttribute("WEIGHTS_0").getElement(i, el).slice();
      for (let k = 0; k < 4; k++) { out.JOINTS_0[(vo + i) * 4 + k] = w[k] > 0 ? remap[jn[k]] : 0; out.WEIGHTS_0[(vo + i) * 4 + k] = w[k]; }
    }
    const I = p.getIndices().getArray();
    for (let i = 0; i < I.length; i++) index[io + i] = I[i] + vo;
    vo += n; io += I.length;
  }
  const buf = root.listBuffers()[0];
  const prim = doc.createPrimitive().setMaterial(parts[0].p.getMaterial()).setIndices(doc.createAccessor().setType("SCALAR").setArray(index).setBuffer(buf));
  const types = { POSITION: "VEC3", NORMAL: "VEC3", COLOR_0: "VEC3", JOINTS_0: "VEC4", WEIGHTS_0: "VEC4" };
  for (const s of sem) prim.setAttribute(s, doc.createAccessor().setType(types[s]).setArray(out[s]).setBuffer(buf));
  const mesh = doc.createMesh("Character").addPrimitive(prim);
  for (const n of nodes) { const m = n.getMesh(); n.setMesh(null); if (n !== first) n.dispose(); m.dispose(); }
  first.setMesh(mesh);
  // glTF ignores a skinned mesh's own node transform, but three.js r128 applies it before skinning (here the FBX
  // ×100 unit scale → a 180 m giant). Move the mesh node to the scene root with no transform: same result per spec.
  const scene = root.listScenes()[0];
  const p = first.getParentNode();
  if (p) p.removeChild(first);
  scene.addChild(first);
  first.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
}

// Marker colours for parts the player recolours (character.js swaps them for the chosen skin tone / hair colour)
const SKIN_MARK = [1, 0, 1], SKIN_DARK_MARK = [0.5, 0, 0.5], HAIR_MARK = [0, 1, 1];
const markOf = name => /^Skin/i.test(name) ? (/Dark/i.test(name) ? SKIN_DARK_MARK : SKIN_MARK) : /^(Hair|Eyebrow)/i.test(name) ? HAIR_MARK : null;
const modList = [];
for (const [sex, folder] of [["men", MEN], ["women", WOMEN]]) {
  if (!folder) continue;
  for (const [file, id, label] of MODULAR[sex]) {
    const fbx = findFile(folder, file + ".fbx");
    if (!fbx) { console.warn("missing " + file + ".fbx in " + folder); continue; }
    const glbIn = join(TMP, id + ".glb");
    await convertFbx(fbx, glbIn, []);
    const doc = await io.read(glbIn);
    const root = doc.getRoot();
    root.listAnimations().forEach(a => a.dispose());   // their own clips: replaced by the shared library
    const meshW = resetToBind(doc);
    // one material: colours baked into vertices (markers for skin and hair), no textures
    const mat = doc.createMaterial("Character").setRoughnessFactor(0.8).setMetallicFactor(0);
    let top = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
      const name = p.getMaterial() ? p.getMaterial().getName() : "";
      const c = markOf(name) || (p.getMaterial() ? p.getMaterial().getBaseColorFactor().slice(0, 3) : [1, 1, 1]);
      const n = p.getAttribute("POSITION").getCount(), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set(c, i * 3);
      p.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(col).setBuffer(root.listBuffers()[0]));
      for (const s of p.listSemantics()) if (s.startsWith("TEXCOORD")) p.setAttribute(s, null);
      p.setMaterial(mat);
      const a = p.getAttribute("POSITION"), v = [];
      for (let i = 0; i < n; i++) { a.getElement(i, v); top = Math.max(top, new THREE.Vector3(...v).applyMatrix4(meshW).y); }
    }
    const { tgt, tgtRest } = retargetClips(doc, { map: MOD_BONES, pelvis: "Body",
      ikFeet: [{ foot: "Foot.L", leg: "LowerLeg.L", src: "DEF-foot.L" }, { foot: "Foot.R", leg: "LowerLeg.R", src: "DEF-foot.R" }] });
    const headY = posOf(tgtRest.get(tgt.byName.get("Head"))).y;
    mergeSkinned(doc);
    await doc.transform(prune(), dedup(), weld(), resample({ tolerance: 0.0008 }), prune());
    for (const m of root.listMeshes()) m.setExtras({ rig: "mod", land: { top: +top.toFixed(3), head: +headY.toFixed(3) } });
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));
    const glb = await io.writeBinary(doc);
    writeFileSync(join(OUT, `mod-${id}.glb`), glb);
    let tris = 0, prims = 0;
    for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { prims++; tris += p.getIndices().getCount() / 3; }
    sizes.push([`mod-${id}.glb`, glb.length, `${Math.round(tris)} tris, ${prims} draw call(s), top ${top.toFixed(2)} m`]);
    modList.push({ id, label, sex });
  }
}
// the list the character picker reads (merged with what's already built, so packs can be rebuilt separately)
const listFile = join(OUT, "modular.json");
if (modList.length || existsSync(listFile)) {
  const prev = existsSync(listFile) ? JSON.parse(readFileSync(listFile, "utf8")) : [];
  const merged = [...prev.filter(p => !modList.some(m => m.sex === p.sex)), ...modList].filter(m => !EXCLUDED.includes(m.id));
  writeFileSync(listFile, JSON.stringify(merged, null, 1));
}
for (const id of EXCLUDED) rmSync(join(OUT, `mod-${id}.glb`), { force: true });

// assets from the previous (mannequin) build
for (const old of ["character.glb", "brows-regular.glb", "brows-female.glb"]) rmSync(join(OUT, old), { force: true });
rmSync(TMP, { recursive: true, force: true });

writeFileSync(join(OUT, "CREDITS.md"), `# Character credits

All character assets are by **Quaternius** and released under **CC0** (public domain).

| Used as | Pack | Link |
| :--- | :--- | :--- |
| Male + female bodies, eyes, eyebrows, ${HAIR.length} hairstyles | Universal Base Characters [Standard] | https://quaternius.itch.io/universal-base-characters |
| ${CLIPS.length} animations (retargeted onto every character) | Universal Animation Library [Standard] | https://quaternius.com/packs/universalanimationlibrary.html (download: ${UAL_URL}) |
| 16 ready-made characters (\`mod-*.glb\`; military, weapon and punk outfits left out) | Ultimate Modular Men Pack, Ultimate Modular Women Pack | https://quaternius.com |

Built by \`tools/world/fetch-characters.mjs\`: animations retargeted bone by bone, mesh lightly simplified,
skin texture 1024 px (stubble removed), normal map 512 px, hair textures 256 px.
Clothes and skin tone are painted at runtime by \`character.js\`. The modular characters keep their own outfits;
their colours are baked into the vertices, with marker colours for skin and hair so the player can recolour them.
`);
console.log(sizes.map(s => `${s[0].padEnd(24)} ${kb(s[1]).padStart(8)}  ${s[2]}`).join("\n"));
console.log("TOTAL", kb(sizes.reduce((a, s) => a + s[1], 0)));
