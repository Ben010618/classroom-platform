// ============================================================================================
// MINI-MAP — top-right, north up (−Z). Buildings, paths, you (arrow), classmates, staff and a pin
// on your next task. Tap it for the whole campus; tap a place there to go to it.
// Drawn on a 2D canvas a few times a second: no cost to the 3D scene.
// ============================================================================================
const W = await new Promise(ok => window.__world ? ok(window.__world) : window.addEventListener("world-ready", () => ok(window.__world), { once: true }));
const { me, places } = W;
const t = s => (window.I18N ? window.I18N.t(s) : s);
const COL = { plaza: "#c9c3b4", path: "#b8ab92", court: "#3f7f9f", garden: "#7a5a3e", building: "#efe2c0", grass: "#79a85c", line: "rgba(0,0,0,0.35)" };
const ORDER = ["plaza", "path", "court", "garden", "building"];
const shapes = ORDER.flatMap(k => W.map.filter(s => s.kind === k));

let on = true;
try { on = localStorage.getItem("world.minimap") !== "0"; } catch (e) { /* ignore */ }
const wrap = document.createElement("button");
wrap.type = "button"; wrap.id = "minimap"; wrap.title = t("Map");
const cv = document.createElement("canvas");
wrap.append(cv);
document.body.append(wrap);
wrap.addEventListener("pointerdown", e => e.stopPropagation());
wrap.addEventListener("click", openFull);

const settingsBtn = document.createElement("button");
settingsBtn.type = "button"; settingsBtn.className = "toggle"; settingsBtn.id = "minimap-btn";
const label = () => { settingsBtn.textContent = t(on ? "Mini-map: on" : "Mini-map: off"); settingsBtn.setAttribute("aria-pressed", String(on)); wrap.hidden = !on; };
settingsBtn.addEventListener("click", () => { on = !on; try { localStorage.setItem("world.minimap", on ? "1" : "0"); } catch (e) { /* ignore */ } label(); });
document.getElementById("settings").append(settingsBtn);
label();

// draw the campus into ctx: world point (x, z) → screen (cx + (x − ox)·s, cy + (z − oz)·s)
function draw(ctx, w, h, ox, oz, s, opts = {}) {
  const X = x => w / 2 + (x - ox) * s, Y = z => h / 2 + (z - oz) * s;
  ctx.fillStyle = COL.grass; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(60,60,60,0.6)"; ctx.lineWidth = Math.max(1, s * 0.15);
  ctx.strokeRect(X(-70), Y(-70), 140 * s, 140 * s);   // fence
  for (const r of shapes) {
    ctx.fillStyle = COL[r.kind];
    ctx.fillRect(X(r.x0), Y(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    if (r.kind === "building") { ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.strokeRect(X(r.x0), Y(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s); }
  }
  if (opts.labels) {
    ctx.font = "600 12px Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const p of Object.values(places)) {
      const x = X(p.x), y = Y(p.z);
      ctx.fillStyle = "rgba(15,21,18,0.75)";
      const tw = ctx.measureText(t(p.label)).width + 10;
      ctx.fillRect(x - tw / 2, y - 9, tw, 18);
      ctx.fillStyle = "#fff"; ctx.fillText(t(p.label), x, y);
    }
  }
  // staff (yellow) + walking students (white), classmates (blue)
  for (const n of W.npcs || []) { ctx.fillStyle = n.walker ? "#ffffff" : "#f6d84a"; dot(ctx, X(n.c.position.x), Y(n.c.position.z), 3); }
  for (const p of (W.peers ? W.peers.values() : [])) if (p.pose) { ctx.fillStyle = "#5aa9ff"; dot(ctx, X(p.pose.x), Y(p.pose.z), 4); }
  // next task pin (pulsing)
  const q = W.quests && W.quests.next();
  if (q) {
    const r = 5 + Math.sin(performance.now() / 250) * 1.5;
    ctx.fillStyle = "#e5484d"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(q.at[0]), Y(q.at[1]), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // you: an arrow pointing where the camera looks
  const yaw = me.yaw;
  ctx.save(); ctx.translate(X(me.x), Y(me.z)); ctx.rotate(-yaw);
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#0f1512"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
const dot = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

let acc = 0;
W.hooks.push(dt => {
  if (!on) return;
  acc += dt; if (acc < 0.08) return; acc = 0;
  const size = wrap.clientWidth, dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== size * dpr) { cv.width = cv.height = size * dpr; }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(ctx, size, size, me.x, me.z, size / 80);   // ~80 m across
});

// ---------------------------------------------------------------- full campus map
function openFull() {
  if (!W.ui) return;
  W.ui.openModal(t("Map"), body => {
    const c = document.createElement("canvas");
    c.className = "full-map";
    body.append(c);
    const hint = document.createElement("p"); hint.className = "muted"; hint.textContent = "Tap a place to go there.";
    body.append(hint);
    requestAnimationFrame(() => {
      const size = Math.min(c.clientWidth, 620), dpr = Math.min(2, devicePixelRatio || 1);
      c.width = c.height = size * dpr; c.style.height = size + "px";
      const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = size / 146;
      draw(ctx, size, size, 0, 0, s, { labels: true });
      c.addEventListener("click", e => {
        const r = c.getBoundingClientRect();
        const wx = (e.clientX - r.left - r.width / 2) / (r.width / 146), wz = (e.clientY - r.top - r.height / 2) / (r.width / 146);
        let best = null, bd = 12;
        for (const [k, p] of Object.entries(places)) { const d = Math.hypot(p.x - wx, p.z - wz); if (d < bd) { bd = d; best = k; } }
        if (best) { W.go(best); W.ui.closeModal(); }
      });
    });
  }, true);
}
