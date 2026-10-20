// ============================================================================================
// INTERACTIONS — walk up to something and press E (or tap the prompt): doors, chalkboard, PDF slides,
// library books, canteen, school bell, water, flag, garden, basketball, stage, hand washing.
// Shared things (doors, board, slides, flag, bell) are synced to everyone in the class via multiplayer.js.
// Other modules can add their own entries with W.interact.add({ x, z, r, label, action }).
// ============================================================================================
const W = await new Promise(ok => window.__world ? ok(window.__world) : window.addEventListener("world-ready", () => ok(window.__world), { once: true }));
const { THREE, scene, me, spots } = W;
const t = s => (window.I18N ? window.I18N.t(s) : s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const done = id => W.questDone && W.questDone(id);
const sfx = name => W.sfx && W.sfx(name);
const mpSend = (type, data, target) => W.mpSend && W.mpSend(type, data, target);
const mpOn = (type, fn) => { (W.mpHandlers[type] = W.mpHandlers[type] || []).push(fn); };
const selfChar = () => W.player && W.player.self;
const canTeach = () => !W.mp || !W.mp.inRoom || W.mp.role === "teacher";

// ---------------------------------------------------------------- registry + prompt
const items = [];
W.interact = { add: it => { items.push(it); return it; }, items };
const prompt = document.createElement("button");
prompt.type = "button"; prompt.id = "use-prompt"; prompt.className = "card"; prompt.hidden = true;
prompt.innerHTML = `<kbd>E</kbd><span></span>`;
document.body.appendChild(prompt);
let current = null;
const isOpen = id => { const e = document.getElementById(id); return e && !e.hidden; };
const modalOpen = () => isOpen("ui-modal") || isOpen("mp-panel") || isOpen("dialog-box") || isOpen("guide");
W.hooks.push(() => {
  let best = null, bd = Infinity;
  if (!modalOpen()) {
    for (const it of items) {
      if (it.enabled && !it.enabled()) continue;
      const d = Math.hypot(it.x - me.x, it.z - me.z);
      if (d < (it.r || 1.6) && d < bd && Math.abs((me.y || 0) - (it.floor || 0)) < 1.2) { bd = d; best = it; }
    }
  }
  if (best !== current) { current = best; prompt.hidden = !best; }
  if (best) { const l = typeof best.label === "function" ? best.label() : best.label; if (prompt.lastChild.textContent !== l) prompt.lastChild.textContent = l; }
});
const use = () => { if (current && !modalOpen()) current.action(); };
prompt.addEventListener("click", use);
prompt.addEventListener("pointerdown", e => e.stopPropagation());
addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input, select, textarea")) return;
  if (e.code === "KeyE") use();
});

// ---------------------------------------------------------------- shared modal (books, canteen, board, slides)
const modal = document.createElement("div");
modal.id = "ui-modal"; modal.hidden = true;
modal.innerHTML = `<div class="ui-card card" role="dialog" aria-modal="true"><div class="ui-head"><h2></h2><button type="button" class="toggle ui-x">${t("Close")}</button></div><div class="ui-body"></div></div>`;
document.body.appendChild(modal);
const modalBody = modal.querySelector(".ui-body");
let onClose = null;
function openModal(title, build, wide) {
  modal.querySelector("h2").textContent = title;
  modal.querySelector(".ui-card").classList.toggle("wide", !!wide);
  modalBody.innerHTML = "";
  build(modalBody);
  modal.hidden = false;
  W.keys.clear();
  if (W.closePops) W.closePops();
}
function closeModal() { modal.hidden = true; if (onClose) { const f = onClose; onClose = null; f(); } }
modal.querySelector(".ui-x").addEventListener("click", closeModal);
modal.addEventListener("pointerdown", e => { e.stopPropagation(); if (e.target === modal) closeModal(); });
addEventListener("keydown", e => { if (e.code === "Escape" && !modal.hidden) closeModal(); });
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.forEach(k => n.append(k)); return n; };
const btn = (label, fn, cls = "toggle") => { const b = el("button", { type: "button", className: cls, textContent: label }); b.addEventListener("click", fn); return b; };
W.ui = { openModal, closeModal, el, btn, setOnClose: f => { onClose = f; } };

