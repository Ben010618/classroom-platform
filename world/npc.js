// ============================================================================================
// PEOPLE IN THE SCHOOL — staff at their posts who talk to you (E), and students walking around.
// HD characters on Medium/High devices, light avatars on Low. Far-away people are hidden and not
// animated, so they cost nothing when you're not near them.
// ============================================================================================
const W = await new Promise(ok => window.__world ? ok(window.__world) : window.addEventListener("world-ready", () => ok(window.__world), { once: true }));
const { THREE, scene, me } = W;
const t = s => (window.I18N ? window.I18N.t(s) : s);
const fil = () => window.I18N && window.I18N.lang === "fil";
const hd = W.device.tier !== "low" && !W.simple && !!window.Characters;
if (hd && !window.Characters.ready()) await new Promise(ok => window.addEventListener("characters-ready", ok, { once: true }));
while (!W.interact) await new Promise(ok => setTimeout(ok, 50));   // interact.js is a separate module

// Each line is [English, Filipino]. `quest` is completed when you finish talking.
const STAFF = [
  { id: "guard", name: "Mang Ben", x: 4.3, z: 66.2, face: [-1, 0], look: { body: "male", skin: "d", hair: "buzz", hairColor: "black", outfit: "guard" }, quest: "guard",
    lines: [["Magandang umaga! Welcome to Katuro University.", "Magandang umaga! Maligayang pagdating sa Katuro University."],
      ["Always wear your school ID — it's on your lanyard.", "Laging isuot ang iyong ID — nasa lanyard mo ito."],
      ["Press J to see your first-day tasks, and G to go anywhere quickly.", "Pindutin ang J para sa mga gawain, at G para pumunta kahit saan."],
      ["The flag ceremony is at the flag plaza. Can you raise the flag?", "Ang flag ceremony ay sa plasa. Kaya mo bang itaas ang watawat?"]] },
  { id: "vendor", name: "Aling Nena", x: -49, z: -1.35, face: [0, 1], look: { model: "w-casual", body: "female", skin: "c", hair: "bun", hairColor: "brown", outfit: "vendor" },
    lines: [["Ano'ng sa 'yo? The turon is fresh!", "Ano'ng sa 'yo? Bagong luto ang turon!"],
      ["You get ₱50 allowance a day. Spend it wisely!", "May ₱50 kang baon araw-araw. Gastusin nang tama!"],
      ["Press E at the counter to buy.", "Pindutin ang E sa counter para bumili."]] },
  { id: "librarian", name: "Ms. Reyes", x: -47, z: -23.1, face: [0, 1], role: "teacher", look: { model: "w-formal", body: "female", skin: "b", hair: "long", hairColor: "black", outfit: "teacher" },
    lines: [["Shh… welcome to the library.", "Shh… maligayang pagdating sa silid-aklatan."],
      ["The shelves by the west wall have stories and science books. Press E there to read.", "May mga kuwento at aklat sa agham sa mga estante sa kanluran. Pindutin ang E para magbasa."]] },
  { id: "principal", name: "Dr. Cruz", x: 11.5, z: -44.35, face: [0, 1], role: "teacher", look: { model: "m-suit", body: "male", skin: "c", hair: "short", hairColor: "gray", outfit: "teacher" }, quest: "principal",
    lines: [["Welcome to my office! I'm the principal of Katuro University.", "Maligayang pagdating! Ako ang punong-guro ng Katuro University."],
      ["Our school values are Excellence, Service and Bayanihan.", "Ang aming mga pagpapahalaga: Kahusayan, Paglilingkod at Bayanihan."],
      ["Finish your first-day tasks, and come back to tell me!", "Tapusin ang iyong mga gawain at bumalik ka rito!"]],
    after: [["You finished every task. Congratulations, and welcome to the family!", "Natapos mo lahat ng gawain. Binabati kita, at welcome sa pamilya!"]] },
  { id: "gardener", name: "Mang Tonyo", x: -10.5, z: -33.6, face: [0, -1], look: { model: "m-farmer", body: "male", skin: "e", hair: "short", hairColor: "gray", outfit: "pe" },
    lines: [["This is our Gulayan sa Paaralan — tomatoes, pechay, corn, kalabasa, carrots and watermelon.", "Ito ang Gulayan sa Paaralan — kamatis, pechay, mais, kalabasa, karot at pakwan."],
      ["Help me water three beds. Walk up to a bed and press E — watch them grow!", "Tulungan mo akong diligan ang tatlong kama. Lumapit at pindutin ang E — panoorin silang lumaki!"]] },
  { id: "maintenance", name: "Kuya Jun", x: 36.2, z: -14.5, face: [1, 0.4], look: { model: "m-worker", body: "male", skin: "d", hair: "buzz", hairColor: "black", outfit: "casual" },
    lines: [["Magandang araw! I keep the court and the grounds clean.", "Magandang araw! Ako ang naglilinis ng court at ng bakuran."],
      ["Remember: biodegradable in green, recyclable in blue, residual in red.", "Tandaan: nabubulok sa berde, nare-recycle sa asul, at iba pa sa pula."],
      ["You can grab a basketball from the rack and play!", "Puwede kang kumuha ng bola sa lalagyan at maglaro!"]] },
  { id: "science", name: "Mr. Santos", x: 5, z: -22.9, face: [0, 1], role: "teacher", look: { body: "male", skin: "b", hair: "short", hairColor: "black", outfit: "teacher" }, quest: "lab",
    lines: [["Welcome to the Science Lab! Safety first: no running, and never taste anything.", "Maligayang pagdating sa laboratoryo! Kaligtasan muna: bawal tumakbo at tumikim."],
      ["Each bench has two microscopes. Next week we'll look at onion cells.", "May dalawang mikroskopyo ang bawat mesa. Sa susunod, titingnan natin ang selula ng sibuyas."]] }
];
// Students on walking loops (x, z waypoints)
const WALKERS = [
  { name: "Jessa", look: { body: "female", skin: "c", hair: "ponytail", hairColor: "black", outfit: "blouse", bag: true, bagColor: "#d0708a" },
    path: [[-6, 20], [6, 20], [10, 14], [10, 2], [-10, 2], [-10, 14]] },
  { name: "Paolo", look: { body: "male", skin: "d", hair: "short", hairColor: "black", outfit: "polo", bag: true, bagColor: "#26292b" },
    path: [[-1, 50], [-1, 22], [-20, 1], [-36, 0.5], [-20, 1], [-1, 22]] },
  { name: "Kim", look: { body: "female", skin: "b", hair: "short", hairColor: "brown", outfit: "pe" },
    path: [[33, 4], [42, -2], [50, -10], [62, -6], [50, 2], [42, 4]] },
  { name: "Marco", look: { model: "m-hoodie", body: "male", skin: "c", hair: "short", hairColor: "black", outfit: "casual" },
    path: [[-30, 10], [-22, 15], [-10, 19], [-22, 15]] },
  { name: "Bea", look: { model: "w-casual", body: "female", skin: "a", hair: "long", hairColor: "black", outfit: "casual" },
    path: [[-1.5, 60], [-1.5, 40], [1.5, 30], [1.5, 50]] }
];

