// ============================================================================================
// MULTIPLAYER (demo) — serverless peer-to-peer rooms with Trystero (WebRTC; signalling over public
// Nostr relays). Avatars, spatial voice, hand raise and basic teacher commands.
// Good for a demo of up to ~8 people. The real classroom (35 learners, server-enforced
// permissions) is the Hubs deployment (deploy/README.md).
// ============================================================================================
import { joinRoom, selfId } from "https://cdn.jsdelivr.net/npm/trystero@0.25.4/nostr/+esm";

const APP_ID = "katuro-university-v1";
const SEND_HZ = 10;
const W = await waitForWorld();
const { THREE, scene, camera, me } = W;
const A = window.Avatars;

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};

// ---------------------------------------------------------------- join panel + appearance editor
const look = { ...A.DEFAULT_LOOK, ...store.get("world.look", {}) };
const panel = $("mp-panel");
const fill = (sel, entries, value) => {
  sel.innerHTML = "";
  for (const [k, label] of entries) {
    const o = document.createElement("option");
    o.value = k; o.textContent = label; o.selected = k === value;
    sel.appendChild(o);
  }
};
$("mp-name").value = look.name || "";
$("mp-room").value = store.get("world.room", "katuro");
fill($("mp-outfit"), Object.entries(A.OUTFITS).map(([k, v]) => [k, v.label]), look.outfit);
fill($("mp-hair"), Object.entries(A.HAIR_STYLES), look.hair);
const swatches = (el, palette, key) => {
  el.innerHTML = "";
  for (const [k, hex] of Object.entries(palette)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch"; b.style.background = hex;
    b.setAttribute("aria-label", key + " " + k);
    b.setAttribute("aria-pressed", String(look[key] === k));
    b.addEventListener("click", () => {
      look[key] = k;
      el.querySelectorAll(".swatch").forEach(s => s.setAttribute("aria-pressed", String(s === b)));
      refreshPreview();
    });
    el.appendChild(b);
  }
};
swatches($("mp-skin"), A.SKIN, "skin");
swatches($("mp-haircolor"), A.HAIR_COLOR, "hairColor");
$("mp-outfit").addEventListener("change", e => { look.outfit = e.target.value; refreshPreview(); });
$("mp-hair").addEventListener("change", e => { look.hair = e.target.value; refreshPreview(); });

// small live preview of your own avatar
const pv = $("mp-preview");
const pvRenderer = new THREE.WebGLRenderer({ canvas: pv, antialias: true, alpha: true });
pvRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
pvRenderer.outputEncoding = THREE.sRGBEncoding;
const pvScene = new THREE.Scene();
pvScene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.1));
const pvSun = new THREE.DirectionalLight(0xffffff, 0.8); pvSun.position.set(1, 2, -2); pvScene.add(pvSun);
const pvCam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
pvCam.position.set(0, 1.25, -3.6); pvCam.lookAt(0, 1.0, 0);
let pvAvatar = null;
function refreshPreview() {
  if (pvAvatar) pvScene.remove(pvAvatar);
  pvAvatar = A.buildAvatar(THREE, look, { noTag: true });
  pvScene.add(pvAvatar);
}
refreshPreview();
let pvSpin = 0;
function drawPreview() {
  if (!panel.hidden) {
    const r = pv.getBoundingClientRect();
    pvRenderer.setSize(r.width, r.height, false);
    pvCam.aspect = r.width / r.height; pvCam.updateProjectionMatrix();
    pvSpin += 0.01; pvAvatar.rotation.y = Math.PI + Math.sin(pvSpin) * 0.6;
    pvRenderer.render(pvScene, pvCam);
  }
  requestAnimationFrame(drawPreview);
}
drawPreview();

$("mp-open").addEventListener("click", () => { panel.hidden = false; });
$("mp-close").addEventListener("click", () => { panel.hidden = true; });

// ---------------------------------------------------------------- session state
let room = null, role = "learner", micStream = null, muted = false, handUp = false, audioCtx = null;
const peers = new Map(); // peerId → { avatar, look, role, pose, target, hand, panner, gain, analyser, audioEl }
const handQueue = [];    // teacher view: [{ id, name, since }]
W.peers = peers;       // for debugging and tests

