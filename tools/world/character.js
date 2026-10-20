"use strict";
// ============================================================================================
// HD CHARACTERS — Quaternius CC0 realistic male/female bodies (Universal Base Characters) with
// 16 animations retargeted from the Universal Animation Library (fetch-characters.mjs).
// Skin tone and school uniforms are painted by a shader over the body texture; the skirt, polo
// collar, ID lace and backpack are real 3D pieces. Faces blink and the mouth moves while talking.
// Looks with `model` set use a ready-made character from the Ultimate Modular packs instead (loaded on
// demand, same animations and interface; skin tone and hair colour still apply).
// Same interface as avatar.js so multiplayer can use either:
//   root.userData.{setHand, setTalking, setName, setSitting, setMove, tick, emote, interact}
// Needs THREE r128, GLTFLoader, SkeletonUtils, and window.Avatars (name tags, palettes, shadow).
// ============================================================================================
(function () {
  // Each hairstyle was modelled on one of the two heads; it is shifted onto the other when needed.
  const HAIR_MODEL = { short: "simpleparted", long: "long", ponytail: "long", bun: "buns", buzz: "buzzed" };
  const HAIR_HEAD = { simpleparted: "male", long: "female", buns: "female", buzzed: "male", buzzedfemale: "female" };
  // Clothing palette per outfit (sRGB hex). sleeve = share of the arm the sleeve covers (0 shoulder … 1 wrist).
  const CLOTHES = {
    polo: { shirt: "#f4f4ee", collar: "#f4f4ee", bottom: "#23314d", belt: "#141414", shoe: "#161616", sock: "#f4f4ee", skirt: 0, sleeve: 0.28, polo: 1 },
    blouse: { shirt: "#f6f6f0", collar: "#23314d", bottom: "#23314d", belt: "#23314d", shoe: "#161616", sock: "#f6f6f0", skirt: 1, sleeve: 0.24, polo: 0 },
    pe: { shirt: "#2f6b4f", collar: "#f3efe6", bottom: "#1d2621", belt: "#1d2621", shoe: "#e9e9e9", sock: "#f3efe6", skirt: 0, sleeve: 0.26, polo: 0 },
    casual: { shirt: "#d2553f", collar: "#d2553f", bottom: "#3f5f86", belt: "#3b2a20", shoe: "#e8e4dc", sock: "#ffffff", skirt: 0, sleeve: 0.24, polo: 0 },
    teacher: { shirt: "#e9d9b6", collar: "#c8a35b", bottom: "#3a2f2a", belt: "#241c18", shoe: "#2a1d16", sock: "#3a2f2a", skirt: 0, sleeve: 0.93, polo: 0 },
    guard: { shirt: "#2b3a55", collar: "#2b3a55", bottom: "#1c2333", belt: "#111111", shoe: "#111111", sock: "#111111", skirt: 0, sleeve: 0.3, polo: 1 },
    vendor: { shirt: "#f2efe6", collar: "#c0392b", bottom: "#7a3b2e", belt: "#c0392b", shoe: "#3a2f2a", sock: "#f2efe6", skirt: 0, sleeve: 0.5, polo: 0 }
  };
  const CLIP = {
    idle: "Idle_Loop", talk: "Idle_Talking_Loop", walk: "Walk_Loop", jog: "Jog_Fwd_Loop", run: "Sprint_Loop",
    jump: "Jump_Loop", jumpStart: "Jump_Start", land: "Jump_Land",
    sitEnter: "Sitting_Enter", sit: "Sitting_Idle_Loop", sitTalk: "Sitting_Talking_Loop", sitExit: "Sitting_Exit",
    interact: "Interact", dance: "Dance_Loop", pickup: "PickUp_Table", formal: "Walk_Formal_Loop"
  };
  const EMOTES = { wave: "Wave", clap: "Clap", cheer: "Cheer", nod: "Nod", dance: "Dance" };

  let T = null; // loaded templates
  const BASE = { base: "assets/characters/", version: "" };
  let loaderP = null, MODULAR = [];
  function getLoader(THREE) {
    if (!loaderP) loaderP = import("https://cdn.jsdelivr.net/npm/meshoptimizer@1.3.0/meshopt_decoder.mjs").then(async ({ MeshoptDecoder }) => {
      await MeshoptDecoder.ready;
      const loader = new THREE.GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      return loader;
    });
    return loaderP;
  }

  async function load(THREE, base, version) {
    if (T) return T;
    BASE.base = base; BASE.version = version;
    const loader = await getLoader(THREE);
    // ready-made characters for the picker (built by fetch-characters.mjs); optional
    try { MODULAR = await (await fetch(`${base}modular.json?v=${version}`)).json(); } catch (e) { MODULAR = []; }
    const get = name => new Promise((ok, fail) => loader.load(`${base}${name}.glb?v=${version}`, ok, undefined, fail));
    const hairNames = Object.keys(HAIR_HEAD);
    const [male, female, ...hair] = await Promise.all([get("body-male"), get("body-female"), ...hairNames.map(n => get("hair-" + n))]);
    T = { body: { male: prepBody(THREE, male), female: prepBody(THREE, female) }, hair: {} };
    hairNames.forEach((n, i) => { T.hair[n] = hair[i].scene; });
    return T;
  }

  // Per body: find the meshes, the landmarks written by the build, the texture's own skin colour
  function prepBody(THREE, gltf) {
    let body = null, eyes = null, brows = null;
    gltf.scene.traverse(o => {
      if (!o.isSkinnedMesh) return;
      if (o.userData.land) body = o;
      else if (o.material.name === "MI_Eyes") eyes = o;
      else brows = o;
    });
    const clips = {};
    gltf.animations.forEach(a => { clips[a.name] = a; });
    return { gltf, bodyName: body.name, eyesName: eyes && eyes.name, browsName: brows && brows.name, land: body.userData.land,
      bind: { bindMin: body.userData.bindMin, bindMax: body.userData.bindMax }, eyeBind: eyes && { bindMin: eyes.userData.bindMin, bindMax: eyes.userData.bindMax },
      refSkin: averageSkin(THREE, body.material.map), clips, surf: surfaceProbe(THREE, body) };
  }

  // Average colour of a patch of cheek on the body texture (linear), used to recolour skin
  function averageSkin(THREE, tex) {
    const fallback = new THREE.Color(0.62, 0.38, 0.25);
    try {
      const img = tex.image, c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 64, 64);
      const d = g.getImageData(3, 12, 3, 2).data;   // cheek: x 110–190, y 400–460 of 2048
      let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return new THREE.Color(r / n / 255, gg / n / 255, b / n / 255).convertSRGBToLinear();
    } catch (e) { return fallback; }
  }

  // Front/back surface depth of the bind-pose body at a height, for placing rigid clothing pieces
  function surfaceProbe(THREE, mesh) {
    const pos = mesh.geometry.attributes.position, map = bindMapper(THREE, mesh.geometry, mesh.userData);
    const v = new THREE.Vector3();
    return (y, maxX, back) => {
      let best = back ? Infinity : -Infinity;
      for (let i = 0; i < pos.count; i++) {
        map(v.fromBufferAttribute(pos, i));
        if (Math.abs(v.y - y) > 0.02 || Math.abs(v.x) > maxX) continue;
        best = back ? Math.min(best, v.z) : Math.max(best, v.z);
      }
      return isFinite(best) ? best : 0;
    };
  }

  // The shipped meshes are quantised by meshopt; this maps raw positions back to bind-pose metres
  function quantBox(THREE, geometry) {
    geometry.computeBoundingBox();
    const qb = geometry.boundingBox.clone();
    const pos = geometry.attributes.position;
    if (pos.normalized) {   // r128 reports normalised integer attributes in raw units; the GPU sees −1…1 / 0…1
      const arr = pos.array;
      const max = arr instanceof Int16Array ? 32767 : arr instanceof Uint16Array ? 65535 : arr instanceof Int8Array ? 127 : arr instanceof Uint8Array ? 255 : 1;
      qb.min.divideScalar(max); qb.max.divideScalar(max);
    }
    return qb;
  }
  function bindMapper(THREE, geometry, extras) {
    const qb = quantBox(THREE, geometry), qs = new THREE.Vector3().subVectors(qb.max, qb.min);
    const pos = geometry.attributes.position, arr = pos.array;
    const div = !pos.normalized ? 1 : arr instanceof Int16Array ? 32767 : arr instanceof Uint16Array ? 65535 : arr instanceof Int8Array ? 127 : 255;
    const rMin = new THREE.Vector3(...extras.bindMin), rSize = new THREE.Vector3(...extras.bindMax).sub(rMin);
    return v => v.divideScalar(div).sub(qb.min).divide(qs).multiply(rSize).add(rMin);
  }
  const bindUniforms = (THREE, geometry, extras) => {
    const qb = quantBox(THREE, geometry);
    const rMin = new THREE.Vector3(...extras.bindMin);
    return { uQMin: { value: qb.min.clone() }, uQSize: { value: new THREE.Vector3().subVectors(qb.max, qb.min) },
      uRMin: { value: rMin }, uRSize: { value: new THREE.Vector3(...extras.bindMax).sub(rMin) } };
  };
  const BIND_VS = "varying vec3 vBind;\nuniform vec3 uQMin, uQSize, uRMin, uRSize;\n";
  const BIND_CALC = "vBind = uRMin + (position - uQMin) / uQSize * uRSize;";

  const lin = (THREE, hex) => new THREE.Color(hex).convertSRGBToLinear();

  // ---------- body material: textured skin recoloured to the chosen tone, uniform painted on top
  function bodyMaterial(THREE, src, look, B, geometry, face) {
    const L = B.land;
    const c = CLOTHES[look.outfit] || CLOTHES.polo;
    const skinHex = (window.Avatars.SKIN || {})[look.skin] || "#c98f62";
    const m = src.clone();
    const u = {
      ...bindUniforms(THREE, geometry, B.bind),
      uSkin: { value: lin(THREE, skinHex) }, uRef: { value: B.refSkin },
      uShirt: { value: lin(THREE, c.shirt) }, uCollar: { value: lin(THREE, c.collar) }, uBottom: { value: lin(THREE, c.bottom) },
      uBelt: { value: lin(THREE, c.belt) }, uShoe: { value: lin(THREE, c.shoe) }, uSock: { value: lin(THREE, c.sock) },
      uSkirt: { value: c.skirt }, uPolo: { value: c.polo },
      uSleeve: { value: L.shoulderX + 0.03 + c.sleeve * (L.wristX - L.shoulderX - 0.03) },
      // landmarks (bind pose, metres)
      uNeck: { value: L.neck }, uWaist: { value: L.waist }, uKnee: { value: L.knee }, uAnkle: { value: L.ankle },
      uShoulderX: { value: L.shoulderX }, uArmY: { value: L.armY },
      uMouth: { value: new THREE.Vector3(0, L.eyeY - (L.head > 1.58 ? 0.066 : 0.06), L.eyeZ + 0.005) },
      uTalk: face.talk
    };
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = BIND_VS + "uniform vec3 uMouth;\nuniform float uTalk;\n" +
        shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  ${BIND_CALC}
  // jaw: the chin and lower lip drop a little while talking (no jaw bone in the rig)
  {
    vec3 d = vBind - uMouth;
    float below = smoothstep(0.0, -0.006, d.y) * smoothstep(-0.075, -0.03, d.y);
    float front = smoothstep(-0.07, -0.02, d.z) * (1.0 - smoothstep(0.03, 0.06, abs(d.x)));
    transformed += normalize(vec3(0.0, -1.0, 0.25)) * uTalk * 0.009 * below * front / uRSize.y * uQSize.y;
  }`);
      shader.fragmentShader = `varying vec3 vBind;
uniform vec3 uSkin, uRef, uShirt, uCollar, uBottom, uBelt, uShoe, uSock, uMouth;
uniform float uSkirt, uPolo, uSleeve, uNeck, uWaist, uKnee, uAnkle, uShoulderX, uArmY, uTalk;
` + shader.fragmentShader
        .replace("#include <map_fragment>", `
  vec4 texelColor = mapTexelToLinear( texture2D( map, vUv ) );
  float y = vBind.y; float ax = abs(vBind.x); float fz = vBind.z;
  vec3 skin = texelColor.rgb * (uSkin / max(uRef, vec3(0.02)));
  float shade = clamp(dot(texelColor.rgb, vec3(0.3, 0.59, 0.11)) / max(dot(uRef, vec3(0.3, 0.59, 0.11)), 0.02), 0.55, 1.2);
  vec3 cloth = vec3(-1.0);
  bool arm = ax > uShoulderX + 0.025 && abs(y - uArmY) < 0.13;
  if (y < uAnkle + 0.035) cloth = uShoe;
  else if (y < uWaist) {
    if (uSkirt > 0.5) { if (y > uKnee + 0.04) cloth = uBottom; else if (y < uAnkle + 0.13) cloth = uSock; }
    else cloth = (y > uWaist - 0.035) ? uBelt : uBottom;
  }
  else if (arm) { if (ax < uSleeve) cloth = uShirt; }
  else {
    // neckline: low at the throat, rising over the shoulders up to the base of the neck
    float neckLine = uNeck - 0.04 + smoothstep(0.055, 0.11, ax) * 0.1 - (fz < 0.0 ? 0.0 : 0.0);
    if (y < neckLine) {
      cloth = uShirt;
      // polo: open placket at the throat; buttons line; blouse/PE: contrasting collar band
      if (uPolo > 0.5 && fz > 0.0 && ax < 0.016 + (y - uNeck + 0.08) * 0.35 && y > uNeck - 0.08) cloth = skin;
      if (y > neckLine - 0.03 && uPolo < 0.5) cloth = uCollar;
      if (ax < 0.004 && fz > 0.0 && y > uWaist + 0.05 && y < uNeck - 0.12) cloth = uShirt * 0.8;
    }
  }
  vec3 col = cloth.x < 0.0 ? skin : cloth * mix(1.0, shade, 0.12);
  // lips part while talking
  if (cloth.x < 0.0) {
    vec3 dm = vBind - uMouth;
    float slit = (1.0 - smoothstep(0.0, 0.02, abs(dm.x))) * (1.0 - smoothstep(0.0, 0.0015 + uTalk * 0.0035, abs(dm.y + 0.001)));
    col = mix(col, vec3(0.06, 0.02, 0.02), slit * step(-0.03, dm.z) * clamp(uTalk * 3.0, 0.0, 1.0));
  }
  float clothed = cloth.x < 0.0 ? 0.0 : 1.0;
  diffuseColor.rgb *= col;`)
        // muscles from the body's normal map shouldn't show through clothes
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  normal = normalize(mix(normal, geometryNormal, clothed * 0.85));`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.85, clothed);`);
    };
    m.customProgramCacheKey = () => "katuro-body";
    return m;
  }

  // ---------- eyes: lids close over the eyeball on a blink
  function eyeMaterial(THREE, src, look, B, geometry, face) {
    const L = B.land;
    const m = src.clone();
    const u = { ...bindUniforms(THREE, geometry, B.eyeBind), uLid: { value: lin(THREE, (window.Avatars.SKIN || {})[look.skin] || "#c98f62").multiplyScalar(0.8) },
      uEye: { value: new THREE.Vector3(L.eyeX, L.eyeY, L.eyeR) }, uBlink: face.blink };
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = BIND_VS + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  " + BIND_CALC);
      shader.fragmentShader = "varying vec3 vBind;\nuniform vec3 uLid, uEye;\nuniform float uBlink;\n" +
        shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
  float lidEdge = uEye.z * (1.15 - 2.3 * uBlink);
  if (vBind.y - uEye.y > lidEdge) diffuseColor.rgb = uLid;`);
    };
    m.customProgramCacheKey = () => "katuro-eyes";
    return m;
  }

  function create(THREE, look, opts = {}) {
    if (!T) throw new Error("Characters.load() first");
    const A = window.Avatars;
    const L = { ...A.DEFAULT_LOOK, ...look };
    if (L.model && MODULAR.some(m => m.id === L.model)) return createModular(THREE, L, opts);
    const kind = bodyKind(L);
    const B = T.body[kind];
    const root = new THREE.Group();
    root.name = "character";
    const model = THREE.SkeletonUtils.clone(B.gltf.scene);
    model.rotation.y = Math.PI;                     // asset faces +Z; our world faces −Z
    const scale = opts.role === "teacher" || L.outfit === "teacher" ? 0.97 : 0.92;
    model.scale.setScalar(scale);
    root.add(model);
    model.updateMatrixWorld(true);                 // rest pose = T-pose, in metres

    const face = { talk: { value: 0 }, blink: { value: 0 } };
    let skinned = null;
    const hairHex = (A.HAIR_COLOR || {})[L.hairColor] || "#1d1a19";
    model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false; o.castShadow = true;
      if (o.name === B.bodyName) { skinned = o; o.material = bodyMaterial(THREE, o.material, L, B, o.geometry, face); }
      else if (o.name === B.eyesName) o.material = eyeMaterial(THREE, o.material, L, B, o.geometry, face);
      else { o.material = o.material.clone(); o.material.color = lin(THREE, hairHex).multiplyScalar(1.4); }   // eyebrows
    });
    const bone = name => skinned.skeleton.bones.find(b => b.name === name);
    // matrix taking model-space (bind pose, metres) into a bone's local space
    const toBone = b => new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(b.matrixWorld).invert();
    const attachRigid = (boneName, obj) => { const b = bone(boneName); obj.applyMatrix4(toBone(b)); b.add(obj); return obj; };

    // ---------- hair: shift a hairstyle made for the other head onto this one
    const hairName = L.hair === "buzz" && kind === "female" ? "buzzedfemale" : HAIR_MODEL[L.hair] || "simpleparted";
    const src = T.hair[hairName];
    if (src) {
      const piece = src.clone(true);
      const made = T.body[HAIR_HEAD[hairName]].land;
      if (made !== B.land) {
        const k = (B.land.top - B.land.head) / (made.top - made.head);
        piece.applyMatrix4(new THREE.Matrix4().makeTranslation(0, B.land.head, 0)
          .multiply(new THREE.Matrix4().makeScale(k * 1.02, k, k * 1.02))
          .multiply(new THREE.Matrix4().makeTranslation(0, -made.head, 0)));
      }
      piece.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.color = lin(THREE, hairHex).multiplyScalar(1.6);
        o.material.roughness = 0.55;
        if (o.material.map) o.material.alphaTest = 0.4;
        o.castShadow = true;
      });
      model.updateMatrixWorld(true);
      attachRigid("Head", piece);
    }

    // ---------- 3D clothes
    const c = CLOTHES[L.outfit] || CLOTHES.polo;
    const LM = B.land;
    const clothMat = hex => { const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, side: THREE.DoubleSide }); m.color.convertSRGBToLinear(); return m; };
    if (c.skirt) root.userData.skirt = addSkirt(THREE, model, skinned, LM, clothMat(c.bottom));
    if (c.polo) {   // folded polo collar around the neck
      const r = (B.surf(LM.neck - 0.02, 0.03, false) - B.surf(LM.neck - 0.02, 0.03, true)) / 2 + 0.012;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 24, Math.PI * 1.75), clothMat(c.collar));
      ring.rotation.set(Math.PI / 2 - 0.3, 0, Math.PI / 2 + Math.PI * 0.125);   // opening at the front, tilted down to the chest
      ring.scale.set(1.12, 1, 2.2);
      ring.position.set(0, LM.neck - 0.03, (B.surf(LM.neck - 0.02, 0.03, false) + B.surf(LM.neck - 0.02, 0.03, true)) / 2);
      attachRigid("spine_03", ring);
    }
    if (L.outfit !== "casual") addLanyard(THREE, attachRigid, B, LM, L.outfit === "teacher" ? "#c8a35b" : "#2f6b4f");
    if (L.bag && L.outfit !== "teacher") addBackpack(THREE, attachRigid, B, LM, L.bagColor || "#2f4f7f");

    // ---------- contact shadow + name tag (shared with simple avatars)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: A.shadowTexture(THREE), transparent: true, depthWrite: false, opacity: 0.65 }));
    shadow.position.y = 0.02;
    root.add(shadow);
    let tag = null;
    const setName = (name, role) => {
      if (tag) { root.remove(tag); tag.material.map.dispose(); tag.material.dispose(); tag = null; }
      if (opts.noTag) return;
      tag = A.nameTag(THREE, name, role || opts.role);
      tag.position.set(0, LM.top * scale + 0.24, 0);
      root.add(tag);
    };
    setName(L.name, opts.role);

    // ---------- animations, raised hand, emotes, face (shared with the modular characters)
    const api = rig(THREE, root, model, B.clips, {
      upperR: bone("upperarm_r"), foreR: bone("lowerarm_r"), handR: bone("hand_r"),
      upperL: bone("upperarm_l"), foreL: bone("lowerarm_l"), handL: bone("hand_l"), head: bone("Head")
    }, face, opts);
    root.userData = { look: L, isCharacter: true, body: kind, setName, ...api };
    return root;
  }

  // Animation state machine + procedural arm poses (raised hand, emotes) + optional face (blink, talk).
  // bones: { upperR, foreR, handR, upperL, foreL, handL, head }. Returns the userData API.
  function rig(THREE, root, model, clips, bones, face, opts) {
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [key, clipName] of Object.entries(CLIP)) {
      const clip = clips[clipName];
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (/Start|Enter|Exit|Land|Interact|PickUp/.test(clipName)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[key] = a;
    }
    let current = null, state = "";
    const play = (key, fade = 0.22, timeScale = 1) => {
      const next = actions[key];
      if (!next) return;
      next.timeScale = timeScale;
      if (current === next) return;
      next.reset().setEffectiveWeight(1).play();
      if (current) current.crossFadeTo(next, fade, false);
      current = next;
    };
    let speed = 0, airborne = false, sitting = false, talking = 0, oneShot = null, idleKey = opts.idle || "idle";
    mixer.addEventListener("finished", e => {
      if (e.action === actions.sitEnter) { play(talking > 0.2 ? "sitTalk" : "sit", 0.15); state = "sit"; }
      if (e.action === actions.sitExit || e.action === actions.land || e.action === actions.interact || e.action === actions.pickup) { oneShot = null; state = ""; }
    });
    const chooseState = () => {
      if (oneShot) return;
      if (sitting) {
        if (state !== "sit" && state !== "sitEnter") { play("sitEnter", 0.2); state = "sitEnter"; }
        else if (state === "sit") play(talking > 0.2 ? "sitTalk" : "sit", 0.3);
        return;
      }
      if (state === "sit" || state === "sitEnter") { play("sitExit", 0.15); state = "sitExit"; oneShot = "sitExit"; return; }
      if (airborne) { if (state !== "jump") { play("jumpStart", 0.08); state = "jump"; setTimeout(() => { if (airborne && state === "jump") play("jump", 0.1); }, 250); } return; }
      if (state === "jump") { play("land", 0.08); state = "land"; oneShot = "land"; return; }
      if (speed < 0.25) play(talking > 0.2 ? "talk" : idleKey, 0.3);
      else if (speed < 2.4) play(idleKey === "formal" ? "formal" : "walk", 0.25, Math.max(0.6, speed / 1.45));
      else if (speed < 4.6) play("jog", 0.25, Math.max(0.8, speed / 3.6));
      else play("run", 0.25, Math.max(0.85, speed / 6.2));
      state = "move";
    };
    play(idleKey, 0);
    mixer.update(Math.random() * 2);   // crowds shouldn't breathe in sync

    // ---------- procedural arm poses (raised hand, emotes), applied after the animation, in world space
    const R = { upper: bones.upperR, fore: bones.foreR, hand: bones.handR }, Lf = { upper: bones.upperL, fore: bones.foreL, hand: bones.handL }, head = bones.head;
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
    const qDelta = new THREE.Quaternion(), qParent = new THREE.Quaternion(), qWorld = new THREE.Quaternion(), qTarget = new THREE.Quaternion(), qRoot = new THREE.Quaternion();
    const aimBone = (b, child, amount, dirWorld) => {
      if (!b || !child) return;
      b.getWorldPosition(v1); child.getWorldPosition(v2);
      v3.subVectors(v2, v1).normalize();
      qDelta.setFromUnitVectors(v3, dirWorld);
      b.getWorldQuaternion(qWorld);
      qTarget.copy(qDelta).multiply(qWorld);
      b.parent.getWorldQuaternion(qParent).invert();
      qTarget.premultiply(qParent);
      b.quaternion.slerp(qTarget, amount);
      b.updateMatrixWorld(true);
    };
    const dir = new THREE.Vector3(), dir2 = new THREE.Vector3();
    // character space: the character faces −Z and its right hand is on +X
    const local = (x, y, z, out) => out.set(x, y, z).applyQuaternion(qRoot).normalize();
    let handTarget = 0, handAmt = 0, emote = null, emoteT = 0, emoteAmt = 0;
    let blinkIn = 1 + Math.random() * 3, blinkT = -1;

    return {
      setHand: on => { handTarget = on ? 1 : 0; },
      setTalking: level => { talking = level; },
      setSitting: on => { sitting = !!on; },
      setMove: (s, air) => { speed = s; airborne = !!air; },
      setIdle: key => { idleKey = key; },
      emote: name => {
        if (name === "dance") { if (actions.dance) { play("dance", 0.3); oneShot = "dance"; state = "dance"; setTimeout(() => { if (oneShot === "dance") { oneShot = null; state = ""; } }, 6000); } return; }
        emote = name; emoteT = 0;
      },
      interact: () => { if (actions.interact) { play("interact", 0.15); oneShot = "interact"; state = "interact"; } },
      pickup: () => { if (actions.pickup) { play("pickup", 0.15); oneShot = "pickup"; state = "pickup"; } },
      tick: dt => {
        chooseState();
        mixer.update(dt);
        if (face) {
          face.talk.value += (Math.min(1, talking * 1.6) * (0.6 + 0.4 * Math.sin(performance.now() / 70)) - face.talk.value) * Math.min(1, dt * 18);
          blinkIn -= dt;
          if (blinkIn < 0 && blinkT < 0) blinkT = 0;
          if (blinkT >= 0) { blinkT += dt; face.blink.value = Math.sin(Math.min(1, blinkT / 0.16) * Math.PI); if (blinkT > 0.16) { blinkT = -1; face.blink.value = 0; blinkIn = 2 + Math.random() * 4; } }
        }
        handAmt += (handTarget - handAmt) * Math.min(1, dt * 7);
        if (emote) { emoteT += dt; if (emoteT > 2.6) emote = null; }
        emoteAmt += ((emote ? 1 : 0) - emoteAmt) * Math.min(1, dt * 8);
        if (handAmt < 0.01 && emoteAmt < 0.01) return;
        model.updateMatrixWorld(true);
        root.getWorldQuaternion(qRoot);
        if (handAmt > 0.01 && !(emote && emoteAmt > 0.5)) {
          local(0.12, 1, -0.08, dir);
          aimBone(R.upper, R.fore, handAmt, dir); aimBone(R.fore, R.hand, handAmt, dir);
        }
        if (emoteAmt > 0.01) {
          const t = emoteT, k = emoteAmt;
          if (emote === "wave") {
            local(0.55, 0.85, -0.1, dir); aimBone(R.upper, R.fore, k, dir);
            local(0.25 + Math.sin(t * 9) * 0.45, 1, -0.15, dir); aimBone(R.fore, R.hand, k, dir);
          } else if (emote === "cheer") {
            const pump = 0.85 + Math.sin(t * 7) * 0.15;
            local(0.35, pump, -0.1, dir); aimBone(R.upper, R.fore, k, dir); local(0.1, 1, -0.1, dir); aimBone(R.fore, R.hand, k, dir);
            local(-0.35, pump, -0.1, dir); aimBone(Lf.upper, Lf.fore, k, dir); local(-0.1, 1, -0.1, dir); aimBone(Lf.fore, Lf.hand, k, dir);
          } else if (emote === "clap") {
            const open = Math.max(0, Math.sin(t * 13)) * 0.35;
            local(0.35, -0.55, -0.75, dir); aimBone(R.upper, R.fore, k, dir); local(-0.75 + open, 0.15, -0.55, dir2); aimBone(R.fore, R.hand, k, dir2);
            local(-0.35, -0.55, -0.75, dir); aimBone(Lf.upper, Lf.fore, k, dir); local(0.75 - open, 0.15, -0.55, dir2); aimBone(Lf.fore, Lf.hand, k, dir2);
          } else if (emote === "nod" && head) {
            head.rotateX(Math.sin(t * 8) * 0.22 * k * (t < 1.6 ? 1 : 0));
          }
        }
      }
    };
  }

  // ---------- modular characters (Ultimate Modular packs): loaded on demand, one material, recoloured skin + hair
  // Returns the root straight away; the model appears when its file has loaded (calls made before are replayed).
  function createModular(THREE, L, opts) {
    const A = window.Avatars;
    const root = new THREE.Group();
    root.name = "character";
    const scale = opts.role === "teacher" ? 0.96 : 0.92;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: A.shadowTexture(THREE), transparent: true, depthWrite: false, opacity: 0.65 }));
    shadow.position.y = 0.02;
    root.add(shadow);
    let tag = null, top = 1.86, api = null;
    const setName = (name, role) => {
      if (tag) { root.remove(tag); tag.material.map.dispose(); tag.material.dispose(); tag = null; }
      if (opts.noTag) return;
      tag = A.nameTag(THREE, name, role || opts.role);
      tag.position.set(0, top * scale + 0.24, 0);
      root.add(tag);
    };
    setName(L.name, opts.role);
    // calls made before the model loads are remembered and replayed
    const pending = {};
    const call = (fn, ...args) => (api ? api[fn](...args) : (pending[fn] = args));
    root.userData = {
      look: L, isCharacter: true, body: "mod", setName, loaded: false,
      setHand: on => call("setHand", on), setTalking: l => call("setTalking", l), setSitting: on => call("setSitting", on),
      setMove: (s, air) => call("setMove", s, air), setIdle: k => call("setIdle", k),
      emote: n => api && api.emote(n), interact: () => api && api.interact(), pickup: () => api && api.pickup(),
      tick: dt => { if (api) api.tick(dt); }
    };
    loadModular(THREE, L.model).then(M => {
      const model = THREE.SkeletonUtils.clone(M.gltf.scene);
      model.rotation.y = Math.PI;               // the packs face +Z; our world faces −Z
      model.scale.setScalar(scale);
      root.add(model);
      const mat = modularMaterial(THREE, L);
      model.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; } });
      top = M.land.top || top;
      setName(L.name, opts.role);
      const byName = n => { const s = THREE.PropertyBinding.sanitizeNodeName(n); let b = null; model.traverse(o => { if (!b && (o.name === n || o.name === s)) b = o; }); return b; };
      api = rig(THREE, root, model, M.clips, {
        upperR: byName("UpperArm.R"), foreR: byName("LowerArm.R"), handR: byName("Wrist.R"),
        upperL: byName("UpperArm.L"), foreL: byName("LowerArm.L"), handL: byName("Wrist.L"), head: byName("Head")
      }, null, opts);
      for (const [fn, args] of Object.entries(pending)) api[fn](...args);
      root.userData.loaded = true;
    }).catch(e => { root.userData.loaded = true; console.warn("character " + L.model + " failed to load", e); });
    return root;
  }
  // vertex colours, with the build's marker colours swapped for the chosen skin tone and hair colour
  function modularMaterial(THREE, L) {
    const A = window.Avatars;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, skinning: true });
    const u = { uSkin: { value: lin(THREE, (A.SKIN || {})[L.skin] || "#c98f62") }, uHair: { value: lin(THREE, (A.HAIR_COLOR || {})[L.hairColor] || "#1d1a19").multiplyScalar(1.3) } };
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = "uniform vec3 uSkin, uHair;\n" + shader.fragmentShader.replace("#include <color_fragment>", `
  #ifdef USE_COLOR
    vec3 vc = vColor;
    if (distance(vc, vec3(1.0, 0.0, 1.0)) < 0.1) vc = uSkin;
    else if (distance(vc, vec3(0.5, 0.0, 0.5)) < 0.1) vc = uSkin * 0.8;
    else if (distance(vc, vec3(0.0, 1.0, 1.0)) < 0.1) vc = uHair;
    diffuseColor.rgb *= vc;
  #endif`);
    };
    m.customProgramCacheKey = () => "katuro-modular";
    return m;
  }
  const modCache = {};
  function loadModular(THREE, id) {
    if (!modCache[id]) {
      modCache[id] = new Promise((ok, fail) => getLoader(THREE).then(loader => loader.load(`${BASE.base}mod-${id}.glb?v=${BASE.version}`, gltf => {
        const clips = {};
        gltf.animations.forEach(a => { clips[a.name] = a; });
        let land = {};
        gltf.scene.traverse(o => { if (o.userData && o.userData.land) land = o.userData.land; });
        ok({ gltf, clips, land });
      }, undefined, fail)));
    }
    return modCache[id];
  }

  // Skirt: an open cone skinned to the pelvis and both thighs, so it follows the legs when walking or sitting
  function addSkirt(THREE, model, body, LM, mat) {
    const top = LM.waist + 0.02, hem = LM.knee + 0.05, h = top - hem;
    const geo = new THREE.CylinderGeometry(0.16, 0.215, h, 28, 6, true);
    geo.translate(0, (top + hem) / 2, -0.02);
    const bones = body.skeleton.bones;
    const idx = n => bones.findIndex(b => b.name === n);
    const iP = idx("pelvis"), iL = idx("thigh_l"), iR = idx("thigh_r");
    const pos = geo.attributes.position, si = [], sw = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const d = (top - y) / h;                       // 0 at the waist, 1 at the hem
      const leg = Math.min(1, d * 0.95);
      const left = THREE.MathUtils.smoothstep(x, -0.09, 0.09);   // asset space: +x is the character's left
      const back = THREE.MathUtils.smoothstep(-pos.getZ(i), -0.02, 0.12);   // the back panel hangs from the hips
      const lg = leg * (1 - back * 0.75);
      si.push(iP, iL, iR, 0);
      sw.push(1 - lg, lg * left, lg * (1 - left), 0);
    }
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    mat.skinning = true;
    const skirt = new THREE.SkinnedMesh(geo, mat);
    skirt.frustumCulled = false; skirt.castShadow = true;
    model.add(skirt);
    model.updateMatrixWorld(true);
    // our own skeleton over the same bones: inverses from the current (bind) pose, in metres
    skirt.bind(new THREE.Skeleton(bones.slice()), skirt.matrixWorld);
    return skirt;
  }

  // Merge a group's meshes per material (one draw call per material instead of one per piece)
  function mergeByMaterial(THREE, group) {
    const U = THREE.BufferGeometryUtils;
    if (!U) return group;
    group.updateMatrix(); group.updateMatrixWorld(true);
    const byMat = new Map();
    group.children.forEach(m => { if (m.isMesh) (byMat.get(m.material) || byMat.set(m.material, []).get(m.material)).push(m); });
    const out = new THREE.Group();
    for (const [mat, meshes] of byMat) {
      const geos = meshes.map(m => { const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); g.applyMatrix4(m.matrix); return g; });
      const merged = new THREE.Mesh(U.mergeBufferGeometries(geos, false), mat);
      merged.castShadow = true;
      out.add(merged);
    }
    return out;
  }

  // School ID on a lanyard: two straps from the neck down to a card on the chest
  function addLanyard(THREE, attachRigid, B, LM, strapHex) {
    const g = new THREE.Group();
    const y0 = LM.neck - 0.03, y1 = LM.neck - 0.16;
    const zf = B.surf(y1, 0.04, false) + 0.012, zn = B.surf(y0, 0.05, false);
    const strap = new THREE.MeshStandardMaterial({ color: strapHex, roughness: 0.7 }); strap.color.convertSRGBToLinear();
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(s * 0.05, y0 + 0.01, zn - 0.01), b = new THREE.Vector3(s * 0.012, y1 + 0.045, zf);
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.002), strap);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.lookAt(b); m.rotateX(Math.PI / 2);
      g.add(m);
    }
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.003), new THREE.MeshBasicMaterial({ map: idCardTexture(THREE) }));
    card.position.set(0, y1, zf + 0.002);
    g.add(card);
    attachRigid("spine_03", mergeByMaterial(THREE, g));
  }
  let idTex = null;
  function idCardTexture(THREE) {
    if (idTex) return idTex;
    const c = document.createElement("canvas"); c.width = 64; c.height = 96;
    const g = c.getContext("2d");
    g.fillStyle = "#f7f5ef"; g.fillRect(0, 0, 64, 96);
    g.fillStyle = "#2f6b4f"; g.fillRect(0, 0, 64, 22);
    g.fillStyle = "#c9b48a"; g.fillRect(18, 30, 28, 32);
    g.fillStyle = "#555"; g.fillRect(10, 70, 44, 4); g.fillRect(14, 79, 36, 3);
    idTex = new THREE.CanvasTexture(c); idTex.encoding = THREE.sRGBEncoding;
    return idTex;
  }

  function addBackpack(THREE, attachRigid, B, LM, hex) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }); m.color.convertSRGBToLinear();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.8 });
    const yc = LM.chest - 0.1, zb = B.surf(yc, 0.08, true);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.13), m);
    bag.position.set(0, yc, zb - 0.07);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), m);
    pocket.position.set(0, yc - 0.1, zb - 0.155);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.285, 0.05, 0.14), dark);
    flap.position.set(0, yc + 0.17, zb - 0.07);
    g.add(bag, pocket, flap);
    for (const s of [-1, 1]) {   // shoulder straps: up the back from the bag to the top of the shoulders
      const y0 = yc + 0.12, y1 = LM.neck - 0.035, zt = B.surf(y1, 0.11, true);
      const a = new THREE.Vector3(s * 0.08, y0, zb - 0.012), b = new THREE.Vector3(s * 0.09, y1, zt + 0.02);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, a.distanceTo(b), 0.012), dark);
      strap.position.copy(a).add(b).multiplyScalar(0.5);
      strap.lookAt(b); strap.rotateX(Math.PI / 2);
      g.add(strap);
    }
    attachRigid("spine_03", mergeByMaterial(THREE, g));
  }

  // Body chosen in the editor; older saved looks guess it from the outfit/hair
  function bodyKind(L) {
    if (L.body === "male" || L.body === "female") return L.body;
    return L.outfit === "blouse" || ["long", "ponytail", "bun"].includes(L.hair) ? "female" : "male";
  }

  (typeof window !== "undefined" ? window : globalThis).Characters = {
    load, create, CLOTHES, EMOTES, bodyKind, ready: () => !!T,
    models: () => MODULAR,                                   // [{ id, label, sex }] ready-made characters
    preload: (THREE, id) => loadModular(THREE, id)            // warm the cache (e.g. the next one in the picker)
  };
})();