const make = (look, name, role) => {
  const L = { bag: false, ...look, name };   // only students carry backpacks
  return hd ? window.Characters.create(THREE, L, { role }) : window.Avatars.buildAvatar(THREE, L, { role });
};
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
const people = [];
for (const s of STAFF) {
  const c = make(s.look, s.name, s.role);
  c.position.set(s.x, 0, s.z);
  c.rotation.y = yawOf(s.face[0], s.face[1]);
  scene.add(c);
  const p = { ...s, c, homeYaw: c.rotation.y, yaw: c.rotation.y, talk: 0 };
  people.push(p);
  W.setBlocker("npc-" + s.id, [s.x - 0.25, s.z - 0.25, s.x + 0.25, s.z + 0.25, 0, 1.8]);
  W.interact.add({ x: s.x + s.face[0] * 0.8, z: s.z + s.face[1] * 0.8, r: 1.9, label: () => `${t("Talk")}: ${s.name}`, action: () => talk(p) });
}
// light avatars (Simple graphics / Low devices) are ~15 draw calls each: only the staff at their posts there
for (const w of hd ? WALKERS : []) {
  const c = make(w.look, w.name);
  c.position.set(w.path[0][0], 0, w.path[0][1]);
  scene.add(c);
  people.push({ ...w, c, walker: true, leg: 0, pause: 0, waved: 0 });
}
W.npcs = people;

