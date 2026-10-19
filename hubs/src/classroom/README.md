# src/classroom — 3D Virtual Classroom add-on

All classroom features live in this folder. Upstream Hubs files are touched only through
small hooks, and each one is logged in [`/UPSTREAM_PATCHES.md`](../../../UPSTREAM_PATCHES.md) at the repo root.

## What we reuse from Hubs (no code)

| Feature                                      | Hubs mechanism                                                                                                   | Where                          |
| :------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :----------------------------- |
| Lock spawn / draw / pin / fly / voice / text | Room member permissions (`hub_channel.js` `HUB_CREATOR_PERMISSIONS`)                                             | Room settings                  |
| Megaphone                                    | Audio source (podium mic, `onlyMods`) → audio targets (speakers). Only users with `amplify_audio` are picked up. | Scene (Blender add-on / Spoke) |
| Breakout pod isolation                       | Audio zones (`bit-systems/audio-zone-system.ts`)                                                                 | Scene                          |
| Hand raise                                   | Presence `hand_raised` (People sidebar, name tag)                                                                | Built in                       |
| PDF slides                                   | `media-pdf` + `NetworkedPDF` (page index is networked)                                                           | Built in                       |
| Mute a user                                  | `hubChannel.mute()` — Reticulum checks `mute_users`                                                              | Built in                       |

## Files

| File                                                  | What                                                                                                                |
| :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `protocol.js`                                         | Pure logic: message validation, who counts as a teacher, seat assignment, Lecture Mode permissions. Unit-tested.    |
| `hand-queue.js`                                       | Pure logic: first-come, first-served hand-raise queue (Hubs has no raise timestamp, so we record one). Unit-tested. |
| `runtime.js`                                          | Connects it to Hubs: receives commands, teleports via `#waypoint`, holds the seat lock, teacher actions.            |
| `../react-components/classroom/TeacherHudSidebar*.js` | Teacher Controls panel (presentational + container + Storybook stories).                                            |
| `../../test/unit/classroom/classroom.test.js`         | ava tests for `protocol.js` and `hand-queue.js`.                                                                    |
| `../assets/locales/fil.json`                          | Filipino strings (classroom strings now; full UI is #19).                                                           |

## Classroom message protocol

Teachers send commands over the existing hub channel `message` event with `type: "classroom"`.
Reticulum (`hub_channel.ex`, `handle_in("message")`) broadcasts any type and **overwrites `session_id`
with the real sender's**, so receivers can trust it. `hub.js` routes these messages to
`receiveClassroomMessage()` _before_ chat, so they never appear in the chat log.

| Command   | Body                                                                       | Learner does                                                          |
| :-------- | :------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| Gather    | `{ cmd: "gather", seats: { [sessionId]: "seat-07" }, fallback: "podium" }` | Teleports to its seat, or the fallback if it has none                 |
| Seat Lock | `{ cmd: "seatLock", on: true }`                                            | Movement and teleport disabled (re-applied every 500 ms while locked) |

**Who is obeyed:** only senders whose latest presence meta has `roles.owner`, `roles.creator`, or the
`kick_users` / `mute_users` permission. Teachers never obey commands themselves. Malformed bodies and
unsafe waypoint names (anything outside `A-Z a-z 0-9 space _ . -`, at most 64 characters) are dropped.

**Security model:** Gather and Seat Lock are _classroom management_, enforced on the client. A learner who
modifies their own client can only avoid being moved themselves. Everything that protects _safety_
(talking, chat, spawning objects, drawing) goes through room member permissions, which **Reticulum enforces**.

**Lecture Mode** = member permissions `voice_chat`, `text_chat`, `spawn_*`, `pin_objects` all off
(server-enforced), then Mute all → Gather to seats → Seat Lock. Ending it restores the permissions and unlocks seats.

## Scene requirements

See [docs/scene-authoring.md](../../../docs/scene-authoring.md). Short version: one waypoint named
`podium`, and seat waypoints named `seat-01`, `seat-02`, … with _Disable motion_ checked.

## Developing in Codespaces

On GitHub, choose **Code → Codespaces → Create codespace on `main`** in `Ben010618/classroom-platform`. This needs a 4-core machine, and the `hubs/` dependencies install automatically. Run the commands below from `hubs/`.

| Command             | What it gives you                                                                          |
| :------------------ | :----------------------------------------------------------------------------------------- |
| `npm run storybook` | Storybook on port 6006. **Build the Teacher HUD here**, in isolation and without a server. |
| `npm run test`      | Lint + unit tests                                                                          |
| `npm run build`     | Production build (the same as CI)                                                          |

Voice and multi-user testing need the full stack, which comes in Phase 1 on our own server. Codespaces cannot carry WebRTC voice.

## CI

`/.github/workflows/classroom-build.yml` (at the repo root) builds the client image whenever `hubs/` changes on `main`,
and publishes it as `ghcr.io/ben010618/classroom-hubs:latest` (also tagged with the run number).

## Status

- ✅ Teacher Controls panel, Gather All, Seat Lock, Lecture Mode, hand-raise queue (#14–#17). **Not yet tested in a live room;** that needs the Phase 1 server.
- 🟡 Filipino locale: registered, with classroom strings translated. The full UI translation is still to do (#19).
- ⬜ Pre-join card: Lite mode, mic check, privacy/screenshot rule (#18)
- ⬜ PPT → PDF conversion (server sidecar, #20)
