// ============================================================================================
// ENVIRONMENT — wind, waving flag, birds, falling leaves, butterflies, and a procedural soundscape
// (wind gusts, birdsong, footsteps, ceiling-fan hum) generated with the Web Audio API: no audio files.
// ============================================================================================
const W = await new Promise(ok => window.__world ? ok(window.__world) : window.addEventListener("world-ready", () => ok(window.__world), { once: true }));
const { THREE, scene, me, materials: M } = W;
const lite = W.device.tier === "low";

// ---------------------------------------------------------------- wind: GPU sway for canopies and plants
const wind = { t: { value: 0 }, gust: { value: 0.5 } };
function addSway(mat, fromY, toY, amp) {
  if (!mat) return;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = wind.t;
    shader.uniforms.uGust = wind.gust;
    shader.vertexShader = "uniform float uTime, uGust;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  // world-space geometry (the world is merged at the origin): sway grows with height above the trunk
  float h = smoothstep(${fromY.toFixed(2)}, ${toY.toFixed(2)}, position.y);
  float ph = position.x * 0.31 + position.z * 0.27;
  float a = ${amp.toFixed(3)} * h * (0.45 + uGust);
  transformed.x += sin(uTime * 1.7 + ph) * a + sin(uTime * 4.3 + ph * 2.1) * a * 0.25;
  transformed.z += cos(uTime * 1.3 + ph * 0.8) * a * 0.6;`);
  };
  mat.customProgramCacheKey = () => "sway" + fromY + amp;
  mat.needsUpdate = true;
}
addSway(M.leaf, 2.0, 4.5, 0.16);
addSway(M.leaf2, 2.0, 4.5, 0.16);
addSway(M.plant, 0.35, 1.3, 0.05);

// ---------------------------------------------------------------- flag: replace the flat flag with a waving cloth
let flags = [];
scene.traverse(o => { if (o.userData && o.userData.flag) flags.push(o); });
if (M.flag) M.flag.visible = false;   // hide the static flag box behind it
flags = flags.map(mesh => {
  const w = mesh.geometry.parameters.width, h = mesh.geometry.parameters.height;
  const geo = new THREE.PlaneGeometry(w, h, 24, 6);
  mesh.geometry.dispose();
  mesh.geometry = geo;
  mesh.material.side = THREE.DoubleSide;
  const base = geo.attributes.position.array.slice();
  return { mesh, geo, base, w, dir: Math.cos(mesh.rotation.y) > 0 ? 1 : -1 };
});
// keep only one side (the cloth is double-sided now)
flags.slice(1).forEach(f => { f.mesh.visible = false; });

// ---------------------------------------------------------------- birds: a small flock circling the campus
const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, side: THREE.DoubleSide });
const wingGeo = new THREE.BufferGeometry();
wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.14, 0.42, 0, 0.02], 3));
const bodyGeo = new THREE.ConeGeometry(0.06, 0.32, 5).rotateX(Math.PI / 2);
const BIRDS = lite ? 5 : 11;
// GPU instancing: all bodies, left wings and right wings are 3 draw calls in total
const birdBody = new THREE.InstancedMesh(bodyGeo, birdMat, BIRDS);
const birdL = new THREE.InstancedMesh(wingGeo, birdMat, BIRDS);
const birdR = new THREE.InstancedMesh(wingGeo, birdMat, BIRDS);
[birdBody, birdL, birdR].forEach(m => { m.frustumCulled = false; scene.add(m); });
const birds = [];
for (let i = 0; i < BIRDS; i++) {
  birds.push({ cx: -10 + Math.random() * 30, cz: -10 + Math.random() * 30, rad: 18 + Math.random() * 25, h: 13 + Math.random() * 9, sp: (0.12 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6.28, flap: 7 + Math.random() * 4 });
}
const birdObj = new THREE.Object3D(), wingObj = new THREE.Object3D(), birdM = new THREE.Matrix4(), wingM = new THREE.Matrix4();

// ---------------------------------------------------------------- falling leaves (near the player) + butterflies (garden)
const LEAVES = lite ? 0 : 70;
const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.06), new THREE.MeshLambertMaterial({ color: 0x6f8f2f, side: THREE.DoubleSide }), Math.max(1, LEAVES));
leafMesh.frustumCulled = false;
leafMesh.visible = LEAVES > 0;
scene.add(leafMesh);
const leaves = [];
const tmp = new THREE.Object3D();
function respawnLeaf(L) {
  const near = W.trees.filter(t => Math.hypot(t.x - me.x, t.z - me.z) < 35);
  const t = near.length ? near[(Math.random() * near.length) | 0] : W.trees[(Math.random() * W.trees.length) | 0];
  L.x = t.x + (Math.random() - 0.5) * t.r * 1.6; L.z = t.z + (Math.random() - 0.5) * t.r * 1.6;
  L.y = 2.5 + Math.random() * 2.5; L.vy = -(0.35 + Math.random() * 0.3); L.ph = Math.random() * 6.28; L.spin = 1 + Math.random() * 3;
}
for (let i = 0; i < LEAVES; i++) { const L = {}; respawnLeaf(L); L.y = Math.random() * 4.5; leaves.push(L); }

const butterflies = [];
const bfColors = [0xf2c94c, 0xf2994a, 0xffffff, 0x9b51e0];
for (let i = 0; i < (lite ? 0 : 6); i++) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: bfColors[i % bfColors.length], side: THREE.DoubleSide });
  const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.06).translate(0.04, 0, 0), m);
  const wingR = wingL.clone(); wingR.scale.x = -1;
  g.add(wingL, wingR);
  scene.add(g);
  butterflies.push({ g, wingL, wingR, cx: -6 + (Math.random() - 0.5) * 18, cz: -38 + (Math.random() - 0.5) * 8, ph: Math.random() * 6.28 });
}

// ---------------------------------------------------------------- procedural soundscape
const SOUND_KEY = "world.sound";
let soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== "0"; } catch (e) { /* ignore */ }
let ac = null, master, windGain, windFilter, rustleGain, fanGain, stepBus;
const isIndoors = () => W.indoorAreas.some(([x0, z0, x1, z1]) => me.x > x0 && me.x < x1 && me.z > z0 && me.z < z1);
const inClassroom = () => me.x > -30 && me.x < -16 && me.z > -26 && me.z < -6;

function noiseBuffer(seconds = 2) {
  const b = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5 + w * 0.15; } // brown-ish noise
  return b;
}
function startAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = soundOn ? 0.9 : 0; master.connect(ac.destination);
  // wind: looping noise → band-pass → gust-modulated gain
  const nb = noiseBuffer(4);
  const src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
  windFilter = ac.createBiquadFilter(); windFilter.type = "bandpass"; windFilter.frequency.value = 500; windFilter.Q.value = 0.6;
  windGain = ac.createGain(); windGain.gain.value = 0.0;
  src.connect(windFilter).connect(windGain).connect(master); src.start();
  // leaf rustle: high-passed noise, louder in gusts and near trees
  const src2 = ac.createBufferSource(); src2.buffer = noiseBuffer(3); src2.loop = true;
  const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2600;
  rustleGain = ac.createGain(); rustleGain.gain.value = 0;
  src2.connect(hp).connect(rustleGain).connect(master); src2.start();
  // ceiling fans: low hum in Classroom 1
  const osc = ac.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 58;
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180;
  fanGain = ac.createGain(); fanGain.gain.value = 0;
  osc.connect(lp).connect(fanGain).connect(master); osc.start();
  stepBus = ac.createGain(); stepBus.gain.value = 0.5; stepBus.connect(master);
  scheduleBird();
}
// Birdsong: short frequency-swept chirps from random directions
function chirp(t, f0, f1, dur, pan, vol) {
  const o = ac.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
  if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(master); } else o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function scheduleBird() {
  if (!ac) return;
  const indoor = isIndoors();
  const t = ac.currentTime + 0.05, pan = Math.random() * 1.6 - 0.8;
  const vol = (indoor ? 0.012 : 0.05) * (0.5 + Math.random() * 0.5);
  const kind = Math.random();
  if (kind < 0.4) {            // trill
    const n = 4 + ((Math.random() * 5) | 0), base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) chirp(t + i * 0.07, base, base * 1.35, 0.05, pan, vol);
  } else if (kind < 0.75) {    // two-note whistle (like a maya / sparrow call)
    const f = 1800 + Math.random() * 900;
    chirp(t, f, f * 1.25, 0.16, pan, vol); chirp(t + 0.22, f * 1.25, f * 0.9, 0.2, pan, vol);
  } else {                     // descending call
    const f = 3800 + Math.random() * 800;
    for (let i = 0; i < 3; i++) chirp(t + i * 0.14, f - i * 400, f - i * 400 - 600, 0.11, pan, vol * 0.9);
  }
  setTimeout(scheduleBird, 900 + Math.random() * (indoor ? 6000 : 3200));
}
let stepT = 0;
function footstep(run) {
  const t = ac.currentTime;
  const b = ac.createBufferSource(); b.buffer = footstep.buf || (footstep.buf = noiseBuffer(0.25));
  const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = isIndoors() ? 900 : 650;
  const g = ac.createGain(); g.gain.setValueAtTime(run ? 0.5 : 0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  b.connect(f).connect(g).connect(stepBus); b.start(t, Math.random() * 0.1, 0.1);
}

// Sound toggle (also the first-interaction unlock that browsers require for audio)
const btn = document.createElement("button");
btn.type = "button"; btn.className = "toggle"; btn.id = "sound";
const label = () => { btn.textContent = soundOn ? "Sound: on" : "Sound: off"; btn.setAttribute("aria-pressed", String(soundOn)); };
label();
document.querySelector(".go").appendChild(btn);
btn.addEventListener("click", () => {
  soundOn = !soundOn; label();
  try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch (e) { /* ignore */ }
  startAudio();
  if (ac) { ac.resume(); master.gain.setTargetAtTime(soundOn ? 0.9 : 0, ac.currentTime, 0.1); }
});
const unlock = () => { if (soundOn) { startAudio(); ac.resume(); } removeEventListener("pointerdown", unlock); removeEventListener("keydown", unlock); };
addEventListener("pointerdown", unlock);
addEventListener("keydown", unlock);

// ---------------------------------------------------------------- per frame
const q = new THREE.Quaternion(), e3 = new THREE.Euler();
W.onEnv = (dt, t) => {
  // gusts: slow layered noise between 0 and 1
  const gust = Math.max(0, Math.min(1, 0.45 + 0.35 * Math.sin(t * 0.13) + 0.2 * Math.sin(t * 0.37 + 1.3) + 0.1 * Math.sin(t * 1.1)));
  wind.t.value = t; wind.gust.value = gust;

  // flag cloth
  for (const f of flags) {
    const pos = f.geo.attributes.position, b = f.base;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1];
      const along = (x + f.w / 2) / f.w;                       // 0 at the pole, 1 at the fly end
      pos.setZ(i, Math.sin(t * 6 - along * 7 + y * 1.5) * 0.09 * along * (0.5 + gust) );
      pos.setY(i, y - along * along * 0.05 * (1 - gust));
    }
    pos.needsUpdate = true;
    f.geo.computeVertexNormals();
  }
  // birds
  birds.forEach((b, i) => {
    const a = b.ph + t * b.sp;
    birdObj.position.set(b.cx + Math.cos(a) * b.rad, b.h + Math.sin(t * 0.7 + b.ph) * 1.2, b.cz + Math.sin(a) * b.rad);
    birdObj.rotation.set(0, -a + (b.sp > 0 ? Math.PI : 0), 0);
    birdObj.scale.setScalar(1.4);
    birdObj.updateMatrix();
    birdBody.setMatrixAt(i, birdObj.matrix);
    const flap = Math.sin(t * b.flap + b.ph) * 0.7 * (0.6 + 0.4 * Math.sin(t * 0.5 + b.ph));
    wingObj.rotation.set(0, 0, flap); wingObj.scale.set(1, 1, 1); wingObj.updateMatrix();
    birdL.setMatrixAt(i, birdM.multiplyMatrices(birdObj.matrix, wingObj.matrix));
    wingObj.rotation.set(0, 0, -flap); wingObj.scale.set(-1, 1, 1); wingObj.updateMatrix();
    birdR.setMatrixAt(i, wingM.multiplyMatrices(birdObj.matrix, wingObj.matrix));
  });
  birdBody.instanceMatrix.needsUpdate = birdL.instanceMatrix.needsUpdate = birdR.instanceMatrix.needsUpdate = true;
  // leaves
  for (let i = 0; i < LEAVES; i++) {
    const L = leaves[i];
    L.y += L.vy * dt;
    L.x += Math.sin(t * 1.3 + L.ph) * 0.4 * dt + gust * 0.6 * dt;
    L.z += Math.cos(t * 1.1 + L.ph) * 0.3 * dt;
    if (L.y < 0.03) { L.y = 0.03; L.rest = (L.rest || 0) + dt; if (L.rest > 4) { L.rest = 0; respawnLeaf(L); } }
    tmp.position.set(L.x, L.y, L.z);
    tmp.rotation.set(L.y > 0.05 ? t * L.spin + L.ph : Math.PI / 2, L.ph, L.y > 0.05 ? Math.sin(t * 2 + L.ph) : 0);
    tmp.updateMatrix();
    leafMesh.setMatrixAt(i, tmp.matrix);
  }
  if (LEAVES) leafMesh.instanceMatrix.needsUpdate = true;
  // butterflies
  for (const b of butterflies) {
    const a = t * 0.6 + b.ph;
    b.g.position.set(b.cx + Math.sin(a) * 1.8 + Math.sin(a * 2.3) * 0.5, 0.7 + Math.abs(Math.sin(a * 1.7)) * 0.6, b.cz + Math.cos(a * 0.8) * 1.2);
    b.g.rotation.y = a;
    const fl = Math.sin(t * 24 + b.ph) * 1.1;
    b.wingL.rotation.y = fl; b.wingR.rotation.y = -fl;
  }
  // audio mix follows the world
  if (ac && soundOn) {
    const indoor = isIndoors(), now = ac.currentTime;
    let nearTree = 0;
    for (const tr of W.trees) { const d = Math.hypot(tr.x - me.x, tr.z - me.z); if (d < 12) nearTree = Math.max(nearTree, 1 - d / 12); }
    windGain.gain.setTargetAtTime((indoor ? 0.05 : 0.14) * (0.3 + gust), now, 0.3);
    windFilter.frequency.setTargetAtTime(indoor ? 260 : 380 + gust * 420, now, 0.3);
    rustleGain.gain.setTargetAtTime(indoor ? 0 : 0.035 * nearTree * (0.2 + gust), now, 0.3);
    fanGain.gain.setTargetAtTime(inClassroom() ? 0.025 : 0, now, 0.5);
    const moving = (me.speed || 0) > 0.3 && !me.air;
    if (moving) {
      const run = me.speed > 3;
      stepT += dt * (run ? 2.9 : 1.85);
      if (stepT >= 1) { stepT = 0; footstep(run); }
    } else stepT = 0.6;
  }
};
