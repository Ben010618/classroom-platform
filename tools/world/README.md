# Bayanihan Demo School — world generator

One world definition ([`world.js`](world.js)) produces two things:

| Output | What | How |
| :--- | :--- | :--- |
| **Walkable preview** | [`index.html`](index.html): first-person walk in any browser (keyboard, mouse or touch), with "Go to" buttons and a toggle showing the Hubs markers | `npm run preview`, then open http://localhost:8766 |
| **Hubs scene** | `assets/scenes/bayanihan-school.glb`: Draco-compressed, with `MOZ_hubs_components` | `npm ci && npm run export` |

## The world

| Place | Contents |
| :--- | :--- |
| Main gate | Gate arch, perimeter fence, 4 spawn points |
| Flag plaza | Raised platform, flagpole (plain flag), 3 benches |
| School building | 4 classrooms on a covered veranda (rooms 2–4 closed) |
| **Classroom 1** | Chalkboard + slide screen, lectern, teacher's table, **35 desks with chairs (5 × 7)**, **4 breakout pods** with 5 stools each |
| Covered court | Court with lines and two hoops under a roof |
| Grounds | ~50 low-poly trees, walkway, grass |

**Budget:** 12,166 triangles · 22 draw calls · 0.34 MB (targets: 80k · 80 · 8 MB). The Khronos glTF validator reports 0 errors and 0 warnings.

## Hubs markers written into the scene

| Node | Hubs component | Used by |
| :--- | :--- | :--- |
| `seat-01` … `seat-35` | `waypoint` (occupiable, disables motion and teleport) | Gather to seats, Seat Lock, Lecture Mode |
| `podium` | `waypoint` (faces the class) | Gather to podium, teacher spot |
| `pod-a` … `pod-d` | `audio-zone` (in↔out isolated) + `audio-params`, scaled to the pod | Breakout groups can't hear each other |
| `pod-a-spot` … | `waypoint` | "Go to pod" |
| `screen` | `media-frame` (4.8 × 2.7 m, all-2d) | Teacher drops the PDF slides here |
| `spawn-01` … `spawn-04` | `waypoint` (spawn point) | Where learners appear, at the gate |
| `classroom-1`, `flag-plaza`, `covered-court` | `waypoint` | Quick travel |
| `navmesh` | `nav-mesh` + `visible: false` | Walkable ground |
| `sky-light`, `sun` | `hemisphere-light`, `directional-light` | Lighting (no shadows, per budget) |

## Known gaps (v1)

- **Navmesh is one flat plane.** Walls are solid in the preview but not in Hubs yet, so avatars can walk through walls. Fix: generate a navmesh with the building cut out, or make it in Blender.
- **Podium microphone and speakers** (`audio-source` with only-moderators + `audio-target` nodes) are not in the file yet: they link nodes by index, which is easier to set in the Hubs Blender add-on. Until then, the teacher uses Lecture Mode (learners muted) instead of the megaphone.
- **Signs** (school name, "Room 1", board greeting) exist only in the preview. They're canvas textures and are not exported.
- Untested in a live Hubs room. That's part of Gate 2, once the Phase 1 server exists.
