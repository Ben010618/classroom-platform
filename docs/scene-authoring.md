# Classroom Scene Authoring Guide

For the 3D artist building the classroom scene (#11) with the **Hubs Blender add-on**. The teacher controls depend on the object names and settings below, so get them exactly right.

## Required objects

| Object | Name (exact) | Hubs component | Settings | Used by |
| :--- | :--- | :--- | :--- | :--- |
| Lecture spot | `podium` | **Waypoint** | `canBeSpawnPoint` off · `canBeOccupied` off | "Gather to podium"; fallback when seats run out |
| Learner seats (×30–35) | `seat-01`, `seat-02`, … `seat-35` | **Waypoint** | `canBeOccupied` **on** · `willDisableMotion` **on** · `willDisableTeleporting` **on** · `snapToNavMesh` on · `willMaintainInitialOrientation` on. Face each seat toward the board. | "Gather to seats", Seat Lock, Lecture Mode |
| Spawn points (×4+) | `spawn-01`, … | **Waypoint** | `canBeSpawnPoint` **on** | Where learners appear on joining |
| Podium microphone | `podium-mic` | **Audio Source** | **only moderators** (`onlyMods`) on · `muteSelf` on · small radius (~1.5 m) around the podium | Megaphone. It only picks up the teacher. |
| Speakers (×4) | `speaker-01`, … | **Audio Target** | Source = `podium-mic`. Place in the room corners. | Megaphone output |
| Breakout pods (×4) | `pod-a` … `pod-d` | **Audio Zone** | `inOut` and `outIn` on (isolates the pod in both directions). Box covering the pod table. | Groups don't hear each other |
| Pod waypoints | `pod-a`, … `pod-d` (on a child empty) | **Waypoint** | `canBeOccupied` off | "Go To" menu / teleport to a pod |
| Slide screen | `screen` | Media frame or pinned PDF | 16:9, about 4 m wide, behind the podium | Slides |

Notes:
- Seat names are matched by the pattern `seat` + optional `-`/`_`/space + a number (`seat-07`, `seat_7` and `Seat 7` all work), and are sorted in natural order (2 before 10). Keep it simple and use `seat-01` … `seat-35`.
- With fewer seats than learners, the extra learners go to `podium`, and the teacher panel shows a warning.
- Waypoint names may only contain letters, numbers, spaces, `_`, `.` and `-` (64 characters at most). The client ignores any other name.

## Layout (suggested)

```
            [ screen ]
             podium  (podium-mic radius)
   speaker-01                     speaker-02
   seat-01 seat-02 ... seat-07          ┐
   seat-08 ...                          │  lecture zone (5 rows × 7)
   ...                     seat-35      ┘
   pod-a ⟨audio zone⟩       pod-b ⟨audio zone⟩
   pod-c ⟨audio zone⟩       pod-d ⟨audio zone⟩
   speaker-03                     speaker-04
   spawn-01 … spawn-04 (near the entrance)
```

## Performance budget (enforced in CI)

Run `node tools/asset-budget/check.mjs assets/` before committing. The full budget is in [BLUEPRINT §4](../BLUEPRINT.md).

| | Target | Hard cap |
| :--- | ---: | ---: |
| File size | **8 MB** | 15 MB |
| Triangles | 80k | 150k |
| Draw calls (mesh primitives) | 80 | 120 |
| Textures | 1024² | 2048² (boards only) |

- **Bake all lighting** into lightmaps. No real-time shadows.
- **Merge static meshes** that share a material (desks, chairs, walls), because seats repeat ×35.
- Export, then compress: `npx gltf-transform optimize in.glb out.glb --compress draco --texture-compress ktx2`.
- Store the source `.blend` outside git (it's large). Commit only the optimized `.glb` to `assets/scenes/`.

## Test checklist (Gate 2)

- [ ] `check.mjs` passes
- [ ] 45 FPS or more on the lab laptop, and 30 FPS or more on the budget Android phone in Lite mode, with 10 avatars
- [ ] "Gather to seats" seats every learner facing the board, and they can't walk away while locked
- [ ] The teacher's voice from the podium comes out of all speakers; a learner standing at the podium is **not** amplified
- [ ] Two pods side by side can't hear each other
