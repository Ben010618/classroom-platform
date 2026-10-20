"use strict";
// ============================================================================================
// LANGUAGE — English / Filipino. English text is the key: t("Go to") → "Pumunta sa" in Filipino.
// apply() translates the page's own text nodes and title/aria-label/placeholder attributes by exact
// match, so the HTML needs no extra markup. Switching language reloads the page.
// ============================================================================================
(function () {
  const FIL = {
    // HUD + menu
    "Menu": "Menu", "Go to": "Pumunta sa", "Actions": "Kilos", "Tasks": "Gawain", "Map": "Mapa",
    "3D school preview": "3D na paaralan", "Join class (multiplayer)": "Sumali sa klase (multiplayer)",
    "Change my character": "Palitan ang aking karakter", "Settings": "Mga setting", "Controls": "Kontrol",
    "Simple graphics": "Simpleng graphics", "Hubs markers": "Hubs markers", "Sound: on": "Tunog: bukas", "Sound: off": "Tunog: sarado",
    "Language: English": "Wika: Ingles", "Language: Filipino": "Wika: Filipino",
    "Time: Day": "Oras: Araw", "Time: Afternoon": "Oras: Hapon", "Time: Evening": "Oras: Gabi",
    "Weather: Sunny": "Panahon: Maaraw", "Weather: Rain": "Panahon: Maulan",
    "Mini-map: on": "Mapa: bukas", "Mini-map: off": "Mapa: sarado", "Show controls guide": "Ipakita ang gabay",
    "Menu (M)": "Menu (M)", "Go to a place (G)": "Pumunta sa isang lugar (G)", "You are here": "Narito ka",
    // places
    "Gate": "Tarangkahan", "Main gate": "Pangunahing tarangkahan", "Flag plaza": "Plasa ng watawat", "Classroom 1": "Silid-aralan 1",
    "Podium": "Podyum", "Grade 8 room": "Silid ng Grade 8", "Science Lab": "Laboratoryo", "ICT Room": "Silid ng ICT",
    "Covered court": "Covered court", "Stage": "Entablado", "Canteen": "Kantina", "Library": "Silid-aklatan",
    "Garden": "Hardin", "Vegetable garden": "Gulayan", "Principal's office": "Tanggapan ng punong-guro",
    "Comfort rooms": "Palikuran", "Administration": "Administrasyon", "Veranda": "Pasilyo", "School grounds": "Bakuran ng paaralan",
    // actions + emotes
    "Jump": "Talon", "Run": "Takbo", "Hand": "Kamay", "Sit": "Upo", "View": "Tanaw", "Emote": "Kilos",
    "Wave": "Kaway", "Clap": "Palakpak", "Cheer": "Hiyaw", "Nod": "Tango", "Dance": "Sayaw",
    "Show action buttons": "Ipakita ang mga button", "Hide action buttons": "Itago ang mga button",
    "Walk up to a chair to sit down": "Lumapit sa upuan para umupo",
    "Third-person view": "Tanaw mula sa likod", "First-person view": "Tanaw ng mata",
    // editor
    "Join the class": "Sumali sa klase", "Your character": "Ang iyong karakter", "Your name": "Pangalan mo",
    "Class code": "Code ng klase", "Body": "Katawan", "Skin tone": "Kulay ng balat", "Hairstyle": "Ayos ng buhok",
    "Hair colour": "Kulay ng buhok", "Outfit": "Kasuotan", "Backpack": "Bag", "Backpack colour": "Kulay ng bag",
    "Use my microphone": "Gamitin ang mikropono ko", "I'm the teacher": "Ako ang guro", "Cancel": "Kanselahin",
    "Save look": "I-save", "Join": "Sumali", "Character saved": "Na-save ang karakter",
    "Boy / man": "Lalaki", "Girl / woman": "Babae", "Short": "Maikli", "Long": "Mahaba", "Ponytail": "Ponytail", "Bun": "Pusod", "Buzz cut": "Semi-kalbo",
    "School uniform (polo)": "Uniporme (polo)", "School uniform (blouse)": "Uniporme (blusa)", "PE shirt": "PE na damit", "Casual": "Pambahay", "Teacher (Filipiniana-style)": "Guro (Filipiniana)",
    "School student (customise)": "Estudyante (iayos mo)", "Drag to turn": "I-drag para paikutin", "Loading…": "Nilo-load…",
    "Previous character": "Nakaraang karakter", "Next character": "Susunod na karakter", "Preview of your character (drag to turn)": "Silip sa karakter mo (i-drag para paikutin)",
    "Casual": "Pambahay", "Hoodie": "Hoodie", "Business suit": "Amerikana", "Farmer": "Magsasaka", "Worker": "Manggagawa", "Beach": "Pang-beach",
    "Adventurer": "Manlalakbay", "Astronaut": "Astronaut", "King": "Hari", "Formal": "Pormal",
    "Medieval": "Medyebal", "Witch": "Mangkukulam",
    "Mute": "I-mute", "Unmute": "I-unmute", "Raise hand": "Magtaas ng kamay", "Lower hand": "Ibaba ang kamay", "Leave": "Umalis",
    "Teacher controls": "Kontrol ng guro", "Mute everyone": "I-mute lahat", "Gather to seats": "Paupuin lahat",
    "Lock seats after gathering": "I-lock ang upuan pagkatapos", "Call to the front": "Tawagin sa harap", "Unlock seats": "I-unlock ang upuan",
    "Raised hands": "Nakataas na kamay", "No raised hands": "Walang nakataas na kamay",
    // interactions
    "Use": "Gamitin", "Talk": "Kausapin", "Open the door": "Buksan ang pinto", "Close the door": "Isara ang pinto",
    "Write on the chalkboard": "Sumulat sa pisara", "Show slides (PDF)": "Ipakita ang slides (PDF)", "Ring the school bell": "Patunugin ang kampana",
    "Drink water": "Uminom ng tubig", "Raise the flag": "Itaas ang watawat", "Lower the flag": "Ibaba ang watawat", "Read a book": "Magbasa ng aklat",
    "Buy a snack": "Bumili ng meryenda", "Water the plants": "Diligan ang mga halaman", "Grab a ball": "Kumuha ng bola", "Drop the ball": "Bitawan ang bola",
    "Perform on stage": "Magtanghal sa entablado", "Wash your hands": "Maghugas ng kamay",
    "Done": "Tapos", "Clear": "Burahin lahat", "Eraser": "Pambura", "Chalk": "Tisa", "Close": "Isara", "Next": "Susunod", "Back": "Bumalik",
    "Choose a PDF": "Pumili ng PDF", "Previous": "Nakaraan", "Hide slides": "Itago ang slides",
    "Your allowance today": "Baon mo ngayon", "Not enough money left today": "Kulang na ang baon mo ngayon",
    "Refreshing!": "Nakakapresko!", "The plants look happy.": "Masaya ang mga halaman.", "Ding! Ding! Ding!": "Kliing! Kliing! Kliing!",
    // tasks
    "First-day tasks": "Mga gawain sa unang araw", "All tasks done — welcome to Katuro University!": "Tapos lahat — maligayang pagdating sa Katuro University!",
    "Task done": "Natapos", "Reset tasks": "Ulitin ang mga gawain",
    "Talk to the guard at the gate": "Kausapin ang guwardiya sa tarangkahan", "Raise the flag at the flag plaza": "Itaas ang watawat sa plasa",
    "Find Classroom 1 and sit at a desk": "Hanapin ang Silid-aralan 1 at umupo", "Write on the chalkboard ": "Sumulat sa pisara ",
    "Borrow a book at the library": "Humiram ng aklat sa silid-aklatan", "Buy a snack at the canteen": "Bumili ng meryenda sa kantina",
    "Water the vegetable garden": "Diligan ang gulayan", "Ring the school bell": "Patunugin ang kampana ng paaralan",
    "Visit the principal": "Bisitahin ang punong-guro", "Explore the Science Lab": "Libutin ang laboratoryo",
    // loading + guide
    "Loading the school…": "Nilo-load ang paaralan…", "Loading characters…": "Nilo-load ang mga karakter…",
    "How to play": "Paano maglaro", "Got it": "Sige", "Move": "Gumalaw", "Look around": "Tumingin-tingin", "Use / talk": "Gamitin / kausapin",
    "This device is struggling. ": "Nahihirapan ang device na ito. ", "Switch to simple graphics": "Lumipat sa simpleng graphics"
  };
  let lang = "en";
  try { lang = localStorage.getItem("world.lang") === "fil" ? "fil" : "en"; } catch (e) { /* private mode */ }
  const t = s => (lang === "fil" && FIL[s]) || s;

  function apply(root = document.body) {
    if (lang === "en" || !root) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const n of nodes) {
      const raw = n.nodeValue, key = raw.trim();
      if (key && FIL[key]) n.nodeValue = raw.replace(key, FIL[key]);
    }
    root.querySelectorAll("[title], [aria-label], [placeholder]").forEach(el => {
      for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v && FIL[v]) el.setAttribute(a, FIL[v]); }
    });
  }
  function setLang(l) { try { localStorage.setItem("world.lang", l); } catch (e) { /* ignore */ } location.reload(); }

  const api = { t, apply, setLang, get lang() { return lang; } };
  window.I18N = api;
  if (document.readyState !== "loading") apply(); else document.addEventListener("DOMContentLoaded", () => apply());
  document.documentElement.lang = lang === "fil" ? "fil" : "en";
})();