// ---------------------------------------------------------------- dialogue box
const box = document.createElement("div");
box.id = "dialog-box"; box.className = "card"; box.hidden = true;
box.innerHTML = `<b></b><p></p><div class="row"><button type="button" class="primary" data-next></button></div>`;
document.body.appendChild(box);
box.addEventListener("pointerdown", e => e.stopPropagation());
let talking = null, lineIx = 0;
function talk(p) {
  const allDone = W.quests && W.quests.allDone();
  p.script = allDone && p.after ? p.after : p.lines;
  talking = p; lineIx = 0;
  if (p.c.userData.emote && lineIx === 0) p.c.userData.emote("wave");
  show();
}
function show() {
  const p = talking, line = p.script[lineIx];
  box.querySelector("b").textContent = p.name;
  box.querySelector("p").textContent = fil() ? line[1] : line[0];
  const last = lineIx >= p.script.length - 1;
  box.querySelector("[data-next]").textContent = last ? t("Close") : t("Next") + " ›";
  box.hidden = false;
  p.c.userData.setTalking(1);
  clearTimeout(show.t); show.t = setTimeout(() => p.c.userData.setTalking(0), 1800);
}
function next() {
  if (!talking) return;
  if (lineIx < talking.script.length - 1) { lineIx++; show(); return; }
  if (talking.quest && W.questDone) W.questDone(talking.quest);
  talking.c.userData.setTalking(0);
  talking = null; box.hidden = true;
}
box.querySelector("[data-next]").addEventListener("click", next);
addEventListener("keydown", e => {
  if (!talking || (e.target.closest && e.target.closest("input, select, textarea"))) return;
  if (e.code === "KeyE" || e.code === "Enter" || e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); next(); }
  if (e.code === "Escape") { talking.c.userData.setTalking(0); talking = null; box.hidden = true; }
}, true);

// ---------------------------------------------------------------- per frame
const NEAR = hd ? 30 : 20;   // staff work indoors or at posts: beyond this they're hidden and paused
W.hooks.push(dt => {
  if (talking && Math.hypot(talking.x - me.x, talking.z - me.z) > 4) { talking.c.userData.setTalking(0); talking = null; box.hidden = true; }
  const cam = W.camera.position;
  for (const p of people) {
    const pos = p.c.position;
    const far = Math.hypot(pos.x - cam.x, pos.z - cam.z) > (p.walker ? NEAR + 8 : NEAR);
    p.c.visible = !far;
    if (far) continue;
    if (p.walker) {
      // walk the loop; stop and wave when you come close
      const near = Math.hypot(pos.x - me.x, pos.z - me.z) < 2.2;
      if (near && p.waved <= 0) { p.pause = 2.4; p.waved = 25; if (p.c.userData.emote) p.c.userData.emote("wave"); }
      p.waved -= dt;
      let speed = 0;
      if (p.pause > 0) {
        p.pause -= dt;
        const want = yawOf(me.x - pos.x, me.z - pos.z);
        p.c.rotation.y += Math.atan2(Math.sin(want - p.c.rotation.y), Math.cos(want - p.c.rotation.y)) * Math.min(1, dt * 5);
      } else {
        const [tx, tz] = p.path[(p.leg + 1) % p.path.length];
        const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.3) p.leg = (p.leg + 1) % p.path.length;
        else {
          speed = 1.3;
          pos.x += (dx / d) * speed * dt; pos.z += (dz / d) * speed * dt;
          const want = yawOf(dx, dz);
          p.c.rotation.y += Math.atan2(Math.sin(want - p.c.rotation.y), Math.cos(want - p.c.rotation.y)) * Math.min(1, dt * 6);
        }
      }
      if (p.c.userData.setMove) p.c.userData.setMove(speed, false);
    } else {
      // staff turn to face you while you talk, then back to their post
      const want = talking === p ? yawOf(me.x - p.x, me.z - p.z) : p.homeYaw;
      p.yaw += Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw)) * Math.min(1, dt * 5);
      p.c.rotation.y = p.yaw;
    }
    p.c.userData.tick(dt);
  }
});
if (window.I18N) window.I18N.apply(box);