const status = text => { $("mp-status").textContent = text; };
const toast = text => {
  const t = $("mp-toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
};

$("mp-join").addEventListener("click", join);
$("mp-leave").addEventListener("click", leave);
$("mp-mic").addEventListener("click", () => setMuted(!muted));
$("mp-hand").addEventListener("click", () => {
  handUp = !handUp;
  $("mp-hand").setAttribute("aria-pressed", String(handUp));
  $("mp-hand").textContent = handUp ? "Lower hand" : "Raise hand";
  sendPose(true);
});

async function join() {
  look.name = ($("mp-name").value || "").trim().slice(0, 24) || "Guest";
  const code = ($("mp-room").value || "katuro").trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "katuro";
  role = $("mp-teacher").checked ? "teacher" : "learner";
  store.set("world.look", look);
  store.set("world.room", code);
  panel.hidden = true;
  status("Connecting…");
  $("mp-bar").hidden = false;
  $("mp-open").hidden = true;
  $("mp-teacher-panel").hidden = role !== "teacher";
  $("mp-hand").hidden = role === "teacher";

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if ($("mp-usemic").checked) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      toast("Microphone not available — you can still listen.");
    }
  }
  setMuted(!micStream);

  room = joinRoom({ appId: APP_ID }, code);
  const [sendHello, onHello] = act("hello");
  const [sendPoseRaw, onPose] = act("pose");
  const [sendCmd, onCmd] = act("cmd");
  W.sendCmd = sendCmd;
  W.sendPoseRaw = sendPoseRaw;
  W.sendHello = sendHello;

  room.onPeerJoin = id => {
    sendHello({ look, role }, id);
    if (micStream) room.addStream(micStream, { target: id });
    updateCount();
  };
  room.onPeerLeave = id => {
    const p = peers.get(id);
    if (p) {
      scene.remove(p.avatar);
      if (p.audioEl) p.audioEl.srcObject = null;
      toast(`${p.look.name} left`);
    }
    peers.delete(id);
    removeHand(id);
    updateCount();
  };
  onHello((data, id) => {
    const existing = peers.get(id);
    if (existing) scene.remove(existing.avatar);
    const avatar = A.buildAvatar(THREE, data.look, { role: data.role });
    scene.add(avatar);
    peers.set(id, { ...(existing || {}), avatar, look: data.look, role: data.role, pose: existing?.pose || { x: 0, z: 64, yaw: 0 }, target: existing?.target || { x: 0, z: 64, yaw: 0 } });
    if (!existing) toast(`${data.look.name} joined${data.role === "teacher" ? " (teacher)" : ""}`);
    updateCount();
  });
  onPose((p, id) => {
    const peer = peers.get(id);
    if (!peer) return;
    peer.target = p;
    if (peer.hand !== p.hand) {
      peer.hand = p.hand;
      peer.avatar.userData.setHand(p.hand);
      if (role === "teacher") p.hand ? addHand(id, peer.look.name) : removeHand(id);
    }
    peer.muted = p.muted;
    peer.avatar.userData.setSitting(!!p.sit);
  });
  onCmd((c, id) => {
    const sender = peers.get(id);
    if (!sender || sender.role !== "teacher" || role === "teacher") return; // demo: roles are self-declared
    if (c.type === "mute") { setMuted(true); toast(`${sender.look.name} muted everyone`); }
    if (c.type === "gather") {
      const seat = c.seats && c.seats[selfId];
      const front = W.places.podiumFront;
      const target = seat != null ? W.seats[seat] : { x: front.x + (Math.random() - 0.5) * 4, z: front.z + Math.random() * 1.2, yaw: front.yaw };
      if (target) { me.locked = false; me.x = target.x; me.z = target.z; me.yaw = target.yaw; me.pitch = -0.04; }
      if (c.lock) me.locked = true;
      toast(seat != null ? `${sender.look.name} asked everyone to sit down` : `${sender.look.name} called everyone to the front`);
    }
    if (c.type === "lock") { me.locked = !!c.on; toast(c.on ? "Your seat is locked by the teacher" : "You can move again"); }
  });
  room.onPeerStream = (stream, id) => attachVoice(stream, id);

  sendHello({ look, role });
  W.onTick = tick;
  status(`Connected to "${code}" · waiting for others`);
}

function act(name) {
  const a = room.makeAction(name);
  const send = (data, target) => a.send(data, target ? { target } : undefined);
  const on = fn => { a.onMessage = (data, meta) => fn(data, meta && meta.peerId ? meta.peerId : meta); };
  return [send, on];
}

function leave() {
  if (room) room.leave();
  room = null;
  for (const p of peers.values()) { scene.remove(p.avatar); if (p.audioEl) p.audioEl.srcObject = null; }
  peers.clear();
  handQueue.length = 0; renderHands();
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  micStream = null;
  if (audioCtx) audioCtx.close();
  audioCtx = null;
  me.locked = false;
  W.onTick = null;
  $("mp-bar").hidden = true;
  $("mp-teacher-panel").hidden = true;
  $("mp-open").hidden = false;
}

function setMuted(m) {
  muted = m || !micStream;
  if (micStream) micStream.getAudioTracks().forEach(t => { t.enabled = !muted; });
  $("mp-mic").textContent = !micStream ? "No mic" : muted ? "Unmute" : "Mute";
  $("mp-mic").setAttribute("aria-pressed", String(!muted));
  $("mp-mic").disabled = !micStream;
}

function updateCount() {
  const n = peers.size + 1;
  status(n === 1 ? "Connected · waiting for others" : `${n} people in the school`);
}

