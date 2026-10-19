# Bayanihan Demo School — world generator

**Walk it now:** https://ben010618.github.io/classroom-platform/world/ (GitHub Pages, works on any phone or laptop browser, no install)

**Run it from your own PC (offline copy):** download `index.html` and `world.js` into one folder and double-click `index.html`. It needs an internet connection to load the three.js library from the CDN (cached after the first visit).

**Publish changes to the public page** (the `gh-pages` branch serves the device check at `/` and the world at `/world/`):
```bash
git worktree add ../pages origin/gh-pages -b pages-update
cp tools/world/index.html tools/world/world.js ../pages/world/
cd ../pages && git commit -am "Update world" && git push origin pages-update:gh-pages
```

One world definition ([`world.js`](world.js)) produces two things:

| Output | What | How |
| :--- | :--- | :--- |
| **Walkable preview** | [`index.html`](index.html): first-person walk in any browser (keyboard, mouse or touch), with "Go to" buttons and a toggle showing the Hubs markers | `npm run preview`, then open http://localhost:8766 |
| **Hubs scene** | `assets/scenes/bayanihan-school.glb`: Draco-compressed, with `MOZ_hubs_components` | `npm ci && npm run export` |

## Realistic mode (default) and Simple graphics

The preview loads real, **CC0** assets from [Poly Haven](https://polyhaven.com) (credits: [`assets/CREDITS.md`](assets/CREDITS.md)):

| What | Asset | After reduction |
| :--- | :--- | :--- |
| Learner desks + chairs (35 each, GPU-instanced) | *School Desk 01*, *School Chair 01* | 580 + 506 triangles each (from 4,162 + 5,072) |
| Teacher's desk, book shelves, 4 ceiling fans (spinning) | *Metal Office Desk*, *Shelf 01*, *Ceiling Fan* | 3.4k / 0.2k / 1.6k triangles |
| Floor, walls, roof, plaza, lawn, court, wood | *terrazzo_tiles*, *painted_plaster_wall*, *corrugated_iron*, *concrete_floor_02*, *leafy_grass*, *asphalt_floor*, *wood_table* | 512 px colour + normal maps |
| Sky and lighting | *Kloofendal 48d Partly Cloudy (Pure Sky)* | 1K HDR for lighting, 2K JPG for the visible sky |

Total download about **3.1 MB**. The full view is about 70k triangles and 26–41 draw calls (targets 80k / 80).
**Simple graphics** (top-right button, remembered per device) skips all of it for very old phones. The page also falls back to it automatically if an asset fails to load.
Refresh the assets with `npm run assets` (`fetch-assets.mjs` downloads, shrinks to 512 px, simplifies the models and writes the credits).

The Hubs scene export still uses the simple box furniture. Putting the real models in the Hubs file needs a check that Hubs loads GPU-instanced meshes (`EXT_mesh_gpu_instancing`) — Gate 2.

## The world

| Place | Contents |
| :--- | :--- |
| Main gate | Gate arch, perimeter fence, 4 spawn points |
| Flag plaza | Raised platform, flagpole (plain flag), 3 benches |
| School building | 4 classrooms on a covered veranda (rooms 2–4 closed) |
| **Classroom 1** | Terrazzo floor, chalkboard + slide screen, lectern, teacher's desk, book shelves, 12 fluorescent tube lights, 4 ceiling fans, **35 desks with chairs (5 × 7)**, **4 breakout pods** with 5 stools each |
| Covered court | Court with lines and two hoops under a roof |
| Grounds | ~50 shade trees, walkway, lawn |

**Hubs scene budget:** 26,526 triangles · 22 draw calls · 0.71 MB (targets: 80k · 80 · 8 MB).

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