// ---------------------------------------------------------------- doors
const doorObjs = [];
W.doors.forEach((d, i) => {
  // one mesh per door (leaf + handles in the trim colour): each door is a single draw call
  const leafGeo = d.axis === "x" ? new THREE.BoxGeometry(d.w - 0.06, d.h - 0.02, 0.05) : new THREE.BoxGeometry(0.05, d.h - 0.02, d.w - 0.06);
  const handle = new THREE.BoxGeometry(d.axis === "x" ? 0.12 : 0.14, 0.035, d.axis === "x" ? 0.14 : 0.12);
  if (d.axis === "x") { leafGeo.translate((d.w - 0.06) / 2, d.h / 2, 0); handle.translate(d.w - 0.18, 1.0, 0); }
  else { leafGeo.translate(0, d.h / 2, (d.w - 0.06) / 2); handle.translate(0, 1.0, d.w - 0.18); }
  const leaf = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries([leafGeo.toNonIndexed(), handle.toNonIndexed()]), W.materials.trim);
  const pivot = new THREE.Group();
  pivot.position.set(d.axis === "x" ? d.x - d.w / 2 + 0.03 : d.x, 0, d.axis === "x" ? d.z : d.z - d.w / 2 + 0.03);
  pivot.add(leaf);
  scene.add(pivot);
  const openAngle = d.axis === "x" ? Math.PI * 0.48 : -Math.PI * 0.48;   // swings into the room
  const o = { d, pivot, open: !!d.open, angle: d.open ? openAngle : 0, openAngle };
  pivot.rotation.y = o.angle;
  doorObjs.push(o);
  const block = () => W.setBlocker("door" + i, o.open ? null
    : d.axis === "x" ? [d.x - d.w / 2, d.z - 0.12, d.x + d.w / 2, d.z + 0.12, 0, d.h] : [d.x - 0.12, d.z - d.w / 2, d.x + 0.12, d.z + d.w / 2, 0, d.h]);
  o.set = (open, remote) => { o.open = open; block(); sfx(open ? "doorOpen" : "doorClose"); if (!remote) mpSend("door", { i, open }); };
  block();
  W.interact.add({ x: d.x, z: d.z, r: 1.5, label: () => t(o.open ? "Close the door" : "Open the door"), action: () => o.set(!o.open) });
});
mpOn("door", m => { const o = doorObjs[m.i]; if (o && o.open !== m.open) o.set(m.open, true); });
W.hooks.push(dt => {
  const cam = W.camera.position;
  for (const o of doorObjs) {
    o.pivot.visible = !o.open || Math.hypot(o.d.x - cam.x, o.d.z - cam.z) < 30;   // a far-away open door, swung into its room, can't be seen
    const target = o.open ? o.openAngle : 0;
    if (Math.abs(o.angle - target) > 0.001) { o.angle += (target - o.angle) * Math.min(1, dt * 6); o.pivot.rotation.y = o.angle; }
  }
});

