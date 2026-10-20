// ============================================================================================
// FIRST-DAY TASKS — a short orientation checklist. Other modules call W.questDone(id); a few tasks
// are checked here from where you are. Progress is saved on the device. The next task is pinned
// on the mini-map (W.quests.next()).
// ============================================================================================
const W = await new Promise(ok => window.__world ? ok(window.__world) : window.addEventListener("world-ready", () => ok(window.__world), { once: true }));
const { me, spots } = W;
const t = s => (window.I18N ? window.I18N.t(s) : s);

const TASKS = [
  { id: "guard", text: "Talk to the guard at the gate", at: [4.3, 65.4] },
  { id: "flag", text: "Raise the flag at the flag plaza", at: [spots.flag.x, spots.flag.z] },
  { id: "seat", text: "Find Classroom 1 and sit at a desk", at: [-23, -17.4] },
  { id: "board", text: "Write on the chalkboard", at: [spots.board.x, spots.board.z] },
  { id: "library", text: "Borrow a book at the library", at: [spots.shelf.x, spots.shelf.z] },
  { id: "canteen", text: "Buy a snack at the canteen", at: [spots.canteen.x, spots.canteen.z] },
  { id: "garden", text: "Water the vegetable garden", at: [-6, -35.5] },
  { id: "bell", text: "Ring the school bell", at: [spots.bell.x, spots.bell.z] },
  { id: "lab", text: "Explore the Science Lab", at: [5, -22] },
  { id: "principal", text: "Visit the principal", at: [11.5, -43.4] }
];
let state = {};
try { state = JSON.parse(localStorage.getItem("world.quests") || "{}"); } catch (e) { /* ignore */ }
const save = () => { try { localStorage.setItem("world.quests", JSON.stringify(state)); } catch (e) { /* ignore */ } };
const count = () => TASKS.filter(q => state[q.id]).length;

// ---------------------------------------------------------------- dock button + list
const btn = document.createElement("button");
btn.type = "button"; btn.className = "icon-btn"; btn.id = "tasks-btn"; btn.title = "Tasks (J)";
btn.setAttribute("aria-expanded", "false");
document.querySelector(".dock").insertBefore(btn, document.querySelector(".dock .chip"));
const pop = document.createElement("div");
pop.id = "tasks-pop"; pop.className = "card pop"; pop.hidden = true;
document.body.appendChild(pop);
function render() {
  btn.innerHTML = `📋 <span>${t("Tasks")}</span> <b class="count">${count()}/${TASKS.length}</b>`;
  pop.innerHTML = `<h4>${t("First-day tasks")}</h4>`;
  const ol = document.createElement("ol"); ol.className = "tasks";
  TASKS.forEach(q => {
    const li = document.createElement("li");
    li.className = state[q.id] ? "done" : "";
    li.innerHTML = `<span class="tick">${state[q.id] ? "✓" : ""}</span>`;
    li.append(t(q.text));
    ol.append(li);
  });
  pop.append(ol);
  if (count() === TASKS.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = t("All tasks done — welcome to Katuro University!"); pop.append(p); }
  const reset = document.createElement("button"); reset.type = "button"; reset.className = "toggle"; reset.textContent = t("Reset tasks");
  reset.addEventListener("click", () => { state = {}; save(); render(); });
  pop.append(reset);
}
const toggle = open => {
  pop.hidden = !(open ?? pop.hidden);
  btn.setAttribute("aria-expanded", String(!pop.hidden));
  if (!pop.hidden && W.closePops) { W.closePops(); pop.hidden = false; btn.setAttribute("aria-expanded", "true"); }
};
btn.addEventListener("click", () => toggle());
addEventListener("keydown", e => { if (e.code === "KeyJ" && !(e.target.closest && e.target.closest("input, select, textarea"))) toggle(); if (e.code === "Escape") toggle(false); });
addEventListener("pointerdown", e => { if (!pop.contains(e.target) && !btn.contains(e.target)) toggle(false); });
render();

// ---------------------------------------------------------------- completing tasks
W.questDone = id => {
  const q = TASKS.find(x => x.id === id);
  if (!q || state[id]) return;
  state[id] = Date.now(); save(); render();
  if (W.sfx) W.sfx("chime");
  W.toast(`✓ ${t("Task done")}: ${t(q.text)} (${count()}/${TASKS.length})`, 3500);
  btn.classList.remove("pulse"); void btn.offsetWidth; btn.classList.add("pulse");
  if (count() === TASKS.length) setTimeout(() => { confetti(); W.toast("🎉 " + t("All tasks done — welcome to Katuro University!"), 6000); }, 1200);
};
W.quests = { allDone: () => count() === TASKS.length, next: () => TASKS.find(q => !state[q.id]) || null, tasks: TASKS, state: () => state };
// tasks that depend on where you are
let checkT = 0;
W.hooks.push(dt => {
  checkT += dt; if (checkT < 0.5) return; checkT = 0;
  if (!state.seat && me.sitting && W.area() === "Classroom 1") W.questDone("seat");
});

// ---------------------------------------------------------------- confetti (DOM, no 3D cost)
function confetti() {
  const layer = document.createElement("div"); layer.className = "confetti";
  const colors = ["#7cc4a0", "#f6e27a", "#f2a7a0", "#9fd3f0", "#ffffff", "#ce1126", "#0038a8"];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.8 + "s";
    p.style.animationDuration = 2.2 + Math.random() * 1.6 + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4800);
}
