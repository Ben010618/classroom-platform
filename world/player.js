// ============================================================================================
// PLAYER (RPG mode) — third-person HD character with real physics.
// Physics: Rapier (Apache-2.0, dimforge) kinematic character controller — gravity, jumping,
// auto-stepping up stairs, sliding along walls. Falls back to simple collision if Rapier fails.
// Runs on medium/high devices; low devices keep the first-person walker in index.html.
// ============================================================================================
const W = await new Promise(ok => window.__world ? ok(window.__world) : window.addEventListener("world-ready", () => ok(window.__world), { once: true }));
const { THREE, scene, camera, me } = W;

if (W.device.tier !== "low" && !W.simple && window.Characters) {
  try { await start(); } catch (e) { console.warn("RPG mode unavailable, staying in first person:", e); }
}

async function start() {
  const status = document.getElementById("loadhint");
  if (status) status.textContent = "Loading characters…";
  await window.Characters.load(THREE, "assets/characters/", W.build);
  window.dispatchEvent(new Event("characters-ready"));
  let RAPIER = null;
  try {
    RAPIER = (await import("https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.19.3/rapier.mjs")).default;
    await RAPIER.init();
  } catch (e) { console.warn("Rapier failed to load; using simple collision", e); }
  if (status) status.textContent = "";

  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } } };
  let look = { ...window.Avatars.DEFAULT_LOOK, ...store.get("world.look", {}), name: "" };
  W.myLook = () => look;
  let self = window.Characters.create(THREE, look, { noTag: true });
  scene.add(self);

  // ---------- physics world
  const FEET_TO_CENTER = 0.83;   // capsule: half-height 0.55 + radius 0.28
  let world = null, body = null, collider = null, kcc = null;
  if (RAPIER) {
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(80, 0.1, 80).setTranslation(0, -0.1, 0));
    const runtime = new Set(W.blockers.values());   // added below, so they can be removed again
    for (const c of W.colliders) {
      if (runtime.has(c)) continue;
      const [x0, z0, x1, z1, y0 = 0, y1 = 3.6] = c;
      if (y1 - y0 < 0.02) continue;
      world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    }
    // stairs: tilted boxes whose top surface runs from (x0, y0) to (x1, y1)
    for (const r of W.ramps || []) {
      const dx = r.x1 - r.x0, dy = r.y1 - r.y0, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), t = 0.1;
      const cx = (r.x0 + r.x1) / 2 + Math.sin(ang) * t, cy = (r.y0 + r.y1) / 2 - Math.cos(ang) * t;
      world.createCollider(RAPIER.ColliderDesc.cuboid(len / 2, t, (r.z1 - r.z0) / 2)
        .setTranslation(cx, cy, (r.z0 + r.z1) / 2)
        .setRotation({ x: 0, y: 0, z: Math.sin(ang / 2), w: Math.cos(ang / 2) }));
    }
    // runtime blockers (closed doors): mirror W.setBlocker into the physics world
    const dyn = new Map();
    const addBox = ([x0, z0, x1, z1, y0 = 0, y1 = 3.6]) => world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    W.onBlockers = (id, b) => {
      if (dyn.has(id)) { world.removeCollider(dyn.get(id), true); dyn.delete(id); }
      if (b) dyn.set(id, addBox(b));
    };
    for (const [id, b] of W.blockers) W.onBlockers(id, b);
    body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(me.x, FEET_TO_CENTER, me.z));
    collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.28), body);
    kcc = world.createCharacterController(0.02);
    kcc.enableAutostep(0.32, 0.18, true);     // climb steps up to 32 cm (stage stairs are 25 cm)
    kcc.enableSnapToGround(0.35);
    kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    kcc.setApplyImpulsesToDynamicBodies(false);
  }

  // ---------- state
  me.y = 0; me.vy = 0; me.face = me.yaw; me.speed = 0; me.air = false; me.sitting = false;
  let thirdPerson = true, running = false, lastX = me.x, lastZ = me.z, camDist = 3.4, grounded = true;
  W.localHand = false;
  const keys = W.keys, moveVec = W.moveVec;

  function teleportBody() {
    me.vy = 0; me.y = W.groundAt ? W.groundAt(me.x, me.z) : 0;
    if (body) body.setTranslation({ x: me.x, y: me.y + FEET_TO_CENTER, z: me.z }, true);
    lastX = me.x; lastZ = me.z;
  }

  const nearestSeat = (max = 1.3) => {
    let best = null, bd = max;
    for (const s of W.seats) { const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  function toggleSit() {
    if (me.locked) return;
    if (me.sitting) { me.sitting = false; return; }
    const s = nearestSeat();
    if (!s) { toast("Walk up to a chair to sit down"); return; }
    me.x = s.x; me.z = s.z; me.face = s.yaw; me.sitting = true; teleportBody();
  }
  function jump() { if (grounded && !me.sitting && !me.locked) { me.vy = 4.8; grounded = false; } }
  function toggleHand() {
    const mpBtn = document.getElementById("mp-hand");
    if (mpBtn && !mpBtn.hidden && !document.getElementById("mp-bar").hidden) mpBtn.click();
    else W.localHand = !W.localHand;
  }
  const toast = text => W.toast(window.I18N ? window.I18N.t(text) : text, 2500);

  // Emotes: played on your character and sent to everyone in the class (multiplayer.js reads W.localEmote)
  const EMOTE_KEYS = ["wave", "clap", "cheer", "nod", "dance"];
  let emoteCount = 0;
  function emote(name) {
    if (me.sitting && name === "dance") return;
    self.userData.emote(name);
    W.localEmote = { name, n: ++emoteCount };
  }
  W.emote = emote;

  addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.code === "Space") { jump(); e.preventDefault(); }
    if (e.code === "KeyC") toggleSit();
    if (e.code === "KeyH") toggleHand();
    if (e.code === "KeyV") toggleView();
    if (e.code === "KeyR") running = !running;
    const n = /^Digit([1-5])$/.exec(e.code);
    if (n) emote(EMOTE_KEYS[+n[1] - 1]);
  });

  // ---------- on-screen action buttons, folded behind one "Actions" button
  // (open by default on touch devices, closed on computers where the keys do the same; remembered per device)
  const pad = document.createElement("div");
  pad.id = "rpg-actions";
  const padBtn = document.createElement("button");
  padBtn.type = "button"; padBtn.id = "rpg-toggle"; padBtn.className = "icon-btn";
  padBtn.setAttribute("aria-controls", "rpg-actions");
  padBtn.innerHTML = "🎮 <span>Actions</span>";
  document.body.appendChild(padBtn);
  const setPadOpen = open => {
    pad.hidden = !open;
    padBtn.setAttribute("aria-expanded", String(open));
    padBtn.title = window.I18N ? window.I18N.t(open ? "Hide action buttons" : "Show action buttons") : open ? "Hide action buttons" : "Show action buttons";
  };
  let padOpen = W.device.touch;
  try { const saved = localStorage.getItem("world.actions"); if (saved !== null) padOpen = saved === "1"; } catch (e) {}
  setPadOpen(padOpen);
  padBtn.addEventListener("click", () => {
    setPadOpen(pad.hidden);
    try { localStorage.setItem("world.actions", pad.hidden ? "0" : "1"); } catch (e) {}
  });
  pad.innerHTML = `
    <button type="button" data-a="jump" aria-label="Jump">⤒<small>Jump</small></button>
    <button type="button" data-a="run" aria-label="Run" aria-pressed="false">»<small>Run</small></button>
    <button type="button" data-a="hand" aria-label="Raise hand">✋<small>Hand</small></button>
    <button type="button" data-a="sit" aria-label="Sit or stand">⌂<small>Sit</small></button>
    <button type="button" data-a="emote" aria-label="Emotes" aria-expanded="false">☺<small>Emote</small></button>
    <button type="button" data-a="view" aria-label="Switch camera">◎<small>View</small></button>
    <div id="emote-menu" class="card" hidden>
      <button type="button" data-e="wave">👋<small>Wave</small></button>
      <button type="button" data-e="clap">👏<small>Clap</small></button>
      <button type="button" data-e="cheer">🙌<small>Cheer</small></button>
      <button type="button" data-e="nod">🙂<small>Nod</small></button>
      <button type="button" data-e="dance">💃<small>Dance</small></button>
    </div>`;
  document.body.appendChild(pad);
  if (window.I18N) { window.I18N.apply(pad); window.I18N.apply(padBtn); }
  pad.addEventListener("pointerdown", e => e.stopPropagation());
  const emoteMenu = pad.querySelector("#emote-menu"), emoteBtn = pad.querySelector('[data-a="emote"]');
  pad.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b && b.dataset.e) { emote(b.dataset.e); emoteMenu.hidden = true; emoteBtn.setAttribute("aria-expanded", "false"); return; }
    const a = b?.dataset.a;
    if (a === "emote") { emoteMenu.hidden = !emoteMenu.hidden; emoteBtn.setAttribute("aria-expanded", String(!emoteMenu.hidden)); }
    if (a === "jump") jump();
    if (a === "run") { running = !running; e.target.closest("button").setAttribute("aria-pressed", String(running)); }
    if (a === "hand") toggleHand();
    if (a === "sit") toggleSit();
    if (a === "view") toggleView();
  });
  if (!W.device.touch) pad.classList.add("compact");
  const ring = document.createElement("div");
  ring.id = "rpg-ring";
  if (W.device.touch) document.body.appendChild(ring);
  const help = document.querySelector(".help");
  const fil = window.I18N && window.I18N.lang === "fil";
  if (help) help.innerHTML = W.device.touch
    ? (fil ? "Kaliwang hinlalaki: gumalaw · kanan: tumingin · mga button: talon, takbo, kamay, upo, emote, tanaw"
      : "Left thumb: move · right thumb: look · buttons: jump, run, raise hand, sit, emotes, camera")
    : fil
      ? "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> gumalaw · i-drag para tumingin · <kbd>Shift</kbd>/<kbd>R</kbd> takbo · <kbd>Space</kbd> talon · <kbd>C</kbd> upo · <kbd>H</kbd> magtaas ng kamay · <kbd>V</kbd> tanaw · <kbd>E</kbd> gamitin / kausapin · <kbd>1</kbd>–<kbd>5</kbd> kaway, palakpak, hiyaw, tango, sayaw · <kbd>M</kbd> menu · <kbd>G</kbd> pumunta · <kbd>J</kbd> gawain"
      : "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · drag to look · <kbd>Shift</kbd>/<kbd>R</kbd> run · <kbd>Space</kbd> jump · <kbd>C</kbd> sit · <kbd>H</kbd> raise hand · <kbd>V</kbd> camera · <kbd>E</kbd> use / talk · <kbd>1</kbd>–<kbd>5</kbd> wave, clap, cheer, nod, dance · <kbd>M</kbd> menu · <kbd>G</kbd> go to · <kbd>J</kbd> tasks";

  function toggleView() {
    thirdPerson = !thirdPerson;
    self.visible = thirdPerson;
    toast(thirdPerson ? "Third-person view" : "First-person view");
  }

  // ---------- camera: orbit behind the character, pulled in so it never passes through walls
  const target = new THREE.Vector3(), camPos = new THREE.Vector3(), probe = new THREE.Vector3();
  const insideSolid = (p) => {
    if (p.y < 0.15) return true;
    for (const [x0, z0, x1, z1, y0 = 0, y1 = 3.6] of W.colliders) if (p.x > x0 - 0.12 && p.x < x1 + 0.12 && p.z > z0 - 0.12 && p.z < z1 + 0.12 && p.y > y0 && p.y < y1 + 0.1) return true;
    return false;
  };
  const indoors = (x, z) => W.indoorAreas.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  function placeCamera(dt) {
    if (!thirdPerson) {
      camera.position.set(me.x, me.y + (me.sitting ? 1.15 : 1.6), me.z);
      camera.rotation.set(me.pitch, me.yaw, 0, "YXZ");
      return;
    }
    const pitch = Math.max(-0.9, Math.min(0.5, me.pitch - 0.18));
    target.set(me.x, me.y + (me.sitting ? 1.15 : 1.55), me.z);
    const fx = -Math.sin(me.yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(me.yaw) * Math.cos(pitch);
    const targetIndoors = indoors(me.x, me.z);
    let want = targetIndoors ? 2.6 : 3.6;
    let d = 0.4;
    for (; d < want; d += 0.12) {
      probe.set(target.x - fx * d, target.y - fy * d, target.z - fz * d);
      const pIn = indoors(probe.x, probe.z);
      // never let the camera cross a wall, window or door between inside and outside
      if (insideSolid(probe) || pIn !== targetIndoors || (pIn && probe.y > 3.35)) break;
    }
    camDist += (Math.max(0.5, d - 0.15) - camDist) * Math.min(1, dt * (d < camDist ? 18 : 4));
    camPos.set(target.x - fx * camDist, target.y - fy * camDist, target.z - fz * camDist);
    camera.position.copy(camPos);
    camera.lookAt(target);
  }

  // ---------- per-frame update (called by index.html instead of the first-person walker)
  const dirV = new THREE.Vector3();
  W.player = {
    active: true,
    get running() { return running; },
    get self() { return self; },
    update(dt) {
      // external teleports (go-to buttons, teacher Gather)
      if (Math.abs(me.x - lastX) > 0.8 || Math.abs(me.z - lastZ) > 0.8) { teleportBody(); if (!me.locked) me.sitting = false; }
      if (me.locked && !me.sitting) me.sitting = true;

      // input → desired horizontal velocity, relative to the camera
      let f = 0, s = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) s -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) s += 1;
      f -= moveVec.y; s += moveVec.x;
      let mag = Math.min(1, Math.hypot(f, s));
      if (mag > 0.05 && me.sitting && !me.locked) me.sitting = false;     // moving stands you up
      if (me.sitting || me.locked) mag = 0;
      const run = running || keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(moveVec.x, moveVec.y) > 0.95;
      const speed = mag * (run ? 5.6 : 2.0);
      let vx = 0, vz = 0;
      if (mag > 0.05) {
        const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
        dirV.set(fx * f + rx * s, 0, fz * f + rz * s).normalize();
        vx = dirV.x * speed; vz = dirV.z * speed;
        const targetFace = Math.atan2(-dirV.x, -dirV.z);
        let dy = targetFace - me.face; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        me.face += dy * Math.min(1, dt * 12);
      }

      me.vy = grounded && me.vy <= 0 ? -1.5 : me.vy - 9.81 * dt * 1.25;
      if (body && kcc) {
        kcc.computeColliderMovement(collider, { x: vx * dt, y: me.vy * dt, z: vz * dt });
        const m = kcc.computedMovement();
        grounded = kcc.computedGrounded();
        const p = body.translation();
        const next = { x: p.x + m.x, y: Math.max(FEET_TO_CENTER - 0.01, p.y + m.y), z: p.z + m.z };
        body.setNextKinematicTranslation(next);
        world.step();
        me.x = next.x; me.z = next.z; me.y = next.y - FEET_TO_CENTER;
        if (grounded && me.vy < 0) me.vy = 0;
      } else {
        const [nx, nz] = W.collide(me.x + vx * dt, me.z + vz * dt);
        me.x = nx; me.z = nz;
        me.y = Math.max(0, me.y + me.vy * dt);
        grounded = me.y <= 0.001;
        if (grounded) me.vy = Math.max(0, me.vy);
      }
      lastX = me.x; lastZ = me.z;
      me.speed = Math.hypot(vx, vz); me.air = !grounded && me.y > 0.08;

      self.position.set(me.x, me.y, me.z);
      self.rotation.y = me.face;
      self.userData.setMove(me.speed, me.air);
      self.userData.setSitting(me.sitting || me.locked);
      self.userData.setHand(!!W.localHand);
      self.userData.tick(dt);
      placeCamera(dt);
    },
    // rebuild the local character after the appearance editor changes it
    setLook(newLook) {
      look = { ...look, ...newLook, name: "" };
      const vis = self.visible;
      scene.remove(self);
      self = window.Characters.create(THREE, look, { noTag: true });
      self.visible = vis;
      scene.add(self);
    }
  };
  teleportBody();
  toast(RAPIER ? "RPG mode: third-person with physics" : "RPG mode: third-person");
}