// ---------------------------------------------------------------- chalkboard (Classroom 1): draw, synced as strokes
const B = spots.board;
const boardCanvas = el("canvas", { width: 1024, height: 256 });
const bctx = boardCanvas.getContext("2d");
const boardTex = new THREE.CanvasTexture(boardCanvas);
boardTex.encoding = THREE.sRGBEncoding;
const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, depthWrite: false }));
boardMesh.position.set(B.x, B.y, B.boardZ + 0.006);
scene.add(boardMesh);
function drawStroke(s) {
  bctx.save();
  bctx.globalCompositeOperation = s.er ? "destination-out" : "source-over";
  bctx.strokeStyle = s.c; bctx.lineWidth = s.er ? 28 : 5; bctx.lineCap = bctx.lineJoin = "round"; bctx.globalAlpha = s.er ? 1 : 0.9;
  bctx.beginPath();
  s.pts.forEach(([x, y], k) => { const px = x * 1024, py = y * 256; k ? bctx.lineTo(px, py) : bctx.moveTo(px, py); });
  if (s.pts.length === 1) bctx.lineTo(s.pts[0][0] * 1024 + 0.1, s.pts[0][1] * 256);
  bctx.stroke(); bctx.restore();
  boardTex.needsUpdate = true;
}
const clearBoard = () => { bctx.clearRect(0, 0, 1024, 256); boardTex.needsUpdate = true; };
mpOn("stroke", s => drawStroke(s));
mpOn("boardClear", clearBoard);
W.interact.add({ x: B.x, z: B.z, r: B.r, label: () => t("Write on the chalkboard"), enabled: () => !slides.show, action: openBoard });
function openBoard() {
  openModal(t("Write on the chalkboard"), body => {
    // the editing canvas shows the board colour under the shared stroke layer
    const wrap = el("div", { className: "board-wrap" });
    const view = el("canvas", { width: 1024, height: 256, className: "board-canvas" });
    wrap.append(view);
    const vctx = view.getContext("2d");
    const redraw = () => { vctx.fillStyle = "#1f3d2c"; vctx.fillRect(0, 0, 1024, 256); vctx.drawImage(boardCanvas, 0, 0); };
    redraw();
    let color = "#f4f1e8", eraser = false, stroke = null;
    const pos = e => { const r = view.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    view.addEventListener("pointerdown", e => { view.setPointerCapture(e.pointerId); stroke = { c: color, er: eraser, pts: [pos(e)] }; drawStroke(stroke); redraw(); });
    view.addEventListener("pointermove", e => {
      if (!stroke) return;
      const p = pos(e), last = stroke.pts[stroke.pts.length - 1];
      if (Math.hypot(p[0] - last[0], (p[1] - last[1]) / 4) < 0.002) return;
      stroke.pts.push(p);
      drawStroke({ ...stroke, pts: [last, p] }); redraw();
    });
    const end = () => { if (!stroke) return; mpSend("stroke", stroke); stroke = null; done("board"); };
    view.addEventListener("pointerup", end); view.addEventListener("pointercancel", end);
    const tools = el("div", { className: "row" });
    const sw = [["#f4f1e8", t("Chalk")], ["#f6e27a", ""], ["#f2a7a0", ""], ["#9fd3f0", ""]];
    const toolBtns = [];
    sw.forEach(([c, label]) => {
      const b = btn(label || " ", () => { color = c; eraser = false; mark(b); }, "toggle swatch-btn");
      b.style.borderLeft = `14px solid ${c}`;
      toolBtns.push(b); tools.append(b);
    });
    const er = btn(t("Eraser"), () => { eraser = true; mark(er); }); toolBtns.push(er); tools.append(er);
    const mark = b => toolBtns.forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    mark(toolBtns[0]);
    tools.append(btn(t("Clear"), () => { clearBoard(); redraw(); mpSend("boardClear", {}); }), btn(t("Done"), closeModal, "primary"));
    body.append(wrap, tools);
  }, true);
}

// ---------------------------------------------------------------- slides: a PDF on the classroom screen (pdf.js, loaded on demand)
const slides = { show: false, doc: null, page: 1, pages: 0 };
const slideCanvas = el("canvas", { width: 1600, height: 900 });
const slideTex = new THREE.CanvasTexture(slideCanvas);
slideTex.encoding = THREE.sRGBEncoding;
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.7), new THREE.MeshBasicMaterial({ map: slideTex }));
screenMesh.position.set(B.x, 1.75, B.boardZ + 0.012);
screenMesh.visible = false;
scene.add(screenMesh);
const slideBar = el("div", { id: "slide-bar", className: "card", hidden: true });
document.body.append(slideBar);
let pdfjs = null;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  await new Promise((ok, fail) => {
    const s = el("script", { src: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" });
    s.onload = ok; s.onerror = fail; document.head.append(s);
  });
  pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return pdfjs;
}
async function openPdf(bytes) {
  const lib = await loadPdfJs();
  slides.doc = await lib.getDocument({ data: bytes }).promise;
  slides.pages = slides.doc.numPages;
  await showPage(1);
}
async function showPage(n) {
  if (!slides.doc) return;
  slides.page = Math.max(1, Math.min(slides.pages, n));
  const page = await slides.doc.getPage(slides.page);
  const v0 = page.getViewport({ scale: 1 });
  const scale = Math.min(1600 / v0.width, 900 / v0.height);
  const vp = page.getViewport({ scale });
  const g = slideCanvas.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 1600, 900);
  const tmp = el("canvas", { width: Math.round(vp.width), height: Math.round(vp.height) });
  await page.render({ canvasContext: tmp.getContext("2d"), viewport: vp }).promise;
  g.drawImage(tmp, (1600 - tmp.width) / 2, (900 - tmp.height) / 2);
  slideTex.needsUpdate = true;
  slides.show = true; screenMesh.visible = true;
  renderBar();
}
function hideSlides(remote) { slides.show = false; screenMesh.visible = false; renderBar(); if (!remote) mpSend("slide", { hide: true }); }
function renderBar() {
  slideBar.innerHTML = "";
  slideBar.hidden = !slides.show || !canTeach();
  if (slideBar.hidden) return;
  const go = d => { showPage(slides.page + d); mpSend("slide", { page: slides.page + d }); };
  slideBar.append(btn("‹ " + t("Previous"), () => go(-1)), el("span", { textContent: ` ${slides.page} / ${slides.pages} ` }), btn(t("Next") + " ›", () => go(1)), btn(t("Hide slides"), () => hideSlides()));
}
addEventListener("keydown", e => {
  if (!slides.show || !canTeach() || (e.target.closest && e.target.closest("input, select, textarea"))) return;
  if (e.code === "PageDown" || e.code === "BracketRight") { showPage(slides.page + 1); mpSend("slide", { page: slides.page + 1 }); }
  if (e.code === "PageUp" || e.code === "BracketLeft") { showPage(slides.page - 1); mpSend("slide", { page: slides.page - 1 }); }
});
// PDF bytes travel as base64 text so they work with any data channel; capped at 12 MB
const toB64 = buf => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
mpOn("pdf", async (m, id, peer) => { if (peer && peer.role === "teacher") { await openPdf(fromB64(m.b64)); W.toast(`${peer.look.name}: ${m.name}`); } });
mpOn("slide", (m, id, peer) => { if (!peer || peer.role !== "teacher") return; if (m.hide) hideSlides(true); else showPage(m.page); });
W.interact.add({
  x: spots.lectern.x, z: spots.lectern.z, r: spots.lectern.r, label: () => t("Show slides (PDF)"), enabled: canTeach,
  action: () => openModal(t("Show slides (PDF)"), body => {
    const input = el("input", { type: "file", accept: "application/pdf" });
    const note = el("p", { className: "muted", textContent: W.mp && W.mp.inRoom ? "Everyone in the class will see the slides." : "Only you can see the slides until you join a class as the teacher." });
    input.addEventListener("change", async () => {
      const f = input.files[0];
      if (!f) return;
      if (f.size > 12e6) { note.textContent = "That PDF is larger than 12 MB."; return; }
      const buf = await f.arrayBuffer();
      note.textContent = "Loading…";
      try {
        await openPdf(new Uint8Array(buf.slice(0)));
        lastPdf = { name: f.name, b64: toB64(buf) };
        mpSend("pdf", lastPdf);
        closeModal();
      } catch (e) { note.textContent = "Couldn't open that PDF."; console.warn(e); }
    });
    body.append(el("label", { className: "file-pick", textContent: t("Choose a PDF") + " " }, input), note);
  })
});

