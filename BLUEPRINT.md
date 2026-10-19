# 3D Virtual Classroom Platform — Blueprint v2 (Engineering + Ops)

> **Supersedes:** `virtual-classroom-3d-blueprint.md` (v1). v1 still holds the product vision. v2 picks the repo, fixes technical errors, adds an operations plan, and adds go/no-go gates.
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
| **Data-cost strategy** | **Lecture Mode by default** (students muted, only the teacher's audio streams) | It cuts each student's mobile data from about 540 MB/hour to about 20 MB/hour (§5.2). |
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
2. The client is large and complex (the build now uses Node 22, confirmed in the Dockerfile). Builds run in CI using the official `custom-docker-build-push` workflow.
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
4. **The capacity gap is the immediate business case.** A free Frame holds 8 people. Paid FrameVR tiers reportedly run from **US$10–200/month, with Enterprise around US$5,000** (from an undated review; get a current education quote from hello@framevr.io). Our pilot infrastructure costs about €60–110/month, but **staff time is the real cost**, so the decision must weigh it, not just the hosting bill.
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
        HC[Custom Hubs Client (hubs/ subtree)<br/>+ Teacher HUD add-on]
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

1. **One repo of our own** (`Ben010618/classroom-platform`). The Hubs client lives in `hubs/` as a git subtree. Keep our changes **thin**: all classroom features go in `hubs/src/classroom/` (new files stay under our control even with MPL).
1. Keep the fork **thin**. Put all classroom features in a new `src/classroom/` folder (new files stay under our control even with MPL).
3. Pull upstream `Hubs-Foundation/hubs` once a month with `git subtree pull --prefix hubs hubs-upstream master --squash`.
3. Rebase onto upstream `Hubs-Foundation/hubs` once a month.
4. Build the custom client into a Docker image in CI, then swap the image tag in the CE deployment yaml.

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
| Frame rate | **≥ 45 FPS** on the reference devices | **30 FPS floor** | Measure on real hardware in Phase 2 |
| Lighting | Baked lightmaps | No real-time shadows | Bake in Blender |
| Students per room | 25–30 | 35 | Load test in Phase 4 |

**Reference devices** (get them on day 1; if it isn't tested on these, it isn't done):
1. **A budget Android phone** (₱5–7k class, 3–4 GB RAM, MediaTek Helio G-series) running Chrome, which is the most common student device.
2. **A DepEd-issued lab laptop** (Celeron-class, 4 GB RAM), which is what computer-lab sessions use.
3. **Optional:** one Quest headset for the VR showcase only. It is never required for a lesson.

**Mobile-specific requirements:** touch joystick controls, a portrait-mode warning ("rotate your phone"), and a pre-join **"Lite mode"** toggle (lower pixel ratio, avatars hidden beyond 10 m, no video tiles).

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

**Bandwidth estimate (audio only):** 30 users × 29 incoming streams × ~40 kbps ≈ **35 Mbps egress per room**. Video and screen-share add 1–3 Mbps per viewer. A 1 Gbit port handles about 10 rooms comfortably. **The CPU on the SFU is the real limit, so load-test it.**

**Region:** Singapore or Manila. Run your own round-trip test from Globe, Smart, DITO and the school's ISP before committing, because vendor latency claims vary. Keep it under 80 ms. Record the hosting location in the Privacy Impact Assessment (§6).

### 5.2 Network and data-cost realities (the #2 cause of failure after performance)

**Student mobile data cost (per student, per 1-hour lesson):**

| Mode | What streams to each student | Data used |
| :--- | :--- | :--- |
| Open discussion, 30 students all unmuted | 29 voices × ~40 kbps | **≈ 540 MB/hour** ❌ |
| **Lecture Mode (default)**: students muted, teacher only | 1 voice × ~40 kbps | **≈ 20 MB/hour** ✅ |
| Breakout pod of 5 | 4 voices | ≈ 75 MB/hour ✅ |
| Room download at join (once, cached afterwards) | the `.glb` + avatars | ≤ 8–15 MB |

So the defaults are: **students join muted, video tiles are off, and audio is only received from people in the same pod.** (Hubs may still receive every stream, so measure this in Phase 1. If it does, per-pod subscription becomes a key reason to move to LiveKit in Phase 5, because LiveKit supports selective subscription.)

**School network:**
- One school internet link shared by a 30-device computer lab means **30 × 15 MB ≈ 450 MB** downloaded at the same moment. **Stagger joins** (teacher opens the room 5 minutes early) or pre-load the scene on lab PCs the day before; browser cache keeps it.
- Firewalls and ISP setups vary, so TURN over **TLS on port 443** is required, not optional.
- Send the Division ICT unit an **allowlist** of the root domain, `assets.`, `stream.` and `cors.` subdomains and the TURN host before the pilot.
- Run a **network smoke test page** (WebRTC connectivity, TURN reachability, FPS benchmark, round-trip time to the server) that a teacher can open on any phone in 30 seconds.
- Plan for **brownouts and dropped signal**: reconnecting must put the student back in their seat automatically, and the teacher must see a "reconnecting" badge rather than a disappearing student.

### 5.3 Observability and reliability

- **Monitoring:** Prometheus + Grafana on the node (K3s ships metrics; Dialog and coturn expose stats). Track CPU, egress, active rooms, TURN allocations and Postgres health.
- **Uptime:** an external probe of the homepage and TURN, with alerts to the on-call phone.
- **Logging:** keep **14 days maximum** and strip IP addresses after 7 days (data minimisation under RA 10173).
- **Backups:** nightly, with a **restore drill tested in Phase 4**, not assumed.
- **Updates:** a monthly maintenance window outside school hours. Rebase on upstream, roll out to staging, then production.
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
- [ ] **Room access:** an invite link plus an optional PIN. Rooms open only while the host is present.
- [ ] **Security test** (at minimum a self-run OWASP ZAP scan) before rolling out beyond one school.

> *COPPA/FERPA (US) and GDPR (EU) apply only if we later serve schools in those regions. Keep the design compatible, but they are not the pilot's compliance target.*

---

## 7. Revised Roadmap — with Go/No-Go Gates

### Phase 0 — Prep (Days 1–2)
- [ ] Get the reference devices (budget Android phone + DepEd lab laptop), register the domain, and open the hosting account (Singapore/Manila).
- [ ] Write to the **Schools Division Office**: the ICT unit (allowlist, school internet details) and the **DPO** (pilot approval, PIA, consent forms). This paperwork takes the longest, so start it first.
- [ ] Measure round-trip time to candidate server regions from Globe, Smart, DITO and the school ISP.
- [x] Set up our own repo: Hubs as a `hubs/` subtree, `hubs/src/classroom/`, `UPSTREAM_PATCHES.md`, and a CI workflow to build the client image.

### Phase 1 — Stand up and validate (Days 3–7)
- [ ] Deploy CE on single-node K3s (official "hello-world VM" path) plus coturn on 443/TLS.
- [ ] Test with 1 host + 5 browser tabs + **the reference phone on prepaid mobile data** + **the lab laptop on the school network**.
- [ ] Check which features already work: PDF page sync, raised hands, room permissions, mute/kick, Audio Zones, **mobile touch controls**.
- [ ] **Measure the data used** by one phone for 15 minutes in Lecture Mode and in open discussion, and check whether Hubs streams audio from far-away speakers (§5.2).
- **🚦 Gate 1:** Does CE run stably, and do both reference devices connect *from mobile data and from inside the school network*? If not, fix the network first. Do not start building features.

### Phase 2 — Classroom scene and performance (Days 8–12)
- [ ] Build a low-poly classroom with a lecture zone, a podium waypoint, numbered seat waypoints and 4 breakout pods with **isolating Audio Zones**.
- [ ] Bake lighting in Blender and export through the Hubs Blender add-on, using Draco + KTX2.
- [ ] Add CI checks for the triangle, size and texture budgets.
- **🚦 Gate 2:** Both reference devices hold **45 FPS or more** (phone: 30 FPS or more in Lite mode) with 10 avatars in the room, and the scene is **under 8 MB**.

### Phase 3 — Teacher HUD and custom features (Days 13–20)
- [ ] Teacher HUD panel: Mute All, Lock Spawn/Draw/Voice (using existing permissions), Kick.
- [ ] Gather All and Seat Lock (custom broadcast messages with the role check).
- [ ] Megaphone toggle (code version).
- [ ] A hand-raise queue on the HUD, if Hubs doesn't already provide one.
- [ ] PPT → PDF converter sidecar.
- [ ] **Lecture Mode** (one HUD button: mute all learners, Gather to seats, Megaphone on). This is also the data saver.
- [ ] Pre-join card copied from FrameVR, with Lite mode, mic check and the privacy/screenshot rule.
- [ ] **Filipino translation** of the learner-facing UI (Hubs has an i18n system; check which locales exist and add `fil` if it's missing).
- **🚦 Gate 3:** A teacher who has never used the platform can run a 5-minute lesson using only the HUD, without help.

### Phase 4 — Hardening and pilot (Days 21–28)
- [ ] TLS, backups, a **restore drill**, monitoring and alerts, and turning off analytics.
- [ ] **Load test:** 30 simulated clients per room (headless browsers with fake audio), watching SFU CPU and egress.
- [ ] **Pilot:** a 15-minute mock lesson with 1 teacher and 5–8 students who have signed parent consent forms, using a mix of **phones on mobile data** and **lab laptops on the school network**.
- [ ] Measure join time (target under 30 s from link to classroom), FPS, audio dropouts and a teacher friction survey.
- [ ] **Run the same lesson in FrameVR `team-ric`** (8-person group) on the same phones and laptops and fill in the head-to-head table in §1A.
- **🚦 Gate 4 — the big decision:** stay on Hubs, or start the custom LiveKit + Colyseus build?
  - **Stay on Hubs** if customisation took less than 1.5× the estimate and the upstream rebase was painless.
  - **Start the custom build** if it fights us on the phone or laptop frame rate, the UI, or the patch count (more than about 25 edited upstream files).

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
| 2b | Mobile data cost stops learners joining | **High** | High | Lecture Mode default, 8 MB scene, audio from nearby speakers only, report data per lesson to teachers |
| 2c | Brownouts or signal drops mid-lesson | High | Medium | Auto-reconnect to seat, "reconnecting" badge, short lesson segments |
| 2d | DPO approval or consent forms delay the pilot | Medium | High | Start the paperwork in Phase 0, in parallel with engineering |
| 3 | Kubernetes ops overload a small team | Medium | High | Single-node K3s, one runbook, managed DB later |
| 4 | Hubs Foundation slows down | Low–Med | High | Thin changes on a subtree, MPL lets us self-maintain, Phase 5 escape hatch |
| 5 | Student misconduct in rooms | High | Medium | Locked permissions by default, kick/ban, report button, teacher-present rule |
| 6 | Privacy or compliance incident | Low | Critical | Guest-only students, no recording, retention purge, written security program |
| 7 | SFU overload at peak periods | Medium | High | Load test, room cap of 35, add an SFU node |

---

## 9. Team and Roles (minimum)

| Role | Owns |
| :--- | :--- |
| **Head programmer** | Repo and subtree strategy, Teacher HUD, custom features, upstream rebases |
| **Ops lead** | K3s, coturn, monitoring, backups, school IT liaison |
| **3D artist** (can be part-time) | Classroom scene, Audio Zones, asset pipeline |
| **Education lead / pilot teacher** | Lesson design, Gate 3 usability testing, feedback |
| **Privacy owner** (works with the Division DPO) | PIA and Child PIA, consent forms, privacy notices, breach runbook, retention policy |
| **School ICT coordinator** | Lab laptops, school internet, allowlist, pre-loading scenes |

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
2. Fail CI if a scene exceeds 150k triangles, 25 MB, any texture over 2048², or more than 120 meshes after merging.
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
