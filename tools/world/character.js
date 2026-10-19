"use strict";
// ============================================================================================
// HD CHARACTERS — Quaternius CC0 rigged mannequin + 14 animations, real hairstyles and eyebrows,
// clothes/skin/face painted by a shader (no extra textures). Same interface as avatar.js so the
// multiplayer code can use either:  root.userData.{setHand, setTalking, setName, setSitting, setMove, tick}
// Needs THREE r128, GLTFLoader, SkeletonUtils, and window.Avatars (for name tags, palettes, shadow).
// ============================================================================================
(function () {
  const HEAD_BONE = "DEF-head";
  const ARM_BONES = { upper: "DEF-upper_arm.R", fore: "DEF-forearm.R", hand: "DEF-hand.R" };
  const HAIR_MODEL = { short: "simpleparted", long: "long", ponytail: "long", bun: "buns", buzz: "buzzed" };
  const BROWS_FOR = { short: "regular", buzz: "regular", long: "female", ponytail: "female", bun: "female" };
  // Clothing palette per outfit (sRGB hex). sleeve = how far the sleeve reaches along the T-posed arm (m).
  const CLOTHES = {
    polo: { shirt: "#f4f4ee", collar: "#f4f4ee", bottom: "#23314d", belt: "#141414", shoe: "#161616", sock: "#f4f4ee", skirt: 0, sleeve: 0.42 },
    blouse: { shirt: "#f6f6f0", collar: "#23314d", bottom: "#23314d", belt: "#23314d", shoe: "#161616", sock: "#f6f6f0", skirt: 1, sleeve: 0.4 },
    pe: { shirt: "#2f6b4f", collar: "#f3efe6", bottom: "#1d2621", belt: "#1d2621", shoe: "#e9e9e9", sock: "#f3efe6", skirt: 0, sleeve: 0.42 },
    casual: { shirt: "#d2553f", collar: "#d2553f", bottom: "#3f5f86", belt: "#3b2a20", shoe: "#e8e4dc", sock: "#ffffff", skirt: 0, sleeve: 0.4 },
    teacher: { shirt: "#e9d9b6", collar: "#c8a35b", bottom: "#3a2f2a", belt: "#241c18", shoe: "#2a1d16", sock: "#3a2f2a", skirt: 0, sleeve: 0.72 }
  };
  const CLIP = {
    idle: "Idle_Loop", talk: "Idle_Talking_Loop", walk: "Walk_Loop", jog: "Jog_Fwd_Loop", run: "Sprint_Loop",
    jump: "Jump_Loop", jumpStart: "Jump_Start", land: "Jump_Land",
    sitEnter: "Sitting_Enter", sit: "Sitting_Idle_Loop", sitTalk: "Sitting_Talking_Loop", sitExit: "Sitting_Exit",
    interact: "Interact", dance: "Dance_Loop"
  };

  let T = null; // loaded template

  async function load(THREE, base, version) {
    if (T) return T;
    const { MeshoptDecoder } = await import("https://cdn.jsdelivr.net/npm/meshoptimizer@1.3.0/meshopt_decoder.mjs");
    await MeshoptDecoder.ready;
    const loader = new THREE.GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const get = name => new Promise((ok, fail) => loader.load(`${base}${name}.glb?v=${version}`, ok, undefined, fail));
    const [gltf, ...parts] = await Promise.all([
      get("character"),
      ...Object.values(HAIR_MODEL).filter((v, i, a) => a.indexOf(v) === i).map(n => get("hair-" + n).then(g => ["hair", n, g.scene])),
      ...["regular", "female"].map(n => get("brows-" + n).then(g => ["brows", n, g.scene]))
    ]);
    T = { gltf, hair: {}, brows: {}, clips: {} };
    parts.forEach(([kind, n, scene]) => { T[kind][n] = scene; });
    gltf.animations.forEach(a => { T.clips[a.name] = a; });
    return T;
  }

  const lin = (THREE, hex) => new THREE.Color(hex).convertSRGBToLinear();

  // Real bind-pose bounds of the mannequin in metres (measured from the source asset). The shipped
  // mesh is quantised by meshopt, so the shader maps raw positions back into this box.
  const REAL_MIN = [-0.972, 0.0, -0.164], REAL_MAX = [0.972, 1.83, 0.205];

  function paintedMaterial(THREE, look, geometry) {
    geometry.computeBoundingBox();
    const qb = geometry.boundingBox.clone();
    // r128 reports normalised integer attributes in raw units; the GPU sees them as −1…1 / 0…1
    const pos = geometry.attributes.position;
    if (pos.normalized) {
      const arr = pos.array;
      const max = arr instanceof Int16Array ? 32767 : arr instanceof Uint16Array ? 65535 : arr instanceof Int8Array ? 127 : arr instanceof Uint8Array ? 255 : 1;
      qb.min.divideScalar(max); qb.max.divideScalar(max);
    }
    const c = CLOTHES[look.outfit] || CLOTHES.polo;
    const skinHex = (window.Avatars.SKIN || {})[look.skin] || "#c98f62";
    const hairHex = (window.Avatars.HAIR_COLOR || {})[look.hairColor] || "#1d1a19";
    const u = {
      uSkin: { value: lin(THREE, skinHex) }, uShirt: { value: lin(THREE, c.shirt) }, uCollar: { value: lin(THREE, c.collar) },
      uBottom: { value: lin(THREE, c.bottom) }, uBelt: { value: lin(THREE, c.belt) }, uShoe: { value: lin(THREE, c.shoe) },
      uSock: { value: lin(THREE, c.sock) }, uSkirt: { value: c.skirt }, uSleeve: { value: c.sleeve },
      uHair: { value: lin(THREE, hairHex) }, uHairline: { value: look.hair === "buzz" ? 1.785 : 1.77 },
      uQMin: { value: qb.min.clone() }, uQSize: { value: new THREE.Vector3().subVectors(qb.max, qb.min) },
      uRMin: { value: new THREE.Vector3(...REAL_MIN) }, uRSize: { value: new THREE.Vector3(REAL_MAX[0] - REAL_MIN[0], REAL_MAX[1] - REAL_MIN[1], REAL_MAX[2] - REAL_MIN[2]) }
    };
    const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, skinning: true });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = "varying vec3 vBind;\nuniform vec3 uQMin, uQSize, uRMin, uRSize;\n" +
        shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vBind = uRMin + (position - uQMin) / uQSize * uRSize;");
      shader.fragmentShader = `varying vec3 vBind;
uniform vec3 uSkin, uShirt, uCollar, uBottom, uBelt, uShoe, uSock, uHair;
uniform float uSkirt, uSleeve, uHairline;
` + shader.fragmentShader.replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
  // Paint clothes by bind-pose position (model faces +Z, T-pose, 1.83 m tall)
  float y = vBind.y; float ax = abs(vBind.x); float fz = vBind.z;
  vec3 col = uSkin;
  bool arm = ax > 0.2 && y > 1.28 && y < 1.58;
  if (y < 0.085) col = uShoe;
  else if (y < 0.97) {
    col = uSkirt > 0.5 ? (y > 0.5 ? uBottom : (y < 0.24 ? uSock : uSkin)) : uBottom;
    if (y > 0.925 && uSkirt < 0.5) col = uBelt;
  }
  else if (arm) col = ax < uSleeve ? uShirt : uSkin;
  else if (y < 1.53) { col = uShirt; if (y > 1.455 && ax < 0.1) col = uCollar; if (abs(vBind.x) < 0.006 && fz > 0.0 && y > 1.15 && y < 1.45) col = uShirt * 0.82; }
  // scalp hair under every hairstyle: crown, back of the head, above the ears
  if (y > 1.6) {
    bool crown = y > uHairline + (fz > 0.04 ? 0.03 : 0.0);
    bool back = fz < 0.0 && y > 1.64;
    bool sides = ax > 0.065 && y > 1.715 && fz < 0.07;
    if (crown || back || sides) col = uHair;
  }
  // face: eyes and mouth on the front of the head
  if (y > 1.6 && fz > 0.075) {
    float eye = length(vec2(ax - 0.035, (y - 1.705) * 1.15));
    if (eye < 0.0125) col = vec3(0.035);
    else if (eye < 0.0175) col = vec3(0.85);
    if (abs(y - 1.633) < 0.0045 && ax < 0.021) col = uSkin * 0.55;
  }
  vec4 diffuseColor = vec4( col, opacity );`);
    };
    m.customProgramCacheKey = () => "katuro-painted";
    return m;
  }

  function create(THREE, look, opts = {}) {
    if (!T) throw new Error("Characters.load() first");
    const A = window.Avatars;
    const L = { ...A.DEFAULT_LOOK, ...look };
    const root = new THREE.Group();
    root.name = "character";
    const model = THREE.SkeletonUtils.clone(T.gltf.scene);
    model.rotation.y = Math.PI;                     // asset faces +Z; our world faces −Z
    const scale = opts.role === "teacher" ? 0.98 : 0.93;
    model.scale.setScalar(scale);
    root.add(model);

    let skinned = null;
    model.traverse(o => { if (o.isSkinnedMesh && !skinned) skinned = o; });
    const painted = paintedMaterial(THREE, L, skinned.geometry);
    model.traverse(o => {
      if (o.isSkinnedMesh) { o.material = painted; o.castShadow = true; o.frustumCulled = false; }
    });
    const bone = name => skinned.skeleton.bones.find(b => b.name === name);

    // Hair + eyebrows: authored in model space → re-express relative to the head bone's bind pose
    const head = bone(HEAD_BONE);
    model.updateMatrixWorld(true);                 // rest pose = T-pose, in metres (bind matrices are quantisation-adjusted)
    // head transform relative to the model (bind pose, metres), then its inverse
    const headInv = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(head.matrixWorld).invert();
    const hairHex = (A.HAIR_COLOR || {})[L.hairColor] || "#1d1a19";
    // Hair/brows were made for the base-characters head (smaller, ~3 cm lower). Fit them to the mannequin's head:
    // scale about the source head-top anchor, then move that anchor onto the mannequin's head top.
    const HAIR_FIX = new THREE.Matrix4().makeTranslation(0, 1.845, 0.003)
      .multiply(new THREE.Matrix4().makeScale(1.1, 1.1, 1.15))
      .multiply(new THREE.Matrix4().makeTranslation(0, -1.81, 0.015));
    const attach = src => {
      if (!src) return;
      const piece = src.clone(true);
      piece.traverse(o => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.color = lin(THREE, hairHex).multiplyScalar(1.6);
        o.material.roughness = 0.55;
        if (o.material.map) o.material.alphaTest = 0.4;
        o.castShadow = true;
      });
      piece.applyMatrix4(HAIR_FIX);
      piece.applyMatrix4(headInv);
      head.add(piece);
    };
    attach(T.hair[HAIR_MODEL[L.hair] || "simpleparted"]);
    attach(T.brows[BROWS_FOR[L.hair] || "regular"]);

    // Contact shadow + name tag (shared with simple avatars)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: A.shadowTexture(THREE), transparent: true, depthWrite: false, opacity: 0.65 }));
    shadow.position.y = 0.02;
    root.add(shadow);
    let tag = null;
    const setName = (name, role) => {
      if (tag) { root.remove(tag); tag.material.map.dispose(); tag.material.dispose(); tag = null; }
      if (opts.noTag) return;
      tag = A.nameTag(THREE, name, role);
      tag.position.set(0, 2.0 * scale + 0.12, 0);
      root.add(tag);
    };
    setName(L.name, opts.role);

    // ---------- animation state machine (cross-fades between clips)
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [key, clipName] of Object.entries(CLIP)) {
      const clip = T.clips[clipName];
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (/Start|Enter|Exit|Land|Interact/.test(clipName)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
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
    let speed = 0, airborne = false, sitting = false, talking = 0, oneShot = null;
    mixer.addEventListener("finished", e => {
      if (e.action === actions.sitEnter) { play(talking > 0.2 ? "sitTalk" : "sit", 0.15); state = "sit"; }
      if (e.action === actions.sitExit || e.action === actions.land || e.action === actions.interact) { oneShot = null; state = ""; }
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
      if (speed < 0.25) play(talking > 0.2 ? "talk" : "idle", 0.3);
      else if (speed < 2.4) play("walk", 0.25, Math.max(0.6, speed / 1.45));
      else if (speed < 4.6) play("jog", 0.25, Math.max(0.8, speed / 3.6));
      else play("run", 0.25, Math.max(0.85, speed / 6.2));
      state = "move";
    };
    play("idle", 0);

    // ---------- raised hand: aim the right arm straight up after the animation, in world space
    const upper = bone(ARM_BONES.upper), fore = bone(ARM_BONES.fore), hand = bone(ARM_BONES.hand);
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const qDelta = new THREE.Quaternion(), qParent = new THREE.Quaternion(), qWorld = new THREE.Quaternion(), qTarget = new THREE.Quaternion();
    const aimBone = (b, child, amount, dirWorld) => {
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
    let handTarget = 0, handAmt = 0;
    const raiseDir = new THREE.Vector3();

    root.userData = {
      look: L, isCharacter: true,
      setName,
      setHand: on => { handTarget = on ? 1 : 0; },
      setTalking: level => { talking = level; },
      setSitting: on => { sitting = !!on; },
      setMove: (s, air) => { speed = s; airborne = !!air; },
      dance: () => { if (actions.dance) { play("dance", 0.3); oneShot = "dance"; state = "dance"; setTimeout(() => { if (oneShot === "dance") { oneShot = null; state = ""; } }, 6000); } },
      interact: () => { if (actions.interact) { play("interact", 0.15); oneShot = "interact"; state = "interact"; } },
      tick: dt => {
        chooseState();
        mixer.update(dt);
        handAmt += (handTarget - handAmt) * Math.min(1, dt * 7);
        if (handAmt > 0.01 && upper && fore && hand) {
          model.updateMatrixWorld(true);
          raiseDir.set(0.12, 1, -0.08).applyQuaternion(root.getWorldQuaternion(qWorld)).normalize();
          aimBone(upper, fore, handAmt, raiseDir);
          aimBone(fore, hand, handAmt, raiseDir);
        }
      }
    };
    return root;
  }

  (typeof window !== "undefined" ? window : globalThis).Characters = { load, create, CLOTHES, ready: () => !!T };
})();