// ---------------------------------------------------------------- library books (original short texts)
const BOOKS = [
  { title: "Ang Alamat ng Pinya", pages: [
    "Noong unang panahon, may isang batang babae na nagngangalang Pina. Mabait siya pero tamad tumulong sa bahay.",
    "Tuwing uutusan siya ng kanyang ina na maghanap ng gamit, lagi niyang sinasabi: “Hindi ko po makita!” kahit hindi naman siya talagang naghahanap.",
    "Isang araw, napagod ang kanyang ina at nasabi: “Sana'y magkaroon ka ng maraming mata para makita mo ang lahat!”",
    "Kinabukasan, wala na si Pina. Sa bakuran ay may tumubong kakaibang halaman na may bungang punô ng “mata.” Tinawag nila itong pinya. Aral: tumulong nang buong-puso."
  ] },
  { title: "The Water Cycle", pages: [
    "The sun warms the sea, rivers and lakes. Some of the water turns into an invisible gas called water vapour. This is evaporation.",
    "High in the sky the air is cool. The vapour turns back into tiny droplets that gather into clouds. This is condensation.",
    "When the droplets join and grow heavy, they fall as rain. This is precipitation. In the Philippines, the rainy season brings most of it from June to November.",
    "Rain flows into rivers and soaks into the ground, and the cycle starts again. Save water: turn off the tap while you brush your teeth!"
  ] },
  { title: "José Rizal", pages: [
    "José Rizal was born on 19 June 1861 in Calamba, Laguna. He is one of the national heroes of the Philippines.",
    "He studied medicine and became an eye doctor. He also wrote poems and spoke many languages.",
    "His novels Noli Me Tángere and El Filibusterismo showed the injustice of colonial rule and inspired Filipinos to seek reform.",
    "He died on 30 December 1896 in Bagumbayan, now Rizal Park. Every 30 December is Rizal Day. He believed that education is the key to a better nation."
  ] },
  { title: "Bayanihan", pages: [
    "Bayanihan means working together as a community. The word comes from “bayan” — town or nation.",
    "In the old picture of bayanihan, neighbours lift a whole bahay kubo on bamboo poles and carry it to a new place, while the family thanks them with food.",
    "Today bayanihan happens when people help after a typhoon, clean the barangay, or share what they have.",
    "At school, bayanihan is helping a classmate, keeping the room clean, and caring for the garden together."
  ] }
];
W.interact.add({ x: spots.shelf.x, z: spots.shelf.z, r: spots.shelf.r, label: () => t("Read a book"), action: () => openModal(t("Read a book"), body => {
  const list = el("div", { className: "book-list" });
  BOOKS.forEach(b => list.append(btn("📖 " + b.title, () => readBook(b))));
  body.append(list);
}) });
function readBook(b) {
  let p = 0;
  openModal(b.title, body => {
    const page = el("div", { className: "book-page" });
    const nav = el("div", { className: "row" });
    const render = () => {
      page.textContent = b.pages[p];
      nav.innerHTML = "";
      nav.append(btn("‹ " + t("Back"), () => { p = Math.max(0, p - 1); render(); sfx("page"); }), el("span", { className: "muted", textContent: ` ${p + 1} / ${b.pages.length} ` }),
        p < b.pages.length - 1 ? btn(t("Next") + " ›", () => { p++; render(); sfx("page"); }) : btn(t("Done"), closeModal, "primary"));
      if (p === b.pages.length - 1) done("library");
    };
    render();
    body.append(page, nav);
  });
}

