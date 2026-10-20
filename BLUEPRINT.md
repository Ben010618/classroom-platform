# 3D Virtual Classroom Platform — Blueprint v2 (Engineering + Ops)

> **Supersedes:** [`docs/blueprint-v1.md`](docs/blueprint-v1.md) (v1). v1 still holds the product vision. v2 picks the repo, fixes technical errors, adds an operations plan, and adds go/no-go gates.
> **Research date:** 2026-10-19. Repo activity was checked live against the GitHub API on that date.
> **Deployment context:** Philippine public schools (DepEd). The governing law is the **Data Privacy Act of 2012 (RA 10173)**, enforced by the National Privacy Commission (NPC). Students mostly use **Android phones on prepaid mobile data**, plus school lab laptops. US laws (COPPA/FERPA) apply only if we later serve US schools.

---

## 0. TL;DR — The Decisions

| Decision | Choice | Why (one line) |
| :--- | :--- | :--- |
| **Base platform (pilot)** | **Hubs Community Edition** (`Hubs-Foundation/hubs` + `hubs-cloud/community-edition`) | It is the only maintained open-source option that already ships roughly 70% of the classroom features. |
| **Rejected for pilot** | Hyperfy | It is alpha ("APIs highly likely to change"), has had no commits since April 2026, is GPL-3.0, and has no classroom tooling. |
| **Long-term escape hatch** | A custom stack of Three.js + **LiveKit** + **Colyseus** | All three are permissively licensed and very active. Build it only if the pilot proves Hubs too hard to customise. |
| **Hosting** | A single-node **K3s** cluster in **Singapore** (Hetzner SG) or Manila (Vultr), with TURN on 443/TLS | Community Edition requires Kubernetes, and K3s is its documented single-server path. Singapore is about 40–55 ms from Manila, and voice needs round-trip times under 80 ms. |
| **Primary devices** | **Low-end Android phone** (3–4 GB RAM) on prepaid data, plus a DepEd lab laptop (Celeron-class) | This is what students actually have. Chromebooks are rare in PH public schools. |
| **Data-cost strategy** | **Lecture Mode by default** (students muted, only the teacher's audio streams) | Voice alone drops from up to ~800 MB/hour to ~30 MB/hour per student. Avatar movement traffic comes on top and is unmeasured, so Phase 1 measures both (§5.2). |
| **Avatars** | The native Hubs avatars and the Hubs avatar editor. **No Ready Player Me.** | Ready Player Me's public service shut down on **31 Jan 2026** after Netflix acquired it. |
| **Strategy** | **Configure first, then extend, then fork.** Use built-in Hubs settings and scene design before writing code. | It shortens the timeline and keeps us close to upstream so we can still take security updates. |
| **Benchmark** | Our current FrameVR space (`framevr.io/team-ric`) is the **control group** in the pilot (§1A) | We must match or beat FrameVR on join time, FPS and audio on the same phones and laptops, or the build isn't worth doing. |

---

## 1. Repo Research — Evidence

Snapshot from the GitHub API, 2026-10-19:

| Repo | Stars | Last push | License | Status | Verdict |
| :--- | ---: | :--- | :--- | :--- | :--- |
| `Hubs-Foundation/hubs` (client) | 2.2k | 2026-08-23 | MPL-2.0 | Active, community foundation | ✅ **Base** |
| `Hubs-Foundation/reticulum` (server) | 460 | 2026-08-23 | MPL-2.0 | Active | ✅ Base |
| `Hubs-Foundation/hubs-cloud` (CE deploy) | 174 | 2026-10-14 | MPL-2.0 | Active | ✅ Deploy tooling |
| `hyperfy-xyz/hyperfy` | 306 | 2026-04-21 | GPL-3.0 | Alpha, quiet for 6 months | ❌ Too risky |
| `ir-engine/ir-engine` (formerly Ethereal Engine) | 104 | 2025-07-17 | Custom | Stale | ❌ |
| `matrix-org/thirdroom` | 652 | 2023-08-30 | Apache-2.0 | Abandoned | ❌ |
| `livekit/livekit` (SFU) | 21.6k | 2026-10-19 | Apache-2.0 | Very active | ⭐ Escape-hatch stack |
| `colyseus/colyseus` (state sync) | 7.4k | 2026-10-16 | MIT | Very active | ⭐ Escape-hatch stack |
| `networked-aframe/networked-aframe` | 1.2k | 2026-10-12 | MIT | Active | Reference only |

### Why Hubs CE wins for a 28-day pilot

Many features in v1's wishlist **already exist in Hubs**, so we configure them instead of building them:

| v1 requirement | Hubs today | Work needed |
| :--- | :--- | :--- |
| Spatial audio and falloff | ✅ Built in, with per-scene audio settings and **Audio Zones** | Tune only |
| Breakout pods that block sound | ✅ Audio Zones (sound-isolating volumes, authored in Spoke or the Blender add-on) | Scene authoring |
| Megaphone | ✅ **Built in (confirmed in code):** a podium "audio source" (mic) that only picks up users with the `amplify_audio` permission, feeding "audio targets" (speakers) around the room | Scene authoring only |
| PDF slides | ✅ PDF media with page controls. **Page index is networked (`NetworkedPDF`), confirmed in code.** | Test only |
| Screen share, whiteboard pen, camera | ✅ Built in | None |
| Mute / kick participants | ✅ Moderator tools for room owners and creators | None |
| Lock spawning and drawing | ✅ **Room member permissions** (spawn media, draw, pin, fly, voice, text chat) | Configure per room |
| Guest join with display name only | ✅ Invite link, no account needed | Policy configuration |
| Hand raise | ✅ **Built in (confirmed):** presence `hand_raised` is shown in the People sidebar and on name tags. Missing: a **time-ordered queue** on the teacher HUD. | Small |
| **Gather All (forced teleport)** | ❌ | **Custom code**, about 2–3 days |
| **Movement lock / seat lock** | ❌ (only "fly" can be disabled) | **Custom code**, about 2–3 days |
| **Teacher HUD (one panel)** | ❌ (the controls exist but are scattered) | **Custom code**, about 3–4 days |
| 3D inspection pedestals | ⚠️ Pinned media objects work; synced rotation needs code | Small to medium |

**Known costs of choosing Hubs:**
1. The deployment needs Kubernetes, which adds ops weight.
2. The client is large and complex (the build now uses Node 22, confirmed in the Dockerfile). Builds run in CI using our own `.github/workflows/classroom-build.yml` (on the `ci-workflows` branch until it's pushed), which builds `ghcr.io/ben010618/classroom-hubs` with `GITHUB_TOKEN`. The upstream workflows, including `custom-docker-build-push`, are not used.
3. The codebase is a mix of A-Frame and a newer bitECS architecture, so customisations must follow its patterns.
4. The MPL-2.0 license means **files we modify must stay open source**. New files we add can stay private. That is acceptable.

### Corrections to v1

- **Draco ≠ texture compression.** Draco compresses *geometry*. Textures should use **KTX2 / Basis Universal**. Use both: `gltf-transform optimize --compress draco --texture-compress ktx2`.
- **The FPS targets in v1 contradict each other** (30 vs 45 vs 25). They are unified in §4 below.
- **Ready Player Me is dead** (see TL;DR).
- **The v1 architecture diagram mixed stacks** (LiveKit, PartyKit and Hubs together). Hubs ships its own SFU (Dialog, which is mediasoup-based) and its own state server (Reticulum, Elixir/Phoenix). §2 shows the corrected diagram.
- **PPT upload** needs a step that converts it to PDF on the server (for example, a LibreOffice headless sidecar). Hubs and PDF.js only render PDF.

---

## 1A. Benchmark — FrameVR (`framevr.io/team-ric`)

We inspected our current Frame on 2026-10-19 using a headless browser and its network traffic.

### What we observed

| Area | Finding |
| :--- | :--- |
| **Plan / capacity** | The lobby shows **"8 spots left"**, which matches FrameVR's free-tier cap of 8 participants per Frame. **That is too small for a class of 25–30.** |
| **Rendering engine** | **Babylon.js** (found in the client bundle), not Three.js |
| **UI framework** | Vue 3 |
| **Voice / video** | **LiveKit Cloud** (`*.livekit.cloud`) |
| **State, data, backend** | **Google Firebase**: Firestore real-time listeners plus Cloud Functions in `us-central1` (USA) |
| **Uploads / media** | Cloudinary upload widget (a third-party service) |
| **Sign-in** | Google Identity Services / Google APIs loaded on the page |
| **Join flow (UX)** | A lobby card over the live 3D scene, with a name tag field, a **CONNECT** button, a seat counter, MIC/CAM and AVATAR settings *before* entering, a **GO TO** teleport menu and a sidebar |
| **Scene** | Modern open-plan architecture with a large paved plaza, distant low-poly props and simple lighting |

### What this means for our plan

1. **FrameVR's own architecture validates our Phase 5 escape hatch.** A commercial leader runs on a JS 3D engine + LiveKit + a real-time state store. That is exactly the Three.js/Babylon + LiveKit + Colyseus design, just self-hosted. **Babylon.js** (Apache-2.0, strong WebXR support, built-in inspector) is now a valid alternative to Three.js for Phase 5, and we should prototype in both before choosing.
2. **Our differentiator is data control, not features.** FrameVR loads US-hosted Google services and a third-party media service inside the classroom. Our self-hosted build keeps all student voice, data and uploads on infrastructure the Division/school controls, with no third-party scripts. **Lead with this when talking to the Schools Division Office and the DPO.** Under RA 10173, the school stays accountable for learner data processed by any platform it chooses, including across borders. The NPC tells schools to vet platforms before use, and in Sept 2026 it began actively scrutinising online platforms used by minors. Fewer processors means fewer agreements and less risk.
3. **Copy the join flow** into our Hubs client (Phase 3 UX task):
   - Name tag, mic/cam check and avatar on **one pre-join card** over the live scene
   - A **seat counter** (`N spots left`) tied to our room cap of 35
   - A **"Go To" menu** listing named waypoints (Podium, Pod A–D, Pedestals). Hubs already supports waypoints, so this is mostly UI work.
4. **The capacity gap is the immediate business case.** A free Frame holds 8 people. Paid FrameVR tiers reportedly run from **US$10–200/month, with Enterprise around US$5,000** (from an undated review; get a current education quote from hello@framevr.io). Our pilot infrastructure costs about €70–150/month plus any traffic overage (§5.1), but **staff time is the real cost**, so the decision must weigh it, not just the hosting bill.
5. **Keep the Frame running.** We don't migrate until our build passes Gate 4. Curriculum assets already used in Frame (`.glb` models, PDFs) can be reused once they pass our budget pipeline (§4).

### Head-to-head acceptance criteria (measured in the Phase 4 pilot)

| Metric | FrameVR (`team-ric`) | Our build must |
| :--- | :--- | :--- |
| Link → in-room time on the reference Android phone (mobile data) | measure | **≤ FrameVR** |
| Sustained FPS on the reference Android phone and lab laptop, 8 users | measure | **≥ FrameVR** |
| Mobile data used by one student in a 1-hour lesson | measure | **≤ FrameVR** |
| Audio dropouts on the school network (15 min) | measure | **≤ FrameVR** |
| Max class size | 8 (free) | **≥ 30** |
| Third-party domains contacted during a lesson | measure (Google, LiveKit Cloud, Cloudinary…) | **0** outside our own domains |
| Teacher one-panel controls (mute, lock, gather) | measure | **All of them on one HUD** |

---

## 2. Target Architecture (Pilot)

```mermaid
graph TD
    subgraph Client["Browser (Android phone / lab laptop / Quest)"]
        HC["Custom Hubs Client (hubs/ subtree)<br/>+ Teacher HUD add-on"]
    end
    subgraph K3s["Single-node K3s (Hetzner)"]
        ING[Ingress + Let's Encrypt]
        RET[Reticulum<br/>rooms, auth, presence, permissions]
        DLG[Dialog SFU<br/>mediasoup]
        PG[(PostgreSQL)]
        ST[(Asset storage<br/>persistent volume)]
        CONV[PPT→PDF converter<br/>LibreOffice sidecar]
    end
    TURN[coturn<br/>UDP 3478 + TLS 443]
    BK[(Off-site backups<br/>encrypted)]

    HC -->|HTTPS| ING --> RET
    HC -->|WebSocket: Phoenix channels| RET
    HC -->|WebRTC media| DLG
    HC -.->|fallback when UDP blocked| TURN --> DLG
    RET --> PG
    RET --> ST
    RET --> CONV
    PG --> BK
    ST --> BK
```

**Rules for customising the code (so upstream updates stay mergeable):**
1. **One repo of our own** (`Ben010618/classroom-platform`). The Hubs client lives in `hubs/` as a git subtree. Keep our changes **thin**: all classroom features go in `hubs/src/classroom/` (new files stay under our control even with MPL).
2. Hook into existing systems through the smallest possible edits, and list each one in `UPSTREAM_PATCHES.md`.
3. Pull upstream `Hubs-Foundation/hubs` once a month with `git subtree pull --prefix hubs hubs-upstream master --squash`.
4. Build the custom client into a Docker image in CI (`classroom-build.yml`), then swap the image tag in the CE deployment yaml.

---

## 3. Teacher Controls — Implementation Strategy

| Feature | Approach | Security model |
| :--- | :--- | :--- |
| **Mute All / Kick** | Use the existing Hubs moderator actions and surface them in the HUD | Already enforced on the server by Reticulum |
| **Lock spawn / draw / voice** | The HUD calls the existing room-settings update (member permissions) | Enforced on the server: Reticulum rejects actions without permission |
| **Megaphone** | Built in: podium mic audio source + speaker audio targets, limited to `amplify_audio` users (scene authoring). Lecture Mode adds a HUD shortcut. | Enforced by the permission check in the audio source system |
| **Gather All** | The HUD broadcasts `classroom:gather {waypoint}` and each client teleports to the named waypoint (`podium`, `seat-01`…) | Same role check on the client. This is acceptable for a classroom. A student who hacks their client can only avoid being teleported themselves. |
| **Seat lock** | Broadcast `classroom:lockMovement` → clients turn off locomotion and snap to their assigned seat waypoint | Same as above. It is a classroom-management feature, not a security boundary. |
| **Hand-raise queue** | Store raised hands in presence metadata, and have the HUD sort them by the time each was raised | Read-only for students |

> **Principle:** anything that protects *safety* (spam, harassment, uploads) must be enforced **on the server** through Reticulum permissions. Anything that only manages the *classroom* (teleport, seat lock) can be enforced on the client.

---

## 4. Performance Budget (Unified)

| Metric | Target | Hard cap | How we enforce it |
| :--- | :--- | :--- | :--- |
| Triangles (whole room) | < 80k | 150k | Check in CI with `gltf-transform inspect` |
| Room `.glb` size | **< 8 MB** | 15 MB | Check in CI. Students pay for every MB on prepaid data, and 30 lab devices on one school link download it all at once. |
| Textures | 1024² KTX2 | 2048² (boards only) | `gltf-transform` pipeline |
| Draw calls | < 80 | 120 | Merge meshes, use texture atlases |
| Frame rate, lab laptop | **≥ 45 FPS** | 30 FPS floor | Measure on real hardware with 30 avatars (Gate 2) |
| Frame rate, budget phone | **≥ 30 FPS in Lite mode** | 25 FPS floor | Measure on real hardware with 30 avatars (Gate 2) |
| Lighting | Baked lightmaps | No real-time shadows | Bake in Blender |
| Students per room | 25–30 | 35 | Server load test **and** a real-device session with 25–30 people (Phase 4). Raise the Hubs room size limit in the admin panel to match. |

**Reference devices** (get them on day 1; if it isn't tested on these, it isn't done):
1. **A budget Android phone** (₱5–7k class, 3–4 GB RAM, MediaTek Helio G-series) running Chrome, which is the most common student device.
2. **A DepEd-issued lab laptop** (Celeron-class, 4 GB RAM), which is what computer-lab sessions use.
3. **Optional:** one Quest headset for the VR showcase only. It is never required for a lesson.

**Mobile-specific requirements:** touch joystick controls, a portrait-mode warning ("rotate your phone"), and a pre-join **"Lite mode"** toggle (lower pixel ratio, avatars hidden beyond 10 m, no video tiles).

**Fallback for devices that can't cope:** a learner whose phone stays under the 25 FPS floor, or who is out of data, must still be able to follow the lesson.
- **Pilot:** the device check flags the phone before the lesson, and the learner joins from a lab laptop or shares a classmate's device.
- **After the pilot:** an **"Audio + slides" mode**: no 3D rendering, only the teacher's voice, the current PDF page, text chat and the hand-raise button. It reuses the same room connection, so the teacher still sees the learner in the HUD.

### 4A. Accessibility (minimum for the pilot)

| Need | What we do |
| :--- | :--- |
| Learners who are deaf or hard of hearing | Text chat stays on in every mode. Tell learners to turn on Android **Live Caption** (on-device, nothing leaves the phone). Do **not** use browser speech-to-text: Chrome's Web Speech API sends audio to Google, which breaks §6. |
| Motion sickness | Snap turning and the comfort vignette on by default, plus a seated mode where Seat Lock is the normal state, not a punishment. |
| Learners who can't use the joystick | Tap-to-teleport and the "Go To" waypoint menu (§1A), so no one needs fine thumb control. |
| Low vision | The pre-join card and HUD follow the system font size and pass WCAG AA contrast. |
| Learners who won't speak | The hand-raise queue and text chat count as participation, so the teacher sees them. |

**Uploads:** Hubs lets users bring in models from links. Limit that through room permissions (students can't spawn media by default), and put the teacher's curriculum models through the same optimisation pipeline.

---

## 5. Operations Plan

### 5.1 Pilot infrastructure (one school, at most 3 concurrent classes)

| Component | Spec | Approx. cost |
| :--- | :--- | :--- |
| K3s node (Hetzner Cloud **Singapore** CCX, or a Manila VPS such as Vultr) | 8 vCPU / 32 GB / NVMe. Check the traffic allowance, because Asia-Pacific regions include less egress than EU ones. | ~€60–120/mo (≈ ₱4–8k) |
| coturn (separate small VM) | 2 vCPU / 4 GB, public IP, ports 3478 UDP plus **443 TCP/TLS** | ~€5–10/mo |
| Off-site backups (object storage) | Nightly Postgres dump plus asset volume, encrypted | ~€5/mo |
| Domain + SMTP (transactional email, for teacher logins only) | — | ~€0–15/mo |

**Bandwidth estimate (audio only):** a voice stream is ~40 kbps of audio plus ~20 kbps of packet overhead, so plan on **~60 kbps** on the wire. Worst case: 30 users × 29 incoming streams × 60 kbps ≈ **52 Mbps egress per room**. Video and screen-share add 1–3 Mbps per viewer. A 1 Gbit port handles about 10 rooms comfortably. **The CPU on the SFU is the real limit, so load-test it.**

**Monthly egress (this is what the hosting bill actually depends on):**

| Scenario | Per room-hour | 3 rooms × 6 h × 22 school days |
| :--- | ---: | ---: |
| Worst case: everyone unmuted all lesson | ~23 GB | **~9 TB/month** |
| Lecture Mode: 30 students × 1 stream | ~0.8 GB | ~0.3 TB/month |
| Realistic mix (mostly Lecture Mode, some discussion) | ~3–5 GB | ~1–2 TB/month |

Before opening the hosting account (issue 0.7), check the plan's **included traffic and the overage price per TB**. Asia-Pacific regions include far less than EU ones, so the worst case could cost more than the server itself. Enforcing Lecture Mode as the default is a cost control as well as a data saver.

**Region:** Singapore or Manila. Run your own round-trip test from Globe, Smart, DITO and the school's ISP before committing, because vendor latency claims vary. Keep it under 80 ms. Record the hosting location in the Privacy Impact Assessment (§6).

### 5.2 Network and data-cost realities (the #2 cause of failure after performance)

**Student mobile data cost (per student, per 1-hour lesson):**

These are **estimates to be replaced by the Phase 1 measurement** (issue 1.3). Each voice is ~60 kbps on the wire (≈ 27 MB/hour).

| Mode | What streams to each student | Voice data |
| :--- | :--- | :--- |
| Open discussion, 30 students all unmuted | 29 voices | **up to ≈ 800 MB/hour** ❌ (less if silent mics send almost nothing; measure it) |
| **Lecture Mode (default)**: students muted, teacher only | 1 voice | **≈ 30 MB/hour** ✅ |
| Breakout pod of 5 | 4 voices **if** Hubs only forwards pod audio; otherwise the same as open discussion | ≈ 110 MB/hour, or up to 800 |
| Avatar movement (Phoenix channel) | position updates for every avatar in the room | **unknown, could rival voice**; measure separately |
| Room download at join (once, cached afterwards) | the `.glb` + avatars | ≤ 8–15 MB |

**Assume the worst case until measured:** Hubs most likely forwards every audio stream to every client and only quiets far-away voices on the device, so Audio Zones save hearing, not data. The defaults are: **students join muted and video tiles are off.** If Phase 1 confirms Hubs forwards everything, per-pod subscription becomes a key reason to move to LiveKit in Phase 5, because LiveKit supports selective subscription. If avatar traffic is large, lower the update rate for seated avatars when Seat Lock is on.

**School network:**
- One school internet link shared by a 30-device computer lab means **30 × 15 MB ≈ 450 MB** downloaded at the same moment. **Stagger joins** (teacher opens the room 5 minutes early) or pre-load the scene on lab PCs the day before; browser cache keeps it.
- Firewalls and ISP setups vary, so TURN over **TLS on port 443** is required, not optional.
- Send the Division ICT unit an **allowlist** of the root domain, `assets.`, `stream.` and `cors.` subdomains and the TURN host before the pilot.
- Run a **network smoke test page** (WebRTC connectivity, TURN reachability, FPS benchmark, round-trip time to the server) that a teacher can open on any phone in 30 seconds.
- Plan for **brownouts and dropped signal**: reconnecting must put the student back in their seat automatically, and the teacher must see a "reconnecting" badge rather than a disappearing student.
  - **How:** guests have no lasting identity, so a reconnect looks like a new person. At join, the client saves a **seat token** in `localStorage`: room ID, assigned seat waypoint, display name and a random ID. On reconnect it presents the token and reclaims the seat if it's still free.
  - The HUD keeps a departed learner's row as "reconnecting" for 90 seconds, matched by the random ID, before removing them.
  - The token holds no personal data and is deleted when the room closes.

### 5.3 Observability and reliability

- **Monitoring:** Prometheus + Grafana on the node (K3s ships metrics; Dialog and coturn expose stats). Track CPU, egress, active rooms, TURN allocations and Postgres health.
- **Uptime:** an external probe of the homepage and TURN, with alerts to the on-call phone.
- **Logging:** keep **14 days maximum** and strip IP addresses after 7 days (data minimisation under RA 10173).
- **Backups:** nightly, with a **restore drill tested in Phase 4**, not assumed.
- **Updates:** a monthly maintenance window outside school hours. Pull upstream into the `hubs/` subtree, roll out to staging, then production.
- **Staging:** a second namespace on the same node during the pilot. Split it onto its own node before going to production.

### 5.4 Scale-out path (after the pilot)
1. Move Postgres to a managed database and assets to S3-compatible storage.
2. Run several K3s nodes with dedicated SFU nodes, because Dialog scales horizontally per room.
3. Schedule capacity around timetabled class periods, since demand peaks in predictable blocks.

---

## 6. Privacy, Safety and Compliance (updated)

> **Governing framework:** the Data Privacy Act of 2012 (**RA 10173**) and its IRR, NPC circulars and advisories, and DepEd's own data privacy policies. Most learners are **minors**, so the NPC's child-focused guidance applies, and the NPC began active enforcement against platforms used by minors in Sept 2026.

**Before the pilot (paperwork the Division will ask for):**
- [ ] **Involve the Division/School Data Protection Officer (DPO)** from day 1. They must approve the pilot.
- [ ] **Privacy Impact Assessment (PIA)**, including a **Child PIA** as recommended by NPC Advisory 2024-03 (child-oriented transparency, Dec 2024).
- [ ] **Child-friendly privacy notice** written for learners in plain Filipino/English, plus a separate notice for parents (also from Advisory 2024-03).
- [ ] **Parent/guardian consent form** for pilot participants.
- [ ] **Data sharing or outsourcing agreement** if anyone outside DepEd (for example, a hosting provider or KU) processes learner data.
- [ ] **List every processor in the PIA**, including server-side ones that the "0 third-party domains" browser test can't see:

  | Processor | What it handles | Note |
  | :--- | :--- | :--- |
  | Hosting provider (Hetzner SG or Manila VPS) | Everything: voice relay, chat, uploads, logs | **Cross-border transfer** if Singapore |
  | SMTP provider | Teacher email addresses (magic-link login) | Teachers only, no learner data |
  | Backup object storage | Encrypted Postgres dumps and uploads | Encrypt before upload; record the region |
  | DNS / domain registrar | No learner data | List it for completeness |
  | Google STUN (until issue F2 is fixed) | **Learner IP addresses** | Remove before the student pilot |
- [ ] Check whether NPC **registration** of the processing system is required (NPC Circular 2022-04), and confirm with the DPO.

**Built into the platform:**
- [ ] **Guest-only learners:** display name only, with nicknames or first name and section code encouraged. No LRN, birthdays or addresses. Teachers sign in by email magic link (Hubs default).
- [ ] **No recording** of voice or video by the platform. The NPC's online-learning guidance allows class recording only with informed agreement from learners and parents, so the default is off. Disable recording and camera-to-cloud features for learner roles.
- [ ] **Camera off by default.** Camera policies must be "reasonable and necessary" per NPC guidance, and an avatar class doesn't need one.
- [ ] **No third-party analytics or scripts.** Audit the client build for analytics and error-reporting settings (GA, Sentry DSN) and leave them **empty**. Host fonts and scripts ourselves.
- [ ] **Data retention policy:** chat and uploads are purged after X days, rooms are archived at the end of the term, and logs are kept 14 days at most.
- [ ] **Breach response runbook:** notify the NPC and affected data subjects **within 72 hours** of discovering a qualifying breach (NPC Circular 16-03). Name who calls the DPO.
- [ ] **Screenshot / social media rule** shown on the join card: no posting screenshots of classmates. NPC guidance tells schools to enforce this.
- [ ] **Moderation:** a kick/ban runbook for teachers, a **report-abuse button**, and room-closed-without-teacher as the default.
  - A report goes **straight to the teacher's HUD** during the lesson.
  - It is also written to a moderation log on our server (reporter display name, reported display name, time, room). The **School ICT coordinator** reviews that log weekly and escalates to the school's child protection focal person.
  - The log follows the 14-day retention rule unless a case is open.
- [ ] **Room access:** an invite link plus an optional PIN. Rooms open only while the host is present.
- [ ] **Security test** (at minimum a self-run OWASP ZAP scan) before rolling out beyond one school.

> *COPPA/FERPA (US) and GDPR (EU) apply only if we later serve schools in those regions. Keep the design compatible, but they are not the pilot's compliance target.*

---

## 7. Revised Roadmap — with Go/No-Go Gates

### Phase 0 — Prep (Days 1–2)
- [ ] Get the reference devices (budget Android phone + DepEd lab laptop), register the domain, and open the hosting account (Singapore/Manila). Choose the plan by **included traffic and overage price**, not only CPU (§5.1).
- [ ] Put a name against every role in §9.
- [ ] Write to the **Schools Division Office**: the ICT unit (allowlist, school internet details) and the **DPO** (pilot approval, PIA, consent forms). This paperwork takes the longest, so start it first.
- [ ] Measure round-trip time to candidate server regions from Globe, Smart, DITO and the school ISP.
- [x] Set up our own repo: Hubs as a `hubs/` subtree, `hubs/src/classroom/`, `UPSTREAM_PATCHES.md`, and a CI workflow to build the client image.

### Phase 1 — Stand up and validate (Days 3–7)
- [ ] Deploy CE on single-node K3s (official "hello-world VM" path) plus coturn on 443/TLS.
- [ ] Test with 1 host + 5 browser tabs + **the reference phone on prepaid mobile data** + **the lab laptop on the school network**.
- [ ] Check which features already work: PDF page sync, raised hands, room permissions, mute/kick, Audio Zones, **mobile touch controls**.
- [ ] **Measure the data used** by one phone for 15 minutes in Lecture Mode and in open discussion. Measure voice (WebRTC) and avatar movement (WebSocket) separately, and check whether Hubs streams audio from far-away speakers and pods (§5.2). Replace the §5.2 estimates with the results.
- **🚦 Gate 1:** Does CE run stably, and do both reference devices connect *from mobile data and from inside the school network*? If not, fix the network first. Do not start building features.

### Phase 2 — Classroom scene and performance (Days 8–12)
- [ ] Build a low-poly classroom with a lecture zone, a podium waypoint, numbered seat waypoints and 4 breakout pods with **isolating Audio Zones**.
- [ ] Bake lighting in Blender and export through the Hubs Blender add-on, using Draco + KTX2.
- [ ] Add CI checks for the triangle, size and texture budgets. The checker is built (`tools/asset-budget/`); its workflow `asset-budget.yml` waits on the `ci-workflows` branch with `classroom-build.yml` (issue 0.4).
- **🚦 Gate 2:** With **30 avatars** in the room (the real class size, not 10), the lab laptop holds **45 FPS or more** and the budget phone holds **30 FPS or more in Lite mode**, and the scene is **under 8 MB**.

### Phase 3 — Teacher HUD and core features (Days 13–20)
Only what a staff pilot needs. Estimates: HUD 3–4 days, Gather All 2–3 days, Seat Lock 2–3 days. Open PRs for the HUD, the Filipino translation and the pre-join card already exist (#30–#32), so review and test them against these items instead of starting over.
- [ ] Teacher HUD panel: Mute All, Lock Spawn/Draw/Voice (using existing permissions), Kick.
- [ ] Gather All and Seat Lock (custom broadcast messages with the role check).
- [ ] Seat token reconnect and the "reconnecting" badge (§5.2).
- [ ] Report-abuse button: sends the report to the teacher's HUD and writes it to the moderation log (§6).
- [ ] Accessibility defaults (§4A): snap turn, comfort vignette, tap-to-teleport, chat always on.
- [ ] Hand-raise queue on the HUD, sorted by time raised (presence `hand_raised` exists; the queue does not).
- [ ] **Lecture Mode** (one HUD button: mute all learners, Gather to seats, grant the teacher `amplify_audio` so the built-in podium megaphone carries their voice). This is also the data saver.
- [ ] Pre-join card copied from FrameVR, with Lite mode, mic check and the privacy/screenshot rule.
- **🚦 Gate 3:** A teacher who has never used the platform can run a 5-minute lesson using only the HUD, without help.

### Phase 4 — Hardening and staff pilot (Days 21–28)
Adults only, so it doesn't wait for DPO approval or parent consent.
- [ ] TLS, backups, a **restore drill**, monitoring and alerts, and turning off analytics.
- [ ] **Server load test:** 30 simulated clients per room (headless browsers with fake audio, run from a separate machine), watching SFU CPU and egress.
- [ ] **Real-device capacity session:** 25–30 teachers and volunteers on real phones and laptops in one room for 15 minutes. Record FPS on the reference devices and audio dropouts.
- [ ] **Staff pilot:** a 15-minute mock lesson with 1 teacher and 5–8 adult "students", using a mix of **phones on mobile data** and **lab laptops on the school network**.
- [ ] Measure join time (target under 30 s from link to classroom), FPS, audio dropouts, mobile data per hour and a teacher friction survey.
- [ ] **Run the same lesson in FrameVR `team-ric`** (8-person group) on the same phones and laptops and fill in the head-to-head table in §1A.
- [ ] **Practice upstream pull:** run `git subtree pull` against current upstream on a branch and record the hours spent and the files with conflicts.
- **🚦 Gate 4 — the big decision:** stay on Hubs, or start the custom LiveKit + Colyseus build?
  - **Stay on Hubs** if Phase 3 took less than 1.5× its estimate, the practice upstream pull took under one working day, and `UPSTREAM_PATCHES.md` lists 25 or fewer upstream files.
  - **Start the custom build** if Gate 2's frame rates fail at 30 avatars, the practice pull takes more than a day, or more than 25 upstream files have been edited.

### Phase 4b — Student pilot (after DPO approval)
Starts when the DPO has approved the pilot and the PIA, and consent forms are signed. Do not tie it to a calendar day.
- [ ] Pilot lesson with 1 teacher and 5–8 learners who have signed parent consent forms, same device mix and measurements as the staff pilot.
- [ ] **Is 3D worth it? Compare against the school's usual 2D tool** (for example, Google Meet), not just FrameVR. The same teacher teaches the same short topic to two matched groups, one in each tool. Compare:
  - a 5-question exit quiz
  - participation (hand raises, questions and chat messages per learner)
  - mobile data used
  - a 3-question learner survey (in Filipino)

  If 3D costs more data and shows no gain, say so in the Gate 4 report.
- [ ] **Filipino translation** of the learner-facing UI (Hubs has an i18n system; add `fil` if it's missing). Needed for learners, not for the staff pilot.
- [ ] PPT → PDF converter sidecar. Until then, teachers upload PDFs.

### Phase 5 (optional, after the pilot) — Custom-stack track
Run it in parallel, behind the Hubs pilot, and never replace a working system mid-term:
- **Client:** Three.js + TypeScript + Vite with `three-mesh-bvh`, **or Babylon.js**, which is FrameVR's engine (§1A). Build a one-week spike in each and pick the one with the better FPS on the budget Android phone.
- **Media:** a self-hosted **LiveKit**, spatialised with WebAudio `PannerNode` plus LiveKit's own proximity examples.
- **State:** **Colyseus** rooms that hold the server's authoritative teacher permissions (these become real server-side security, not just client-side checks).
- **Avatars:** VRM, so there's no Ready Player Me dependency.

---

## 8. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| 1 | School network or ISP blocks WebRTC | **High** | Critical | TURN on 443/TLS, ICT allowlist on day 1, smoke-test page |
| 2 | Budget Android phones below 30 FPS | **High** | Critical | Reference phone, Lite mode, CI budget checks, Gate 2 |
| 2b | Mobile data cost stops learners joining | **High** | High | Lecture Mode default, 8 MB scene, measure voice **and** avatar traffic in Phase 1, report data per lesson to teachers, "Audio + slides" fallback after the pilot |
| 2c | Brownouts or signal drops mid-lesson | High | Medium | Seat token auto-reconnect, "reconnecting" badge, short lesson segments |
| 2e | Hubs can't hold 30 people on budget phones | **High** | Critical | Gate 2 at 30 avatars, real-device capacity session in Phase 4, smaller rooms or the Phase 5 build if it fails |
| 2f | Hosting egress overage | Medium | Medium | Check included traffic before buying (§5.1), Lecture Mode default, egress alert in monitoring |
| 2d | DPO approval or consent forms delay the pilot | **High** | High | Start the paperwork in Phase 0. The staff pilot (Phase 4) needs no learner consent; the student pilot (Phase 4b) waits for approval |
| 3 | Kubernetes ops overload a small team | Medium | High | Single-node K3s, one runbook, managed DB later |
| 3b | One person on call, roles without names | Medium | High | Name every role in §9 before Phase 1, keep the Frame as a fallback room during the pilot |
| 4 | Hubs Foundation slows down | Low–Med | High | Thin changes on a subtree, MPL lets us self-maintain, Phase 5 escape hatch |
| 5 | Student misconduct in rooms | High | Medium | Locked permissions by default, kick/ban, report button, teacher-present rule |
| 6 | Privacy or compliance incident | Low | Critical | Guest-only students, no recording, retention purge, written security program |
| 7 | SFU overload at peak periods | Medium | High | Load test, room cap of 35, add an SFU node |

---

## 9. Team and Roles (minimum)

| Role | Person | Owns | Staff time, Phases 0–4 |
| :--- | :--- | :--- | ---: |
| **Head programmer** | _name_ | Repo and subtree strategy, Teacher HUD, custom features, upstream pulls | ~18 days |
| **Ops lead** | _name_ | K3s, coturn, monitoring, backups, school IT liaison. **On call during pilot class periods.** | ~12 days |
| **3D artist** (can be part-time) | _name_ | Classroom scene, Audio Zones, asset pipeline | ~5 days |
| **Education lead / pilot teacher** | _name_ | Lesson design, Gate 3 usability testing, feedback | ~4 days |
| **Privacy owner** (works with the Division DPO) | _name_ | PIA and Child PIA, consent forms, privacy notices, breach runbook, retention policy | ~5 days |
| **School ICT coordinator** | _name_ | Lab laptops, school internet, allowlist, pre-loading scenes, weekly moderation-log review | ~3 days |

**Total ≈ 47 person-days** for the 28-day plan, before Phase 4b. That is the real cost to weigh against a FrameVR licence (§1A).

**On call:** the ops lead carries the alert phone during class periods, with the head programmer as backup. With only one person on call, keep the Frame running as the fallback room for every pilot lesson.

Fill in the names before Phase 1. A role without a name is a risk-register item.

---

## 10. Updated AI Prompts (Hubs-specific)

### Prompt A′ — Teacher HUD on Hubs
```text
Context: Our repo Ben010618/classroom-platform contains the Hubs client (Hubs-Foundation/hubs, MPL-2.0) as a git subtree in hubs/. All new code lives in hubs/src/classroom/.
Task: Build a Teacher HUD React panel shown only when the local user has the owner or creator role in Hubs presence.
Requirements:
1. Reuse the existing room-settings/member-permissions update calls for Lock Spawn, Lock Draw and Lock Voice. Do not reimplement permissions.
2. Reuse the existing moderator mute/kick actions.
3. Add Gather All: broadcast a custom message {type:"classroom:gather", waypoint:string} over the hub channel. On receive, a client verifies the sender has the owner or creator role in presence, then teleports to the named waypoint.
4. Add Seat Lock using the same pattern (disable locomotion and snap to the assigned seat waypoint).
5. List every upstream file you had to modify, so we can record it in UPSTREAM_PATCHES.md.
First, read the codebase to find the actual names of the presence, hub-channel and waypoint APIs. Do not guess them.
```

### Prompt B′ — Asset pipeline CI check
```text
Task: Write a Node script plus a GitHub Action using @gltf-transform/cli.
1. Optimize every .glb in /assets with Draco geometry compression and KTX2 (UASTC for normal maps, ETC1S for others) textures.
2. Fail CI if a scene exceeds 150k triangles, 15 MB, any texture over 2048², or more than 120 meshes after merging.
3. Print a budget report table in the job summary.
```

### Prompt C′ — Network smoke-test page
```text
Task: Build a single static HTML page that a teacher or school ICT coordinator can open on an Android phone or lab laptop to check:
1. WebGL2 support and the GPU renderer string.
2. Microphone permission.
3. WebRTC connectivity: direct UDP, TURN UDP 3478 and TURN TLS 443 (gather ICE candidates and report which succeed).
4. A 10-second Three.js FPS benchmark using a scene with ~80k triangles.
5. Round-trip time to our server and the network type (Wi-Fi or cellular), if the browser exposes it.
6. A green/amber/red summary plus a "copy results" button for support tickets. UI in English and Filipino. Total page weight under 1 MB, because it may run on prepaid data.
No third-party analytics; all assets self-hosted.
```

---

## Sources
- FrameVR `team-ric` inspected with a headless browser on 2026-10-19 (page UI, network requests and client bundle)
- [FrameVR review — pricing tiers and capacity](https://iop.upou.edu.ph/portfolio/immersive-technology-reviews/framevr-review/) · [Frame education blog](https://learn.framevr.io/blog/transforming-education-vrar)
- GitHub API repo metadata (live query, 2026-10-19): Hubs-Foundation/hubs, reticulum, hubs-cloud; hyperfy-xyz/hyperfy; ir-engine/ir-engine; matrix-org/thirdroom; livekit/livekit; colyseus/colyseus; networked-aframe/networked-aframe
- [Hubs-Foundation/hubs](https://github.com/Hubs-Foundation/hubs) · [Hubs CE deployment](https://github.com/Hubs-Foundation/hubs-cloud/tree/master/community-edition) · [Hubs CE on Azure AKS](https://hubs.mozilla.com/labs/installing-mozilla-hubs-community-edition-on-your-own-microsoft-azure-kubernetes-service/)
- [hyperfy-xyz/hyperfy](https://github.com/hyperfy-xyz/hyperfy)
- [Mozilla ceases Hubs support, CE continues](https://ryanschultz.com/?term_id=24)
- [Netflix acquires Ready Player Me](https://www.digitalcitizen.life/netflix-acquires-ready-player-me-to-expand-its-gaming-strategy/) · [Avatar platforms 2026](https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/)
- [NPC PHE Bulletin 17 — data privacy in online learning](https://privacy.gov.ph/?p=12349) · [NPC online learning guidelines](https://privacy.gov.ph/?p=11880) · [NPC Advisory 2024-03 child-oriented transparency](https://privacy.gov.ph/wp-content/uploads/2024/12/Advisory-2024.12.17-Guidelines-on-Child-Oriented-Transparency-w-SGD.pdf) · [Baker McKenzie summary](https://insightplus.bakermckenzie.com/bm/data-technology/philippines-npc-releases-new-guidelines-on-artificial-intelligence-and-child-oriented-transparency) · [NPC scrutiny of platforms used by children, Sept 2026](https://context.ph/2026/09/22/npc-tightens-scrutiny-of-digital-platforms-over-childrens-data/) · [NPC Circular 2022-04](https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf)
- [DepEd laptop/smart TV rollout](https://newsinfo.inquirer.net/2035385/fwd-deped-to-distribute-over-62000-laptops-smart-tvs-across-ph/amp) · [DepEd ICT rollout via partnerships, Sept 2026](https://tribune.net.ph/2026/09/23/angara-private-partnerships-can-speed-up-depeds-ict-rollout)
- [Manila–Singapore latency notes (vendor claims)](https://www.zenlayer.com/global/countries/philippines)
- [COPPA amended rule — Federal Register, 22 Apr 2025](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm) *(reference only; applies if serving US schools)* · [Hunton summary](https://www.hunton.com/privacy-and-cybersecurity-law-blog/ftc-publishes-final-coppa-rule-amendments)
- [LiveKit spatial computing](https://livekit.io/use-cases/metaverse) · [livekit/livekit](https://github.com/livekit/livekit/blob/master/README.md)
