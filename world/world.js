"use strict";
// ============================================================================================
// WORLD DEFINITION — shared by the walkable preview and the Hubs scene export (export.mjs).
// Units: metres. +Y up. The classroom board is on the north wall (−Z); learners face −Z.
// buildWorld() returns { scene, colliders, places } and never touches the DOM, so it also runs in Node (export.mjs).
// ============================================================================================
// opts.realFurniture: skip the box desks/chairs/teacher table and return `props` placements instead,
// so the caller can drop in real models (the preview does; the Hubs export keeps the box versions for now).
(typeof window !== "undefined" ? window : globalThis).buildWorld = function buildWorld(THREE, opts = {}) {
  const realFurniture = !!opts.realFurniture;
  const props = []; // { kind, x, y, z, ry }
  const ramps = []; // { x0, x1, z0, z1, y0, y1 }: hidden slopes over stairs, rising toward +x (physics only)
  const trees = []; // { x, z, r } for soft ground shadows in the preview
  const signs = []; // { lines | flag, x, y, z, ry, w, h, bg, fg } — painted as panels by the preview
  const doors = []; // { x, z, w, h, axis: "x" | "z" }: door openings that get a swinging door leaf in the preview
  const spots = {}; // name → { x, y, z, r, ...}: things you can use with E in the preview (board, shelf, bell, …)
  const areas = []; // { x0, z0, x1, z1, label, indoor }: named areas, first match wins (preview HUD, mini-map, tasks)
  const map = [];   // { x0, z0, x1, z1, kind }: footprints drawn on the mini-map (building, path, court, garden, plaza)
  const scene = new THREE.Scene();
  scene.name = "KaturoUniversity";
  const colliders = []; // axis-aligned boxes: [x0, z0, x1, z1, y0, y1] (the simple walker uses only x/z)

  // ---------- palette (one material per colour → one draw call per colour after merging)
  const M = {};
  const mat = (name, color, opts = {}) => {
    M[name] = new THREE.MeshStandardMaterial({ name, color, roughness: 0.92, metalness: 0, ...opts });
    M[name].color.convertSRGBToLinear(); // authored as sRGB hex; glTF baseColorFactor is linear
  };
  mat("grass", 0x6f9f52);
  mat("grassDark", 0x5c8a45);
  mat("concrete", 0xbcb8ae);
  mat("path", 0xa99f8a);
  mat("wall", 0xf1e4c3);          // pale yellow school walls
  mat("trim", 0x2f6b4f);          // green trim, doors, roof edges
  mat("roof", 0x3f5d4c);
  mat("floor", 0xd6d0c2);         // classroom tiles
  mat("ceiling", 0xf4f1ea);
  mat("wood", 0xb07a46);          // desks
  mat("metal", 0x4b5a63);         // chair frames, posts, fence
  mat("board", 0x1f3d2c);         // chalkboard
  mat("glass", 0x6f8fa3, { roughness: 0.25 });
  mat("trunk", 0x6b4a2f);
  mat("leaf", 0x3a7234);
  mat("leaf2", 0x4f8a3c);
  mat("court", 0x2f6f8f);         // court floor
  mat("courtLine", 0xf3efe6);
  mat("flag", 0xf3efe6);
  mat("podium", 0x8a5a33);
  mat("pod", 0xd9a35a);           // breakout pod tables
  mat("marker", 0xffffff, { roughness: 1 });
  mat("lamp", 0xffffff, { emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.5 });   // fluorescent tubes
  mat("cork", 0xb98b5a);           // bulletin boards
  mat("paperA", 0xf6e27a);
  mat("paperB", 0x9fd3f0);
  mat("paperC", 0xf2a7a0);
  mat("clockFace", 0xf7f5ef);
  mat("dark", 0x26292b);
  mat("pot", 0xb5603b);            // terracotta plant pots
  mat("soil", 0x5a3d2b);
  mat("plant", 0x4f9a3a);
  mat("binGreen", 0x2e8b57);       // biodegradable
  mat("binBlue", 0x2f6fb3);        // recyclable
  mat("binRed", 0xc0392b);         // residual
  // New things reuse existing colours: every material is one more draw call on every frame
  const ALIAS = {};
  const alias = (name, existing) => { ALIAS[name] = existing; };
  alias("ceramic", "clockFace");   // toilets, sinks
  alias("tomato", "binRed");
  alias("eggplant", "dark");
  alias("labTop", "dark");
  alias("screenOn", "lamp");       // computer monitors glow
  alias("ball", "pot");
  alias("brass", "paperA");
  alias("waterBlue", "paperB");

  // Texture tiling (metres per texture repeat) for surfaces that get real textures in the preview.
  const TILE = { leaf: 2, leaf2: 2, floor: 1.2, wall: 2.4, ceiling: 2.4, roof: 2.5, concrete: 3, path: 3, grass: 5, grassDark: 5, court: 4, wood: 1.2, podium: 1.2, pod: 1.2 };

  // ---------- geometry buckets, merged per material at the end
  const buckets = {};
  // Box-project UVs from world position, so textures keep real-world scale on every face.
  function worldUV(g, tile) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    if (!uv) return;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      const x = p.getX(i) / tile, y = p.getY(i) / tile, z = p.getZ(i) / tile;
      if (ay >= ax && ay >= az) uv.setXY(i, x, z);
      else if (ax >= az) uv.setXY(i, z, y);
      else uv.setXY(i, x, y);
    }
    uv.needsUpdate = true;
  }
  const tmp = new THREE.Object3D();
  function put(matName, geo, x, y, z, ry = 0, rx = 0, rz = 0) {
    matName = ALIAS[matName] || matName;
    let g = geo.index ? geo.toNonIndexed() : geo;
    tmp.position.set(x, y, z);
    tmp.rotation.set(rx, ry, rz);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    g.applyMatrix4(tmp.matrix);
    if (TILE[matName]) worldUV(g, TILE[matName]);
    (buckets[matName] = buckets[matName] || []).push(g);
  }
  // box with its BOTTOM at y
  function box(m, x, y, z, w, h, d, ry = 0, collide = false) {
    put(m, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry);
    if (collide) colliders.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2, y, y + h]);
  }
  function cyl(m, x, y, z, r, h, seg = 8, rTop = r) {
    put(m, new THREE.CylinderGeometry(rTop, r, h, seg), x, y + h / 2, z);
  }

  // A wall along X (constant z) from x0..x1 with openings [{a, b, y0, y1}] (x-range, y-range)
  function wallX(m, z, x0, x1, h, t, openings = [], collide = true) {
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    let x = x0;
    for (const o of ops) {
      if (o.a > x) box(m, (x + o.a) / 2, 0, z, o.a - x, h, t, 0, collide);
      if (o.y0 > 0) box(m, (o.a + o.b) / 2, 0, z, o.b - o.a, o.y0, t, 0, collide && o.y0 > 0.5);
      if (o.y1 < h) box(m, (o.a + o.b) / 2, o.y1, z, o.b - o.a, h - o.y1, t);
      x = o.b;
    }
    if (x < x1) box(m, (x + x1) / 2, 0, z, x1 - x, h, t, 0, collide);
  }
  // A wall along Z (constant x)
  function wallZ(m, x, z0, z1, h, t, openings = [], collide = true) {
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    let z = z0;
    for (const o of ops) {
      if (o.a > z) box(m, x, 0, (z + o.a) / 2, t, h, o.a - z, 0, collide);
      if (o.y0 > 0) box(m, x, 0, (o.a + o.b) / 2, t, o.y0, o.b - o.a, 0, collide && o.y0 > 0.5);
      if (o.y1 < h) box(m, x, o.y1, (o.a + o.b) / 2, t, h - o.y1, o.b - o.a);
      z = o.b;
    }
    if (z < z1) box(m, x, 0, (z + z1) / 2, t, h, z1 - z, 0, collide);
  }
  const win = (a, b) => ({ a, b, y0: 1.0, y1: 2.3 });
  const door = (a, b) => ({ a, b, y0: 0, y1: 2.2 });

  // ---------- Hubs markers: empty nodes whose userData becomes MOZ_hubs_components on export
  const markers = new THREE.Group();
  markers.name = "hubs-markers";
  scene.add(markers);
  function marker(name, x, y, z, ry, components) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.userData = { MOZ_hubs_components: components };
    markers.add(o);
    return o;
  }
  const seatWaypoint = { waypoint: { canBeSpawnPoint: false, canBeOccupied: true, canBeClicked: true, willDisableMotion: true, willDisableTeleporting: true, snapToNavMesh: true, willMaintainInitialOrientation: true } };
  const gotoWaypoint = { waypoint: { canBeSpawnPoint: false, canBeOccupied: false, canBeClicked: true, willDisableMotion: false, willDisableTeleporting: false, snapToNavMesh: true, willMaintainInitialOrientation: true } };
  const spawnWaypoint = { waypoint: { canBeSpawnPoint: true, canBeOccupied: false, canBeClicked: false, willDisableMotion: false, willDisableTeleporting: false, snapToNavMesh: true, willMaintainInitialOrientation: true } };

  // ============================== GROUND, PATHS, FENCE ==============================
  box("grass", 0, -0.2, 0, 150, 0.2, 150);
  box("concrete", -2, 0, 4, 66, 0.04, 14);                 // front plaza
  box("path", 0, 0, 40, 5, 0.03, 58);                      // gate → plaza walkway
  box("path", 36, 0, 4, 12, 0.03, 4);                      // plaza → court

  // perimeter fence with a gate gap at x = −5..5 on the south side (z = 70)
  const fenceH = 1.8;
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box("metal", x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.12, fenceH, 0.12);
    }
    put("metal", new THREE.BoxGeometry(0.06, 0.06, len), (x0 + x1) / 2, fenceH - 0.15, (z0 + z1) / 2, ang);
    put("metal", new THREE.BoxGeometry(0.06, 0.06, len), (x0 + x1) / 2, 0.6, (z0 + z1) / 2, ang);
    colliders.push([Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15, 0, fenceH]);
  };
  fence(-70, -70, 70, -70);
  fence(-70, -70, -70, 70);
  fence(70, -70, 70, 70);
  fence(-70, 70, -5, 70);
  fence(5, 70, 70, 70);
  // gate pillars + arch
  box("wall", -5.6, 0, 70, 1.2, 3.6, 1.2, 0, true);
  box("wall", 5.6, 0, 70, 1.2, 3.6, 1.2, 0, true);
  box("trim", 0, 3.6, 70, 12.4, 0.8, 1.0);

  // ============================== SCHOOL BUILDING ==============================
  // Footprint x −30..26, z −26..−6, one storey. Four classrooms, 14 m wide each. Veranda z −6..−3.
  const B = { x0: -30, x1: 26, z0: -26, z1: -6, h: 3.6, t: 0.25 };
  const rooms = [-30, -16, -2, 12, 26]; // room boundaries along x
  // floor slab
  box("floor", (B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2, B.x1 - B.x0, 0.06, B.z1 - B.z0);
  // back (north) wall: windows per room; Room 1's middle stays solid for the board
  const backOps = [];
  for (let r = 0; r < 4; r++) {
    const a = rooms[r];
    if (r === 0) { backOps.push(win(a + 1, a + 3)); backOps.push(win(a + 11, a + 13)); }
    else { backOps.push(win(a + 2, a + 6)); backOps.push(win(a + 8, a + 12)); }
  }
  wallX("wall", B.z0, B.x0, B.x1, B.h, B.t, backOps);
  // front (south) wall on the veranda: a door + windows per room (the preview hangs a door leaf you can open)
  const frontOps = [];
  for (let r = 0; r < 4; r++) {
    const a = rooms[r];
    frontOps.push(door(a + 11, a + 12.6));
    frontOps.push(win(a + 1.5, a + 5.5));
    frontOps.push(win(a + 6.5, a + 10));
    doors.push({ x: a + 11.8, z: B.z1, w: 1.6, h: 2.2, axis: "x", open: r === 0 });
  }
  wallX("wall", B.z1, B.x0, B.x1, B.h, B.t, frontOps);
  map.push({ x0: B.x0, z0: B.z0, x1: B.x1, z1: B.z1, kind: "building" }, { x0: B.x0, z0: B.z1, x1: B.x1, z1: -3, kind: "plaza" });
  // side walls and room partitions (Room 1 west wall has windows)
  wallZ("wall", B.x0, B.z0, B.z1, B.h, B.t, [win(-23, -18), win(-15, -10)]);
  wallZ("wall", B.x1, B.z0, B.z1, B.h, B.t);
  for (let r = 1; r < 4; r++) wallZ("wall", rooms[r], B.z0, B.z1, B.h, B.t);
  // glass in all window openings (thin, set back into the wall)
  // Jalousie windows: tilted glass louvres in a metal frame (the standard Philippine school window)
  function jalousie(cxw, y0, y1, czw, width, alongZ) {
    const n = Math.round((y1 - y0) / 0.11);
    for (let k = 0; k < n; k++) {
      const y = y0 + 0.04 + k * ((y1 - y0 - 0.08) / (n - 1));
      if (alongZ) put("glass", new THREE.BoxGeometry(0.008, 0.1, width - 0.1), cxw, y, czw, 0, 0, 0.5);
      else put("glass", new THREE.BoxGeometry(width - 0.1, 0.1, 0.008), cxw, y, czw, 0, 0.5, 0);
    }
    const mullions = Math.max(1, Math.round(width / 1.0));
    for (let k = 0; k <= mullions; k++) {
      const t = -width / 2 + (k * width) / mullions;
      if (alongZ) box("metal", cxw, y0, czw + t, 0.04, y1 - y0, 0.04);
      else box("metal", cxw + t, y0, czw, 0.04, y1 - y0, 0.04);
    }
  }
  const glassX = (z, ops) => ops.filter(o => o.y0 > 0).forEach(o => jalousie((o.a + o.b) / 2, o.y0, o.y1, z, o.b - o.a, false));
  glassX(B.z0, backOps);
  glassX(B.z1, frontOps);
  jalousie(B.x0, 1.0, 2.3, -20.5, 5, true);
  jalousie(B.x0, 1.0, 2.3, -12.5, 5, true);
  // ceiling inside the rooms (the roof slab sits on top)
  box("ceiling", (B.x0 + B.x1) / 2, B.h - 0.06, (B.z0 + B.z1) / 2, B.x1 - B.x0, 0.05, B.z1 - B.z0);
  // roof: slab with green fascia, overhanging the veranda
  box("roof", (B.x0 + B.x1) / 2, B.h + 0.01, (B.z0 - 1 + -2.5) / 2, B.x1 - B.x0 + 2, 0.25, -2.5 - (B.z0 - 1));
  box("trim", (B.x0 + B.x1) / 2, B.h - 0.25, -2.5, B.x1 - B.x0 + 2, 0.5, 0.15);
  // veranda floor + posts
  box("concrete", (B.x0 + B.x1) / 2, 0, -4.5, B.x1 - B.x0, 0.08, 3);
  for (let x = B.x0 + 1; x <= B.x1 - 1; x += 5) box("metal", x, 0, -3.1, 0.18, B.h, 0.18, 0, true);
  // school name board above the veranda
  box("trim", -2, 2.42, -2.48, 14, 0.82, 0.08);
  marker("school-sign", -2, 2.83, -2.42, 0, {});

  // ============================== CLASSROOM 1 (detailed) ==============================
  // Interior x −30..−16, z −26..−6. Board on the north wall; learners face north (−Z).
  const cx = -23;
  box("board", cx, 0.9, B.z0 + 0.16, 6, 1.6, 0.08);                    // chalkboard
  box("trim", cx, 0.86, B.z0 + 0.2, 6.2, 0.06, 0.14);                  // chalk ledge
  box("podium", cx, 0, -23.6, 1.2, 1.05, 0.6, 0, true);                // lectern
  box("trim", cx, 1.05, -23.6, 1.3, 0.05, 0.7);
  if (realFurniture) {
    props.push({ kind: "teacher-desk", x: cx + 3.8, y: 0, z: -23.9, ry: Math.PI });
    colliders.push([cx + 2.8, -24.4, cx + 4.8, -23.4, 0, 0.8]);
    props.push({ kind: "shelf", x: -29.85, y: 0, z: -19.5, ry: Math.PI / 2 });   // book shelves on the west wall
    props.push({ kind: "shelf", x: -29.85, y: 0, z: -18.4, ry: Math.PI / 2 });
    colliders.push([-30, -20.1, -29.55, -17.8, 0, 2.1]);
    for (const [fx, fz] of [[-26.5, -19.5], [-19.5, -19.5], [-26.5, -13], [-19.5, -13]]) props.push({ kind: "ceiling-fan", x: fx, y: 3.54, z: fz, ry: 0 });
  } else {
    box("wood", cx + 3.6, 0, -23.8, 1.6, 0.76, 0.8, 0, true);          // teacher's table
  }
  // 35 learner desks: 5 rows × 7, each a desk + chair, facing the board
  let seatNo = 0;
  const seatXs = [-26.9, -25.6, -24.3, -23.0, -21.7, -20.4, -19.1];
  const rowZs = [-20.6, -19.0, -17.4, -15.8, -14.2];
  for (const z of rowZs) {
    for (const x of seatXs) {
      seatNo += 1;
      if (realFurniture) {
        props.push({ kind: "desk", x, y: 0, z: z - 0.35, ry: 0 });
        props.push({ kind: "chair", x, y: 0, z: z + 0.2, ry: 0 });
      } else {
        box("wood", x, 0.72, z - 0.35, 0.95, 0.04, 0.5);               // desk top
        for (const [dx, dz] of [[-0.42, -0.57], [0.42, -0.57], [-0.42, -0.13], [0.42, -0.13]]) box("metal", x + dx, 0, z + dz, 0.04, 0.72, 0.04);
        box("wood", x, 0.44, z + 0.15, 0.42, 0.04, 0.4);               // chair seat
        box("wood", x, 0.48, z + 0.36, 0.42, 0.42, 0.04);              // chair back
        for (const [dx, dz] of [[-0.18, -0.03], [0.18, -0.03], [-0.18, 0.33], [0.18, 0.33]]) box("metal", x + dx, 0, z + dz, 0.035, 0.44, 0.035);
      }
      marker("seat-" + String(seatNo).padStart(2, "0"), x, 0, z + 0.15, 0, seatWaypoint);
    }
  }
  // 4 breakout pods: round tables with 5 stools; each gets a Hubs audio zone so pods can't hear each other
  const pods = [["pod-a", -27, -10.6], ["pod-b", -19.4, -10.6], ["pod-c", -27, -7.8], ["pod-d", -19.4, -7.8]];
  for (const [name, x, z] of pods) {
    cyl("pod", x, 0.7, z, 0.75, 0.05, 16);
    cyl("metal", x, 0, z, 0.06, 0.7, 6);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      cyl("wood", x + Math.cos(a) * 1.15, 0, z + Math.sin(a) * 1.15, 0.2, 0.45, 8);
    }
    const zone = marker(name, x, 1.5, z, 0, {
      "audio-zone": { enabled: true, inOut: true, outIn: true, dynamic: false },
      "audio-params": { audioType: "pannernode", distanceModel: "inverse", gain: 1, refDistance: 1, rolloffFactor: 1, maxDistance: 10000, coneInnerAngle: 360, coneOuterAngle: 0, coneOuterGain: 0 }
    });
    zone.scale.set(3.4, 3, 2.6);   // the zone is a unit box scaled to the pod area
    marker(name + "-spot", x, 0, z + 1.4, 0, gotoWaypoint);
  }
  // Bulletin boards on the east partition wall, with pinned papers
  for (const bz of [-20.5, -13.5]) {
    box("cork", -16.17, 1.0, bz, 0.04, 1.2, 3.2);
    box("trim", -16.15, 0.96, bz, 0.05, 0.04, 3.3);
    box("trim", -16.15, 2.2, bz, 0.05, 0.04, 3.3);
    [["paperA", -1.1, 1.55], ["paperB", -0.2, 1.7], ["paperC", 0.8, 1.45], ["paperB", 1.2, 1.85], ["paperA", 0.1, 1.25], ["paperC", -1.0, 1.95]]
      .forEach(([m, dz, y]) => box(m, -16.2, y - 0.16, bz + dz, 0.02, 0.32, 0.5));
  }
  signs.push({ lines: ["Class Announcements"], x: -16.21, y: 2.32, z: -20.5, ry: -Math.PI / 2, w: 2.4, h: 0.22, bg: "#2f6b4f", fg: "#f3efe6" });
  signs.push({ lines: ["Our Best Work"], x: -16.21, y: 2.32, z: -13.5, ry: -Math.PI / 2, w: 2.4, h: 0.22, bg: "#2f6b4f", fg: "#f3efe6" });
  // Wall clock above the board
  put("clockFace", new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), cx, 2.95, B.z0 + 0.16, 0, Math.PI / 2, 0);
  put("dark", new THREE.CylinderGeometry(0.235, 0.235, 0.025, 20), cx, 2.95, B.z0 + 0.14, 0, Math.PI / 2, 0);
  box("dark", cx, 2.95, B.z0 + 0.185, 0.02, 0.15, 0.01);
  put("dark", new THREE.BoxGeometry(0.015, 0.11, 0.01), cx + 0.04, 2.98, B.z0 + 0.19, 0, 0, -1.0);
  signs.push({ lines: ["Welcome, Class!", "Maligayang pagdating!"], x: cx, y: 1.7, z: B.z0 + 0.22, ry: 0, w: 5.6, h: 1.4, bg: "#2b5a40", fg: "#e9efe6" });
  signs.push({ lines: ["Room 1"], x: -18.2, y: 2.45, z: B.z1 + 0.15, ry: 0, w: 1.4, h: 0.35, bg: "#2f6b4f", fg: "#f3efe6" });
  signs.push({ lines: ["KATURO UNIVERSITY", "Pamantasang Katuro"], x: -2, y: 2.83, z: -2.42, ry: 0, w: 13.6, h: 0.76, bg: "#2f6b4f", fg: "#f3efe6" });
  // Fluorescent tube lights: 3 rows × 4, the long fixtures every public-school classroom has
  for (const lx of [-27, -23, -19]) {
    for (const lz of [-22, -17.5, -13, -8.5]) {
      box("metal", lx, B.h - 0.12, lz, 0.22, 0.05, 1.3);
      box("lamp", lx, B.h - 0.16, lz, 0.08, 0.04, 1.2);
    }
  }
  // Hubs markers for teaching
  marker("podium", cx, 0, -22.9, Math.PI, gotoWaypoint);                       // teacher faces the class
  const screen = marker("screen", cx, 1.75, B.z0 + 0.25, 0, { "media-frame": { bounds: { x: 4.8, y: 2.7, z: 0.3 }, mediaType: "all-2d", snapToCenter: true } });
  screen.userData.preview = "screen";
  marker("classroom-1", -17.9, 0, -7.0, 0.28, gotoWaypoint);
  spots.board = { x: cx, y: 1.7, z: B.z0 + 0.6, r: 3.2, w: 5.6, h: 1.4, boardZ: B.z0 + 0.23 };   // write on the chalkboard / show slides
  spots.lectern = { x: cx, y: 1.1, z: -23.1, r: 1.6 };
  waterDispenser(-16.75, -7.6, -Math.PI / 2, "dispenser1");

  // ============================== ROOMS 2–4 (simpler interiors: box furniture, no extra draw calls) ==============================
  function roomBasics(a, title, sub) {
    const mid = a + 7;
    box("board", mid, 0.9, B.z0 + 0.16, 4.5, 1.4, 0.08);
    box("trim", mid, 0.86, B.z0 + 0.2, 4.7, 0.06, 0.14);
    signs.push({ lines: [title, sub], x: mid, y: 1.6, z: B.z0 + 0.22, ry: 0, w: 4.2, h: 1.1, bg: "#2b5a40", fg: "#e9efe6" });
    signs.push({ lines: [title], x: a + 11.8, y: 2.45, z: B.z1 + 0.15, ry: 0, w: 1.9, h: 0.35, bg: "#2f6b4f", fg: "#f3efe6" });
    for (const lx of [a + 3.5, a + 7, a + 10.5]) for (const lz of [-21, -15, -9.5]) {
      box("metal", lx, B.h - 0.12, lz, 0.22, 0.05, 1.3);
      box("lamp", lx, B.h - 0.16, lz, 0.08, 0.04, 1.2);
    }
  }
  function boxDesk(x, z) {   // learner desk + chair facing −Z
    box("wood", x, 0.72, z - 0.35, 0.95, 0.04, 0.5);
    for (const [dx, dz] of [[-0.42, -0.57], [0.42, -0.57], [-0.42, -0.13], [0.42, -0.13]]) box("metal", x + dx, 0, z + dz, 0.04, 0.72, 0.04);
    box("wood", x, 0.44, z + 0.15, 0.42, 0.04, 0.4);
    box("wood", x, 0.48, z + 0.36, 0.42, 0.42, 0.04);
    for (const [dx, dz] of [[-0.18, -0.03], [0.18, -0.03], [-0.18, 0.33], [0.18, 0.33]]) box("metal", x + dx, 0, z + dz, 0.035, 0.44, 0.035);
    colliders.push([x - 0.48, z - 0.62, x + 0.48, z - 0.1, 0, 0.76]);
  }
  // Room 2: a regular classroom (Grade 8)
  roomBasics(-16, "Grade 8 – Sampaguita", "Ikawalong Baitang");
  for (const z of [-20, -17.6, -15.2, -12.8]) for (const x of [-13.6, -11.6, -9.6, -7.6, -5.6]) boxDesk(x, z);
  box("wood", -9, 0, -23.6, 1.6, 0.76, 0.8, 0, true);                 // teacher's table
  waterDispenser(-2.75, -7.6, Math.PI / 2, "dispenser2");
  // Room 3: Science laboratory — black-top lab benches with stools, a sink counter, a fume cupboard
  roomBasics(-2, "Science Laboratory", "Laboratoryo ng Agham");
  for (const z of [-19.5, -15.5, -11.5]) for (const x of [2, 8]) {
    box("wood", x, 0, z, 3.2, 0.86, 1.1, 0, true);
    box("labTop", x, 0.86, z, 3.3, 0.04, 1.2);
    for (const dx of [-1.1, 0, 1.1]) { cyl("metal", x + dx, 0, z + 0.95, 0.03, 0.6, 6); cyl("wood", x + dx, 0.6, z + 0.95, 0.17, 0.04, 8); }
    box("dark", x - 0.6, 0.9, z - 0.2, 0.12, 0.3, 0.12);              // microscopes
    box("dark", x + 0.6, 0.9, z - 0.2, 0.12, 0.3, 0.12);
    cyl("glass", x, 0.9, z + 0.2, 0.06, 0.18, 8);                    // beaker
  }
  box("wood", 5, 0, -25.4, 8, 0.9, 0.7, 0, true);                      // sink counter along the back wall
  box("labTop", 5, 0.9, -25.4, 8.1, 0.04, 0.75);
  for (const sx of [2.5, 5, 7.5]) { box("ceramic", sx, 0.88, -25.4, 0.6, 0.06, 0.45); box("metal", sx, 0.94, -25.65, 0.04, 0.25, 0.04); }
  box("glass", 10.6, 0, -24.8, 1.6, 2.2, 1.0, 0, true);                // fume cupboard
  signs.push({ lines: ["Safety first!", "Wear goggles · Huwag tikman"], x: 11.86, y: 1.8, z: -16, ry: -Math.PI / 2, w: 2.6, h: 0.8, bg: "#f3efe6", fg: "#8a2d22" });
  // Room 4: ICT room — computer tables along the walls and an island in the middle
  roomBasics(12, "ICT Room", "Silid ng Kompyuter");
  const pc = (x, z, ry) => {
    const s = Math.sin(ry), c = Math.cos(ry);
    box("dark", x + s * 0.12, 0.76, z + c * 0.12, 0.5, 0.36, 0.05, ry);   // monitor
    box("screenOn", x + s * 0.09, 0.79, z + c * 0.09, 0.44, 0.3, 0.01, ry);
    box("dark", x - s * 0.15, 0.76, z - c * 0.15, 0.42, 0.02, 0.15, ry); // keyboard
  };
  for (const z of [-21, -18.5, -16, -13.5, -11]) {
    box("wood", 13, 0, z, 0.8, 0.75, 2.2, 0, true); pc(13.1, z - 0.5, -Math.PI / 2); pc(13.1, z + 0.5, -Math.PI / 2);
    box("wood", 25, 0, z, 0.8, 0.75, 2.2, 0, true); pc(24.9, z - 0.5, Math.PI / 2); pc(24.9, z + 0.5, Math.PI / 2);
  }
  box("wood", 19, 0, -15, 2.2, 0.75, 6, 0, true);
  for (const z of [-17, -15, -13]) { pc(18.4, z, -Math.PI / 2); pc(19.6, z, Math.PI / 2); }
  marker("room-2", -4.1, 0, -7.2, 0, gotoWaypoint);
  marker("science-lab", 9.9, 0, -7.2, 0, gotoWaypoint);
  marker("ict-room", 23.9, 0, -7.2, 0, gotoWaypoint);

  function waterDispenser(x, z, ry, name) {
    box("ceramic", x, 0, z, 0.36, 1.0, 0.36, ry, true);
    cyl("waterBlue", x, 1.0, z, 0.15, 0.42, 10, 0.13);
    box("dark", x, 0.75, z, 0.38, 0.08, 0.38, ry);
    spots[name] = { x, y: 1, z, r: 1.4 };
  }

  // ============================== FLAG PLAZA ==============================
  box("concrete", 0, 0, 10, 8, 0.25, 8);                                // raised flag platform
  cyl("metal", 0, 0.25, 10, 0.07, 9, 8, 0.05);                           // flagpole
  box("flag", 0.75, 7.8, 10, 1.5, 0.9, 0.03);                            // flag (the preview paints the Philippine flag on it)
  signs.push({ flag: "ph", x: 0.75, y: 8.25, z: 10.02, ry: 0, w: 1.5, h: 0.75 });
  signs.push({ flag: "ph", x: 0.75, y: 8.25, z: 9.98, ry: Math.PI, w: 1.5, h: 0.75 });
  spots.flag = { x: 0, y: 1.2, z: 10.6, r: 2.6, top: 8.25, bottom: 1.4 };
  map.push({ x0: -4, z0: 6, x1: 4, z1: 14, kind: "plaza" });
  // School bell on a post by the veranda (ring it with E)
  box("metal", 30.2, 0, -2.6, 0.12, 2.6, 0.12, 0, true);
  box("metal", 30.2, 2.5, -2.35, 0.06, 0.06, 0.5);
  cyl("brass", 30.2, 2.12, -2.1, 0.17, 0.3, 12, 0.07);
  spots.bell = { x: 30.2, y: 2.2, z: -2.1, r: 2.2 };

  // ============================== STAGE (programmes, speeches) ==============================
  const S = { x: 24, z: 6 };
  box("concrete", S.x, 0, S.z, 5.5, 1.0, 9, 0, true);                   // raised stage, facing west toward the plaza
  for (let k = 0; k < 3; k++) box("concrete", S.x - 3.05 - k * 0.3, 0, S.z, 0.3, 0.75 - k * 0.25, 2.4);
  ramps.push({ x0: S.x - 4.25, x1: S.x - 2.75, z0: S.z - 1.2, z1: S.z + 1.2, y0: 0, y1: 1.0 });   // physics sees the steps as a smooth ramp
  box("wall", S.x + 2.6, 1.0, S.z, 0.3, 3.2, 9);                         // backdrop wall
  box("trim", S.x + 2.4, 1.0, S.z, 0.06, 3.0, 8.6);                      // backdrop panel
  for (const pz of [S.z - 4.4, S.z + 4.4]) box("metal", S.x - 2.6, 1.0, pz, 0.2, 3.4, 0.2);
  box("roof", S.x, 4.4, S.z, 6.2, 0.18, 10);
  signs.push({ lines: ["Katuro Stage", "Entablado"], x: S.x + 2.36, y: 3.2, z: S.z, ry: -Math.PI / 2, w: 5, h: 0.9, bg: "#2f6b4f", fg: "#f3efe6" });
  map.push({ x0: S.x - 2.75, z0: S.z - 4.5, x1: S.x + 2.75, z1: S.z + 4.5, kind: "building" });
  spots.stage = { x: S.x - 0.5, y: 1.6, z: S.z, r: 2.5 };

  // ============================== CANTEEN + LIBRARY (west side) ==============================
  function smallBuilding(x0, z0, w, d, name, sub) {
    const h = 3.4, x1 = x0 + w, z1 = z0 + d;
    box("concrete", (x0 + x1) / 2, 0, (z0 + z1) / 2, w + 2, 0.04, d + 2);   // apron: lower than the 6 cm indoor floor
    wallX("wall", z0, x0, x1, h, 0.25, [win(x0 + 1.5, x0 + 4), win(x1 - 4, x1 - 1.5)]);
    wallX("wall", z1, x0, x1, h, 0.25, [door(x0 + w / 2 - 0.9, x0 + w / 2 + 0.9), win(x0 + 1, x0 + w / 2 - 1.6), win(x0 + w / 2 + 1.6, x1 - 1)]);
    wallZ("wall", x0, z0, z1, h, 0.25, [win(z0 + 1.5, z1 - 1.5)]);
    wallZ("wall", x1, z0, z1, h, 0.25, [win(z0 + 1.5, z1 - 1.5)]);
    jalousie(x0 + 2.75, 1.0, 2.3, z0, 2.5, false);
    jalousie(x1 - 2.75, 1.0, 2.3, z0, 2.5, false);
    jalousie((x0 + 1 + x0 + w / 2 - 1.6) / 2, 1.0, 2.3, z1, w / 2 - 2.6, false);
    jalousie((x0 + w / 2 + 1.6 + x1 - 1) / 2, 1.0, 2.3, z1, w / 2 - 2.6, false);
    jalousie(x0, 1.0, 2.3, (z0 + z1) / 2, d - 3, true);
    jalousie(x1, 1.0, 2.3, (z0 + z1) / 2, d - 3, true);
    box("floor", (x0 + x1) / 2, 0, (z0 + z1) / 2, w, 0.06, d);
    box("ceiling", (x0 + x1) / 2, h - 0.06, (z0 + z1) / 2, w, 0.05, d);
    box("roof", (x0 + x1) / 2, h, (z0 + z1) / 2 + 0.6, w + 1.6, 0.22, d + 2.4);
    box("trim", (x0 + x1) / 2, h - 0.3, z1 + 1.8, w + 1.6, 0.5, 0.12);
    signs.push({ lines: [name, sub], x: (x0 + x1) / 2, y: 2.75, z: z1 + 0.15, ry: 0, w: Math.min(6, w - 2), h: 0.6, bg: "#2f6b4f", fg: "#f3efe6" });
    doors.push({ x: x0 + w / 2, z: z1, w: 1.8, h: 2.2, axis: "x", open: true });
    map.push({ x0, z0, x1, z1, kind: "building" });
  }
  smallBuilding(-56, -4, 14, 9, "CANTEEN", "Kantina");
  box("wood", -49, 0, -0.5, 8, 1.0, 0.6, 0, true);                       // serving counter
  for (const tx of [-53, -45]) { box("wood", tx, 0.72, 2.3, 1.8, 0.05, 0.9); box("metal", tx, 0, 2.3, 0.08, 0.72, 0.08); }
  // snacks on the counter: turon, banana cue, pandesal basket
  for (let k = 0; k < 6; k++) put(k % 2 ? "wood" : "trunk", new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), -52 + k * 0.35, 1.04, -0.5, 0, 0, Math.PI / 2);
  cyl("cork", -47.5, 1.0, -0.5, 0.22, 0.12, 10, 0.26);
  spots.canteen = { x: -49, y: 1.2, z: 0.4, r: 2.2 };
  waterDispenser(-55.4, 3.8, Math.PI / 2, "dispenser3");
  smallBuilding(-56, -24, 14, 10, "LIBRARY", "Silid-aklatan");
  props.push({ kind: "shelf", x: -55.6, y: 0, z: -20, ry: Math.PI / 2 }, { kind: "shelf", x: -55.6, y: 0, z: -18.9, ry: Math.PI / 2 }, { kind: "shelf", x: -55.6, y: 0, z: -17.8, ry: Math.PI / 2 });
  box("wood", -49, 0.74, -19, 3, 0.05, 1.2);
  box("metal", -49, 0, -19, 0.1, 0.74, 0.1);
  box("wood", -47, 0, -22.4, 2.4, 0.8, 0.7, 0, true);                    // librarian's desk
  box("paperA", -47.4, 0.8, -22.4, 0.3, 0.06, 0.22);
  spots.shelf = { x: -54.6, y: 1.2, z: -18.9, r: 2.2 };
  spots.librarian = { x: -47, y: 1.5, z: -21.4, r: 2.0 };
  box("path", -40, 0, 0.5, 14, 0.03, 3);    // walkway plaza → canteen
  box("path", -40, 0, -13, 3, 0.03, 26);    // walkway canteen → library
  for (let i = -1; i <= 1; i++) box("wood", i * 3.5, 0, 17, 2.4, 0.45, 0.5);   // benches facing the flag

  // ============================== COVERED COURT ==============================
  const C = { x: 52, z: -6, w: 28, d: 17 };
  box("court", C.x, 0, C.z, C.w + 2, 0.06, C.d + 2);
  box("courtLine", C.x, 0.061, C.z, 0.1, 0.01, C.d);                     // centre line
  box("courtLine", C.x, 0.061, C.z - C.d / 2, C.w, 0.01, 0.1);
  box("courtLine", C.x, 0.061, C.z + C.d / 2, C.w, 0.01, 0.1);
  box("courtLine", C.x - C.w / 2, 0.061, C.z, 0.1, 0.01, C.d);
  box("courtLine", C.x + C.w / 2, 0.061, C.z, 0.1, 0.01, C.d);
  for (const sx of [-1, 1]) {                                            // hoops
    const hx = C.x + sx * (C.w / 2 + 0.6);
    box("metal", hx, 0, C.z, 0.2, 3.05, 0.2, 0, true);
    box("courtLine", hx - sx * 0.15, 2.9, C.z, 0.05, 1.05, 1.8);
    cyl("trim", hx - sx * 0.55, 3.05, C.z, 0.23, 0.02, 12);
  }
  for (const px of [C.x - 15, C.x - 5, C.x + 5, C.x + 15]) for (const pz of [C.z - 10, C.z + 10]) box("metal", px, 0, pz, 0.3, 7, 0.3, 0, true);
  box("roof", C.x, 7, C.z, 33, 0.3, 23);
  box("trim", C.x, 6.7, C.z - 11.5, 33, 0.4, 0.15);
  box("trim", C.x, 6.7, C.z + 11.5, 33, 0.4, 0.15);
  map.push({ x0: C.x - C.w / 2 - 1, z0: C.z - C.d / 2 - 1, x1: C.x + C.w / 2 + 1, z1: C.z + C.d / 2 + 1, kind: "court" });
  // sports equipment: a ball rack, loose balls and training cones
  box("metal", C.x - 13, 0, C.z + 9.6, 1.4, 0.9, 0.5, 0, true);
  for (let k = 0; k < 4; k++) put("ball", new THREE.IcosahedronGeometry(0.12, 1), C.x - 13.5 + k * 0.33, 0.98, C.z + 9.6);
  for (const [bx, bz] of [[C.x - 4, C.z + 2], [C.x + 6, C.z - 3.5], [C.x + 1, C.z + 5.5]]) put("ball", new THREE.IcosahedronGeometry(0.12, 1), bx, 0.12, bz);
  for (let k = 0; k < 6; k++) put("binRed", new THREE.ConeGeometry(0.12, 0.3, 8), C.x - 8 + k * 1.6, 0.15, C.z - 6);
  spots.court = { x: C.x - 13, y: 1.1, z: C.z + 9, r: 2 };

  // ============================== TREES ==============================
  const treeSpots = [];
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, r = 52 + ((i * 53) % 13);
    treeSpots.push([Math.cos(a) * r, Math.sin(a) * r * 0.9]);
  }
  treeSpots.push([-14, 22], [14, 22], [-36, 12], [-36, -24], [30, 26], [-26, 40], [24, 48]);
  treeSpots.forEach(([x, z], i) => {
    if (Math.abs(x) < 6 && z > 18) return;                   // keep the walkway clear
    if (x > 34 && x < 70 && z > -20 && z < 8) return;        // keep the court clear
    const h = 2.4 + (i % 3) * 0.5;
    const r = 1.5 + (i % 4) * 0.3;
    cyl("trunk", x, 0, z, 0.24, h + 0.6, 7, 0.14);
    // Crown: a cluster of 4 smooth blobs (reads as a mango/acacia canopy, still ~320 triangles)
    const blobs = [[0, 0.9, 0, 1], [0.75, 0.55, 0.3, 0.72], [-0.65, 0.6, -0.35, 0.75], [0.1, 1.45, -0.5, 0.65]];
    blobs.forEach(([bx, by, bz, br], k) => {
      const g = new THREE.IcosahedronGeometry(r * br, i < 46 ? 0 : 1);   // perimeter trees are always far away: lighter crowns
      g.scale(1, 0.78, 1);
      const a = i * 1.7;
      const rx = (bx * Math.cos(a) - bz * Math.sin(a)) * r, rz = (bx * Math.sin(a) + bz * Math.cos(a)) * r;
      put((i + k) % 3 === 0 ? "leaf2" : "leaf", g, x + rx, h + by * r * 0.8, z + rz, i + k);
    });
    colliders.push([x - 0.35, z - 0.35, x + 0.35, z + 0.35, 0, 3]);
    trees.push({ x, z, r: r * 1.5 });
  });

  // ============================== CAMPUS DETAILS ==============================
  // Potted plants between the veranda posts
  for (let x = B.x0 + 3.5; x <= B.x1 - 3.5; x += 5) {
    if (Math.abs(x - -18.2) < 1.5) continue;                     // keep Room 1's door clear
    cyl("pot", x, 0.08, -3.3, 0.22, 0.42, 10, 0.28);
    put("plant", new THREE.IcosahedronGeometry(0.42, 0), x, 0.85, -3.3, x);
    put("plant", new THREE.IcosahedronGeometry(0.3, 0), x + 0.18, 1.12, -3.25, x + 1);
  }
  // Colour-coded waste bins: biodegradable, recyclable, residual
  function bins(x, z, ry) {
    ["binGreen", "binBlue", "binRed"].forEach((m, k) => {
      const dx = (k - 1) * 0.62;
      const bx = x + Math.cos(ry) * dx, bz = z - Math.sin(ry) * dx;
      cyl(m, bx, 0, bz, 0.26, 0.85, 10, 0.29);
      cyl("dark", bx, 0.85, bz, 0.3, 0.05, 10);
    });
    colliders.push([x - 0.95, z - 0.35, x + 0.95, z + 0.35, 0, 0.9]);
  }
  bins(-11.5, -1.8, 0);
  bins(8.5, -1.8, 0);
  bins(-40.5, 6.6, 0);
  // Handwashing stations: long basin with taps, near the classrooms and the canteen
  function washStation(x, z) {
    box("concrete", x, 0, z, 3, 0.8, 0.7, 0, true);
    box("wall", x, 0.8, z, 3, 0.12, 0.7);
    box("dark", x, 0.84, z, 2.7, 0.06, 0.5);
    box("metal", x, 0.92, z + 0.3, 3, 0.05, 0.05);
    for (let k = -1; k <= 1; k++) box("metal", x + k * 0.9, 0.92, z + 0.2, 0.04, 0.16, 0.04);
  }
  washStation(-10, 13.5);
  washStation(-53.5, 7.6);
  // Gulayan sa Paaralan: school vegetable garden behind the main building
  const G = { x: -6, z: -38 };
  for (let bi = 0; bi < 6; bi++) {
    const bx = G.x - 7.5 + (bi % 3) * 7.5, bz = G.z - 2.6 + Math.floor(bi / 3) * 5.2;
    box("wood", bx, 0, bz, 5.6, 0.32, 2.2, 0, true);           // raised bed frame
    box("soil", bx, 0.3, bz, 5.3, 0.05, 1.9);
    // growth stages per bed: seedlings, young plants, then fruiting tomatoes / eggplants
    const stage = bi % 3;
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 7; k++) {
        const px = bx - 2.3 + k * 0.76, pz = bz - 0.6 + row * 0.6;
        const sz = [0.45, 0.75, 1.0][stage] * (0.85 + ((k * 7 + row * 3) % 5) * 0.06);
        const g = bi % 2 ? new THREE.ConeGeometry(0.16 * sz, 0.42 * sz, 5) : new THREE.IcosahedronGeometry(0.17 * sz, 0);
        put("plant", g, px, 0.35 + 0.17 * sz + (bi % 2 ? 0.04 : -0.02), pz, k + row);
        if (stage === 2 && (k + row) % 2 === 0) {
          if (bi < 3) put("tomato", new THREE.IcosahedronGeometry(0.045, 1), px + 0.08, 0.5, pz + 0.07);
          else put("eggplant", new THREE.CylinderGeometry(0.035, 0.045, 0.16, 6), px + 0.09, 0.45, pz + 0.06, 0, 0.3, 0.4);
        }
      }
    }
    spots["bed" + bi] = { x: bx, y: 0.6, z: bz + 1.4, r: 1.8 };
  }
  // watering can by the garden sign
  cyl("waterBlue", G.x + 2.6, 0, G.z + 5.4, 0.13, 0.26, 10, 0.11);
  box("waterBlue", G.x + 2.8, 0.15, G.z + 5.4, 0.22, 0.04, 0.04, 0, 0);
  box("path", G.x, 0, G.z, 24, 0.03, 1.4);
  box("path", G.x, 0, -31, 3, 0.03, 8);
  map.push({ x0: G.x - 11, z0: G.z - 4, x1: G.x + 11, z1: G.z + 4, kind: "garden" });

  // ============================== ADMINISTRATION: principal's office + comfort rooms ==============================
  // Behind the school on the east side; reached by the walkway along the school's east wall.
  {
    const x0 = 8, z0 = -46, w = 20, d = 10, x1 = x0 + w, z1 = z0 + d, h = 3.4;
    box("concrete", (x0 + x1) / 2, 0, (z0 + z1) / 2, w + 2, 0.04, d + 2);
    wallX("wall", z0, x0, x1, h, 0.25, [win(x0 + 2, x0 + 5), win(x1 - 5, x1 - 2)]);
    // front: lobby door in the middle
    wallX("wall", z1, x0, x1, h, 0.25, [door(17.1, 18.9), win(x0 + 2, x0 + 6), win(x1 - 6, x1 - 2)]);
    wallZ("wall", x0, z0, z1, h, 0.25, [win(z0 + 3, z1 - 3)]);
    wallZ("wall", x1, z0, z1, h, 0.25, [win(z0 + 3, z1 - 3)]);
    jalousie(x0 + 3.5, 1.0, 2.3, z0, 3, false); jalousie(x1 - 3.5, 1.0, 2.3, z0, 3, false);
    jalousie(x0 + 4, 1.0, 2.3, z1, 4, false); jalousie(x1 - 4, 1.0, 2.3, z1, 4, false);
    jalousie(x0, 1.0, 2.3, (z0 + z1) / 2, d - 6, true); jalousie(x1, 1.0, 2.3, (z0 + z1) / 2, d - 6, true);
    // inner walls: office (west) | lobby | comfort rooms (east, split into boys and girls)
    wallZ("wall", 15, z0, z1, h, 0.2, [door(-40.5, -39)]);
    wallZ("wall", 21, z0, z1, h, 0.2, [door(-44.5, -43.2), door(-39.3, -38)]);
    wallX("wall", -41, 21, x1, h, 0.2);
    doors.push({ x: 18, z: z1, w: 1.8, h: 2.2, axis: "x", open: true }, { x: 15, z: -39.75, w: 1.5, h: 2.2, axis: "z", open: false });
    box("floor", (x0 + x1) / 2, 0, (z0 + z1) / 2, w, 0.06, d);
    box("ceiling", (x0 + x1) / 2, h - 0.06, (z0 + z1) / 2, w, 0.05, d);
    box("roof", (x0 + x1) / 2, h, (z0 + z1) / 2 + 0.6, w + 1.6, 0.22, d + 2.4);
    box("trim", (x0 + x1) / 2, h - 0.3, z1 + 1.8, w + 1.6, 0.5, 0.12);
    for (const lx of [11.5, 18, 24.5]) { box("metal", lx, h - 0.12, -41, 0.22, 0.05, 1.3); box("lamp", lx, h - 0.16, -41, 0.08, 0.04, 1.2); }
    signs.push({ lines: ["ADMINISTRATION", "Tanggapan"], x: 18, y: 2.75, z: z1 + 0.15, ry: 0, w: 5, h: 0.6, bg: "#2f6b4f", fg: "#f3efe6" });
    // principal's office
    box("wood", 11.5, 0, -43.2, 2.2, 0.78, 1.0, 0, true);                // desk
    box("dark", 11.5, 0.78, -43.4, 0.5, 0.32, 0.04);                     // nameplate + monitor
    box("paperA", 11.0, 0.78, -42.95, 0.35, 0.03, 0.25);
    box("metal", 11.5, 0, -44.4, 0.55, 1.1, 0.55, 0, true);               // principal's chair
    for (const vx of [10.7, 12.3]) box("wood", vx, 0, -41.7, 0.5, 0.48, 0.5, 0, true);   // visitor chairs
    box("metal", 8.5, 0, -38, 0.5, 1.4, 0.9, 0, true);                   // filing cabinet
    box("wood", 14.3, 0, -45.2, 1.0, 2.0, 0.45, 0, true);                // trophy shelf
    for (const ty of [0.7, 1.3]) for (const tx of [13.95, 14.3, 14.65]) cyl("brass", tx, ty, -45.1, 0.06, 0.22, 8, 0.03);
    cyl("metal", 9, 0, -45.3, 0.025, 2.0, 6);                            // small flag stand
    signs.push({ flag: "ph", x: 9.35, y: 1.75, z: -45.3, ry: 0, w: 0.7, h: 0.35 });
    signs.push({ lines: ["Principal's Office", "Tanggapan ng Punong-guro"], x: 15.11, y: 2.4, z: -39.75, ry: Math.PI / 2, w: 1.8, h: 0.45, bg: "#2f6b4f", fg: "#f3efe6" });
    signs.push({ lines: ["Excellence · Service · Bayanihan"], x: 11.5, y: 2.2, z: z0 + 0.14, ry: 0, w: 4, h: 0.4, bg: "#f3efe6", fg: "#2f6b4f" });
    spots.principal = { x: 11.5, y: 1.5, z: -44.2, r: 2.4 };
    // lobby: bench and notice board
    box("wood", 18, 0, -45.3, 2.4, 0.45, 0.5, 0, true);
    box("cork", 18, 1.0, z0 + 0.15, 3, 1.1, 0.04);
    // comfort rooms: stalls with toilets, a sink counter with a mirror
    signs.push({ lines: ["BOYS · LALAKI"], x: 21.11, y: 2.4, z: -43.85, ry: Math.PI / 2, w: 1.3, h: 0.3, bg: "#2f6fb3", fg: "#ffffff" });
    signs.push({ lines: ["GIRLS · BABAE"], x: 21.11, y: 2.4, z: -38.65, ry: Math.PI / 2, w: 1.3, h: 0.3, bg: "#c0392b", fg: "#ffffff" });
    for (const [zs, zw, s] of [[-46, -41, -1], [-41, -36, 1]]) {   // s: which side the outer wall is on
      const mid = (zs + zw) / 2;
      for (let k = 0; k < 3; k++) {
        const sx = 23.6 + k * 1.4;
        box("trim", sx + 0.7, 0.1, mid + s * 0.9, 0.04, 1.8, 2.6);          // stall partitions
        box("ceramic", sx, 0, mid + s * 2.1, 0.4, 0.42, 0.55, 0, true);     // toilet against the outer wall
      }
      box("ceramic", 27.6, 0.8, mid - s * 1.2, 0.5, 0.12, 1.6);           // sink counter
      box("glass", 27.86, 1.3, mid - s * 1.2, 0.02, 0.8, 1.4);             // mirror
    }
    map.push({ x0, z0, x1, z1, kind: "building" });
    spots.cr = { x: 24.5, y: 1, z: -41, r: 3 };
  }
  // walkways: along the school's east wall to the administration building
  box("path", 28.2, 0, -19, 2.2, 0.03, 31);
  box("path", 18, 0, -34.6, 22, 0.03, 2);
  box("path", 18, 0, -35.5, 2.2, 0.03, 1.2);
  map.push({ x0: 27.1, z0: -34.5, x1: 29.3, z1: -3.5, kind: "path" }, { x0: 7, z0: -35.6, x1: 29, z1: -33.6, kind: "path" });
  signs.push({ lines: ["GULAYAN SA PAARALAN", "School Vegetable Garden"], x: G.x, y: 1.3, z: G.z + 6, ry: 0, w: 4.2, h: 0.8, bg: "#2f6b4f", fg: "#f3efe6" });
  box("metal", G.x - 1.9, 0, G.z + 5.96, 0.08, 1.7, 0.08);
  box("metal", G.x + 1.9, 0, G.z + 5.96, 0.08, 1.7, 0.08);

  // ============================== SPAWN + GO-TO POINTS ==============================
  [[-3, 64], [-1, 64], [1, 64], [3, 64]].forEach(([x, z], i) => marker("spawn-0" + (i + 1), x, 0, z, 0, spawnWaypoint));
  marker("flag-plaza", 0, 0, 19, 0, gotoWaypoint);
  marker("covered-court", C.x - 17.5, 0, C.z + 3, -Math.PI / 2, gotoWaypoint);

  // Navigation mesh for Hubs: walkable ground. v1 is one flat plane (walls are solid in the
  // preview but not yet in Hubs — a proper navmesh with wall cut-outs is a TODO for the artist pass).
  const nav = new THREE.Mesh(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), M.marker);
  nav.name = "navmesh";
  nav.position.y = 0.01;
  nav.visible = false;
  nav.userData = { MOZ_hubs_components: { "nav-mesh": {}, visible: { visible: false } } };
  scene.add(nav);

  // ============================== MERGE + LIGHTS ==============================
  const world = new THREE.Group();
  world.name = "world";
  for (const [name, geos] of Object.entries(buckets)) {
    const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(geos, false);
    const mesh = new THREE.Mesh(merged, M[name]);
    mesh.name = name;
    world.add(mesh);
  }
  scene.add(world);

  const hemi = new THREE.HemisphereLight(0xe8f1ff, 0xbfb39a, 0.85);
  hemi.name = "sky-light";
  hemi.userData = { MOZ_hubs_components: { "hemisphere-light": { skyColor: "#e8f1ff", groundColor: "#bfb39a", intensity: 0.85 } } };
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 0.9);
  sun.name = "sun";
  sun.position.set(30, 50, 20);
  sun.userData = { MOZ_hubs_components: { "directional-light": { color: "#fff2dc", intensity: 0.9, castShadow: false } } };
  scene.add(sun);

  const places = {
    gate: { x: 0, z: 64, yaw: 0, label: "Main gate" },
    plaza: { x: 0, z: 22, yaw: 0, label: "Flag plaza" },
    classroom: { x: -17.9, z: -7.0, yaw: 0.28, label: "Classroom 1" },
    podium: { x: cx, z: -22.8, yaw: Math.PI, label: "Podium" },
    room2: { x: -4.1, z: -7.2, yaw: 0.3, label: "Grade 8 room" },
    lab: { x: 9.9, z: -7.2, yaw: 0.3, label: "Science Lab" },
    ict: { x: 23.9, z: -7.2, yaw: 0.3, label: "ICT Room" },
    court: { x: C.x - 17.5, z: C.z + 3, yaw: -Math.PI / 2 + 0.12, label: "Covered court" },
    stage: { x: 12, z: 6, yaw: -Math.PI / 2, label: "Stage" },
    canteen: { x: -46, z: 14, yaw: 0.25, label: "Canteen" },
    library: { x: -45, z: -6.5, yaw: 0.3, label: "Library" },
    garden: { x: -6, z: -30.5, yaw: 0, label: "Vegetable garden" },
    admin: { x: 18, z: -33.4, yaw: 0, label: "Principal's office" }
  };
  // Named areas, most specific first
  areas.push(
    { x0: -30, z0: -26, x1: -16, z1: -21, label: "Podium", indoor: true },
    { x0: -30, z0: -26, x1: -16, z1: -6, label: "Classroom 1", indoor: true },
    { x0: -16, z0: -26, x1: -2, z1: -6, label: "Grade 8 room", indoor: true },
    { x0: -2, z0: -26, x1: 12, z1: -6, label: "Science Lab", indoor: true },
    { x0: 12, z0: -26, x1: 26, z1: -6, label: "ICT Room", indoor: true },
    { x0: 8, z0: -46, x1: 15, z1: -36, label: "Principal's office", indoor: true },
    { x0: 21, z0: -46, x1: 28, z1: -36, label: "Comfort rooms", indoor: true },
    { x0: 15, z0: -46, x1: 21, z1: -36, label: "Administration", indoor: true },
    { x0: -56, z0: -4, x1: -42, z1: 5, label: "Canteen", indoor: true },
    { x0: -56, z0: -24, x1: -42, z1: -14, label: "Library", indoor: true },
    { x0: 33, z0: -18, x1: 70, z1: 8, label: "Covered court" },
    { x0: 8, z0: 0, x1: 28, z1: 12, label: "Stage" },
    { x0: -20, z0: -45, x1: 8, z1: -27, label: "Vegetable garden" },
    { x0: -70, z0: 60, x1: 70, z1: 72, label: "Main gate" },
    { x0: -34, z0: -3, x1: 34, z1: 24, label: "Flag plaza" },
    { x0: -30, z0: -6, x1: 26, z1: -3, label: "Veranda" }
  );
  map.push({ x0: -2.5, z0: 11, x1: 2.5, z1: 69, kind: "path" }, { x0: 30, z0: 2, x1: 42, z1: 6, kind: "path" },
    { x0: -47, z0: -1, x1: -33, z1: 2, kind: "path" }, { x0: -41.5, z0: -26, x1: -38.5, z1: 0, kind: "path" },
    { x0: -18, z0: -38.7, x1: 6, z1: -37.3, kind: "path" }, { x0: -7.5, z0: -35, x1: -4.5, z1: -27, kind: "path" },
    { x0: -35, z0: -3, x1: 31, z1: 11, kind: "plaza" });
  return { scene, colliders, places, markers, materials: M, props, signs, trees, ramps, doors, spots, areas, map };
};