// ---------------------------------------------------------------- canteen: a daily allowance of ₱50
const MENU = [["Turon", 15, "🍌"], ["Banana cue", 20, "🍢"], ["Pandesal (3 pcs)", 10, "🍞"], ["Puto", 10, "🍰"], ["Buko juice", 20, "🥥"], ["Bottled water", 15, "💧"]];
const today = () => new Date().toISOString().slice(0, 10);
const wallet = () => { const w = store.get("world.wallet", null); return w && w.day === today() ? w : { day: today(), left: 50 }; };
W.interact.add({ x: spots.canteen.x, z: spots.canteen.z, r: spots.canteen.r, label: () => t("Buy a snack"), action: () => openModal(t("Canteen"), body => {
  const w = wallet();
  const head = el("p", { className: "muted", textContent: `${t("Your allowance today")}: ₱${w.left}` });
  const grid = el("div", { className: "menu-grid" });
  MENU.forEach(([name, price, icon]) => grid.append(btn(`${icon} ${name} — ₱${price}`, () => {
    const cur = wallet();
    if (cur.left < price) { head.textContent = t("Not enough money left today"); return; }
    cur.left -= price; store.set("world.wallet", cur);
    sfx("coin"); closeModal();
    const c = selfChar(); if (c) c.userData.pickup();
    W.toast(`${icon} ${name}! ₱${cur.left} left`);
    done("canteen");
  })));
  body.append(head, grid);
}) });

// ---------------------------------------------------------------- bell, water, hand washing, stage
W.interact.add({ x: spots.bell.x, z: spots.bell.z, r: spots.bell.r, label: () => t("Ring the school bell"), action: () => {
  sfx("bell"); mpSend("bell", {}); W.toast(t("Ding! Ding! Ding!")); const c = selfChar(); if (c) c.userData.interact(); done("bell");
} });
mpOn("bell", () => sfx("bell"));
for (const k of Object.keys(spots).filter(k => k.startsWith("dispenser"))) {
  const s = spots[k];
  W.interact.add({ x: s.x, z: s.z, r: s.r, label: () => t("Drink water"), action: () => { const c = selfChar(); if (c) c.userData.interact(); sfx("gulp"); W.toast("💧 " + t("Refreshing!")); } });
}
for (const s of [spots.cr, { x: -10, z: 14.3, r: 1.8 }, { x: -53.5, z: 8.4, r: 1.8 }]) {
  W.interact.add({ x: s.x, z: s.z, r: s.r, label: () => t("Wash your hands"), action: () => { const c = selfChar(); if (c) c.userData.interact(); sfx("splash"); W.toast("🧼 20 seconds — good job!"); } });
}
W.interact.add({ x: spots.stage.x, z: spots.stage.z, r: spots.stage.r, floor: 1, label: () => t("Perform on stage"), action: () => { if (W.emote) W.emote("dance"); sfx("applause"); } });

