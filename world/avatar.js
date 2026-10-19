"use strict";
// ============================================================================================
// AVATARS — low-poly people (~700 triangles) built from a "look". Used by the appearance editor
// preview and by multiplayer (other people in the school). No DOM except the name-tag canvas.
// ============================================================================================
(function () {
  const SKIN = { a: "#f3d3b5", b: "#e2b48c", c: "#c98f62", d: "#a8693f", e: "#7a4a2a" };
  const HAIR_COLOR = { black: "#1d1a19", brown: "#4a2e1f", auburn: "#7a3b20", gray: "#9a9a9a", blonde: "#c9a25a" };
  const OUTFITS = {
    polo: { label: "School uniform (polo)", shirt: "#f7f7f2", bottom: "#24324f", collar: "#f7f7f2", skirt: false },
    blouse: { label: "School uniform (blouse)", shirt: "#f7f7f2", bottom: "#24324f", collar: "#24324f", skirt: true },
    pe: { label: "PE shirt", shirt: "#2f6b4f", bottom: "#1f2a24", collar: "#2f6b4f", skirt: false },
    casual: { label: "Casual", shirt: "#d2553f", bottom: "#4a6a8f", collar: "#d2553f", skirt: false },
    teacher: { label: "Teacher (Filipiniana-style)", shirt: "#e9d9b6", bottom: "#3a2f2a", collar: "#c8a35b", skirt: false }
  };
  const HAIR_STYLES = { short: "Short", long: "Long", ponytail: "Ponytail", bun: "Bun", buzz: "Buzz cut" };

  const DEFAULT_LOOK = { name: "", skin: "c", hair: "short", hairColor: "black", outfit: "polo" };

  // Soft round shadow texture, shared by avatars and tree shadows
  let shadowTex = null;
  function shadowTexture(THREE) {
    if (shadowTex) return shadowTex;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.75)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.35)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
    return shadowTex;
  }

  function mat(THREE, hex, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, metalness: 0, ...extra });
    m.color.convertSRGBToLinear();
    return m;
  }

  function nameTag(THREE, text, role) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const g = c.getContext("2d");
    g.font = "600 56px Segoe UI, sans-serif";
    const label = (role === "teacher" ? "★ " : "") + (text || "Guest");
    const w = Math.min(500, g.measureText(label).width + 48);
    g.fillStyle = role === "teacher" ? "rgba(47,107,79,0.92)" : "rgba(20,24,22,0.78)";
    const x = (512 - w) / 2;
    g.beginPath();
    g.moveTo(x + 28, 20); g.arcTo(x + w, 20, x + w, 108, 28); g.arcTo(x + w, 108, x, 108, 28); g.arcTo(x, 108, x, 20, 28); g.arcTo(x, 20, x + w, 20, 28);
    g.fill();
    g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(label, 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
    sprite.scale.set(1.0, 0.25, 1);
    return sprite;
  }

  // Returns a THREE.Group with userData { setHand(bool), setTalking(level 0..1), setName(name, role) }.
  function buildAvatar(THREE, look = {}, opts = {}) {
    const L = { ...DEFAULT_LOOK, ...look };
    const outfit = OUTFITS[L.outfit] || OUTFITS.polo;
    const skin = mat(THREE, SKIN[L.skin] || SKIN.c);
    const hair = mat(THREE, HAIR_COLOR[L.hairColor] || HAIR_COLOR.black, { roughness: 0.6 });
    const shirt = mat(THREE, outfit.shirt);
    const bottom = mat(THREE, outfit.bottom);
    const collar = mat(THREE, outfit.collar);
    const shoe = mat(THREE, "#1b1b1b", { roughness: 0.5 });
    const eye = mat(THREE, "#151515", { roughness: 0.3 });

    const root = new THREE.Group();
    root.name = "avatar";
    const body = new THREE.Group();      // everything above the hips; lowered when sitting
    root.add(body);
    const add = (geo, m, x, y, z, parent = body) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    // legs: hip → thigh → knee → shin → shoe, so the avatar can sit
    // contact shadow (stays on the floor even when the body sits)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTexture(THREE), transparent: true, depthWrite: false, opacity: 0.7 }));
    shadow.position.y = 0.02;
    root.add(shadow);

    const HIP = 0.84;
    const legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, HIP, 0);
      body.add(hip);
      const legMat = outfit.skirt ? skin : bottom;
      const r = outfit.skirt ? 0.05 : 0.075;
      add(new THREE.CylinderGeometry(r, r * 0.92, 0.42, 7), legMat, 0, -0.21, 0, hip);
      const knee = new THREE.Group();
      knee.position.set(0, -0.42, 0);
      hip.add(knee);
      add(new THREE.CylinderGeometry(r * 0.92, r * 0.85, 0.38, 7), legMat, 0, -0.19, 0, knee);
      add(new THREE.BoxGeometry(0.11, 0.07, 0.24), shoe, 0, -0.385, -0.04, knee);
      legs.push({ hip, knee });
    }
    if (outfit.skirt) add(new THREE.CylinderGeometry(0.15, 0.24, 0.42, 10), bottom, 0, 0.78, 0);
    // torso + collar
    add(new THREE.CylinderGeometry(0.2, 0.17, 0.6, 10), shirt, 0, 1.15, 0);
    add(new THREE.CylinderGeometry(0.11, 0.19, 0.08, 10), collar, 0, 1.47, 0);
    // neck + head + face
    add(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), skin, 0, 1.53, 0);
    const head = add(new THREE.SphereGeometry(0.135, 14, 12), skin, 0, 1.69, 0);
    head.scale.set(0.95, 1.1, 1);
    add(new THREE.SphereGeometry(0.018, 6, 5), eye, -0.048, 1.71, -0.122);
    add(new THREE.SphereGeometry(0.018, 6, 5), eye, 0.048, 1.71, -0.122);
    const mouth = add(new THREE.BoxGeometry(0.05, 0.012, 0.01), eye, 0, 1.635, -0.128);
    // hair
    const cap = add(new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, L.hair === "buzz" ? 1.2 : 1.55), hair, 0, 1.7, 0.01);
    cap.scale.set(1, 1.12, 1.05);
    if (L.hair === "long") add(new THREE.BoxGeometry(0.28, 0.32, 0.08), hair, 0, 1.56, 0.1);
    if (L.hair === "ponytail") { add(new THREE.SphereGeometry(0.05, 8, 6), hair, 0, 1.7, 0.16); add(new THREE.CylinderGeometry(0.04, 0.02, 0.22, 6), hair, 0, 1.58, 0.19); }
    if (L.hair === "bun") add(new THREE.SphereGeometry(0.07, 10, 8), hair, 0, 1.82, 0.1);
    // arms: pivot at the shoulder so a raised hand rotates naturally
    const arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.24, 1.4, 0);
      body.add(pivot);
      add(new THREE.CylinderGeometry(0.06, 0.055, 0.22, 7), shirt, 0, -0.11, 0, pivot);           // sleeve
      add(new THREE.CylinderGeometry(0.045, 0.04, 0.36, 7), skin, 0, -0.38, 0, pivot);            // forearm
      add(new THREE.SphereGeometry(0.05, 7, 6), skin, 0, -0.58, 0, pivot);                         // hand
      pivot.rotation.z = side * 0.08;
      arms.push(pivot);
    }

    let tag = null;
    const setName = (name, role) => {
      if (tag) { root.remove(tag); tag.material.map.dispose(); tag.material.dispose(); }
      if (opts.noTag) return;
      tag = nameTag(THREE, name, role);
      tag.position.set(0, 2.05, 0);
      body.add(tag);
    };
    setName(L.name, opts.role);

    let handTarget = 0, hand = 0, sitTarget = 0, sit = 0;
    root.userData = {
      look: L,
      setName,
      setHand: up => { handTarget = up ? 1 : 0; },
      setSitting: on => { sitTarget = on ? 1 : 0; },
      setTalking: level => { mouth.scale.y = 1 + Math.min(1, level) * 5; },
      tick: dt => {
        hand += (handTarget - hand) * Math.min(1, dt * 8);
        sit += (sitTarget - sit) * Math.min(1, dt * 6);
        body.position.y = -0.39 * sit;                 // hips drop to chair-seat height (~0.45 m)
        for (const l of legs) { l.hip.rotation.x = (Math.PI / 2) * sit; l.knee.rotation.x = -(Math.PI / 2) * sit; }
        arms[1].rotation.z = 0.08 + hand * 2.7;    // right arm up
        arms[1].rotation.x = -hand * 0.25;
      }
    };
    return root;
  }

  const api = { buildAvatar, shadowTexture, SKIN, HAIR_COLOR, OUTFITS, HAIR_STYLES, DEFAULT_LOOK };
  (typeof window !== "undefined" ? window : globalThis).Avatars = api;
})();