// ---------------------------------------------------------------- spatial voice
function attachVoice(stream, id) {
  if (!audioCtx) return;
  const peer = peers.get(id) || {};
  // Chrome only plays remote WebRTC audio through WebAudio if the stream is also attached to a media element
  const el = new Audio();
  el.muted = true; el.srcObject = stream; el.play().catch(() => {});
  const src = audioCtx.createMediaStreamSource(stream);
  const panner = audioCtx.createPanner();
  panner.panningModel = "equalpower";
  panner.distanceModel = "inverse";
  panner.refDistance = 1.5; panner.rolloffFactor = 1.3; panner.maxDistance = 60;
  const gain = audioCtx.createGain();
  const analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
  src.connect(analyser);
  src.connect(gain).connect(panner).connect(audioCtx.destination);
  peers.set(id, { ...peer, audioEl: el, panner, gain, analyser, level: new Uint8Array(128) });
}

const inPod = (x, z) => (W.pods || []).find(p => Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) || null;
const onPodium = (x, z) => Math.hypot(x - W.places.podium.x, z - W.places.podium.z) < 2.2;

// ---------------------------------------------------------------- per-frame
let sendTimer = 0;
let lastSent = "";
function sendPose(force) {
  if (!W.sendPoseRaw) return;
  const p = { x: +me.x.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), hand: handUp, muted, sit: !!me.locked };
  const key = JSON.stringify(p);
  if (force || key !== lastSent) { W.sendPoseRaw(p); lastSent = key; }
}

function tick(dt) {
  sendTimer += dt;
  if (sendTimer > 1 / SEND_HZ) { sendTimer = 0; sendPose(false); }
  if (audioCtx) {
    const l = audioCtx.listener;
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    if (l.positionX) { l.positionX.value = me.x; l.positionY.value = 1.6; l.positionZ.value = me.z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else { l.setPosition(me.x, 1.6, me.z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
  }
  const myPod = inPod(me.x, me.z);
  for (const p of peers.values()) {
    if (!p.avatar || !p.target) continue;
    const k = Math.min(1, dt * 8);
    p.pose = p.pose || { ...p.target };
    p.pose.x += (p.target.x - p.pose.x) * k;
    p.pose.z += (p.target.z - p.pose.z) * k;
    let dy = p.target.yaw - p.pose.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    p.pose.yaw += dy * k;
    p.avatar.position.set(p.pose.x, 0, p.pose.z);
    p.avatar.rotation.y = p.pose.yaw;
    p.avatar.userData.tick(dt);
    if (p.panner) {
      p.panner.positionX ? (p.panner.positionX.value = p.pose.x, p.panner.positionY.value = 1.6, p.panner.positionZ.value = p.pose.z) : p.panner.setPosition(p.pose.x, 1.6, p.pose.z);
      // Megaphone: a teacher on the podium is heard everywhere. Pods: groups don't hear each other.
      const megaphone = p.role === "teacher" && onPodium(p.pose.x, p.pose.z);
      p.panner.refDistance = megaphone ? 60 : 1.5;
      const theirPod = inPod(p.pose.x, p.pose.z);
      p.gain.gain.value = p.muted ? 0 : (myPod || theirPod) && myPod !== theirPod && !megaphone ? 0.08 : 1;
      p.analyser.getByteTimeDomainData(p.level);
      let peak = 0; for (const v of p.level) peak = Math.max(peak, Math.abs(v - 128));
      p.avatar.userData.setTalking(p.muted ? 0 : Math.max(0, peak - 6) / 40);
    }
  }
}

// ---------------------------------------------------------------- teacher panel
function addHand(id, name) { if (!handQueue.find(h => h.id === id)) handQueue.push({ id, name, since: Date.now() }); renderHands(); }
function removeHand(id) { const i = handQueue.findIndex(h => h.id === id); if (i >= 0) handQueue.splice(i, 1); renderHands(); }
function renderHands() {
  const ol = $("mp-hands");
  ol.innerHTML = "";
  if (!handQueue.length) { ol.innerHTML = "<li class=\"muted\">No raised hands</li>"; return; }
  handQueue.forEach(h => { const li = document.createElement("li"); li.textContent = h.name; ol.appendChild(li); });
}
renderHands();
const learners = () => [...peers.entries()].filter(([, p]) => p.role !== "teacher").map(([id]) => id).sort();
$("mp-t-mute").addEventListener("click", () => { W.sendCmd && W.sendCmd({ type: "mute" }); toast("Everyone is muted"); });
$("mp-t-seats").addEventListener("click", () => {
  const seats = {}; learners().forEach((id, i) => { if (i < W.seats.length) seats[id] = i; });
  W.sendCmd && W.sendCmd({ type: "gather", seats, lock: $("mp-t-lockafter").checked });
  toast("Learners sent to their seats");
});
$("mp-t-front").addEventListener("click", () => { W.sendCmd && W.sendCmd({ type: "gather", seats: {} }); toast("Learners called to the front"); });
$("mp-t-unlock").addEventListener("click", () => { W.sendCmd && W.sendCmd({ type: "lock", on: false }); toast("Learners can move again"); });

function waitForWorld() {
  return new Promise(ok => {
    if (window.__world) return ok(window.__world);
    window.addEventListener("world-ready", () => ok(window.__world), { once: true });
  });
}