// ---------------------------------------------------------------- flag: raise / lower the plaza flag (starts lowered for the morning ceremony)
const F = spots.flag;
const flagMeshes = [];
scene.traverse(o => { if (o.userData && o.userData.flag && Math.abs(o.position.x - 0.75) < 0.1 && Math.abs(o.position.z - 10) < 0.1) flagMeshes.push(o); });
const flag = { up: false, y: F.bottom };
const setFlagY = y => flagMeshes.forEach(m => { m.position.y = y; });
setFlagY(flag.y);
W.hooks.push(dt => {
  const target = flag.up ? F.top : F.bottom;
  if (Math.abs(flag.y - target) > 0.001) { flag.y += Math.sign(target - flag.y) * Math.min(Math.abs(target - flag.y), dt * 1.1); setFlagY(flag.y); }
});
const setFlag = (up, remote) => { flag.up = up; if (!remote) mpSend("flag", { up }); if (up) { sfx("anthemDrum"); done("flag"); } };
mpOn("flag", m => setFlag(m.up, true));
W.interact.add({ x: F.x, z: F.z, r: F.r, label: () => t(flag.up ? "Lower the flag" : "Raise the flag"), action: () => { const c = selfChar(); if (c) c.userData.interact(); setFlag(!flag.up); } });

// ---------------------------------------------------------------- garden: water three beds
const watered = new Set();
Object.keys(spots).filter(k => k.startsWith("bed")).forEach(k => {
  const s = spots[k];
  W.interact.add({ x: s.x, z: s.z, r: s.r, label: () => t("Water the plants"), action: () => {
    const c = selfChar(); if (c) c.userData.interact();
    sfx("splash"); splash(s.x, s.z - 1.3);
    watered.add(k);
    // real crops grow a stage each time they're watered (nature.js)
    const grew = W.nature && W.nature.growBed ? W.nature.growBed(s.bed) : 0;
    W.toast(`🌱 ${t("The plants look happy.")}${grew ? ` ⬆ ${grew}/4` : ""} (${Math.min(3, watered.size)}/3)`);
    if (watered.size >= 3) done("garden");
  } });
});
// a few droplets falling on the bed
const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025, 5, 4), new THREE.MeshBasicMaterial({ color: 0x9fd3f0 }), 40);
drops.frustumCulled = false; drops.visible = false; scene.add(drops);
let dropT = -1, dropAt = null;
const dm = new THREE.Object3D();
function splash(x, z) { dropT = 0; dropAt = { x, z }; drops.visible = true; }
W.hooks.push(dt => {
  if (dropT < 0) return;
  dropT += dt;
  for (let i = 0; i < 40; i++) {
    const ph = (i * 0.37) % 1, life = (dropT * 1.6 + ph) % 1;
    dm.position.set(dropAt.x + Math.sin(i * 12.9) * 1.6, 1.3 - life * 0.9, dropAt.z + Math.cos(i * 7.3) * 0.5);
    dm.updateMatrix(); drops.setMatrixAt(i, dm.matrix);
  }
  drops.instanceMatrix.needsUpdate = true;
  if (dropT > 1.6) { dropT = -1; drops.visible = false; }
});

// ---------------------------------------------------------------- basketball: pick up a ball and carry it
let ball = null;
W.interact.add({ x: spots.court.x, z: spots.court.z, r: spots.court.r, enabled: () => !!selfChar(), label: () => t(ball ? "Drop the ball" : "Grab a ball"), action: () => {
  const c = selfChar();
  if (ball) { scene.attach(ball); ball.position.y = 0.12; ball = null; return; }
  const hand = c.getObjectByName("hand_r");
  if (!hand) return;
  ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), W.materials.pot);
  scene.add(ball);
  hand.attach(ball);
  ball.position.set(0, 0.12 / hand.getWorldScale(new THREE.Vector3()).x, 0);
  c.userData.pickup();
} });

// ---------------------------------------------------------------- catch up people who join later
let lastPdf = null;   // { name, b64 } of the slides this teacher showed
mpOn("pdf", m => { lastPdf = m; });
(W.peerJoinHooks = W.peerJoinHooks || []).push(id => {
  doorObjs.forEach((o, i) => { if (o.open !== !!o.d.open) mpSend("door", { i, open: o.open }, id); });
  if (flag.up) mpSend("flag", { up: true }, id);
  if (canTeach() && slides.show && lastPdf) { mpSend("pdf", lastPdf, id); mpSend("slide", { page: slides.page }, id); }
});

// language for text created above
if (window.I18N) window.I18N.apply(modal);
