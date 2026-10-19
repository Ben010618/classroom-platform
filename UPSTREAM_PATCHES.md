# Upstream Patches

Every file under `hubs/` that came from `Hubs-Foundation/hubs` and that we modify. These files stay under MPL-2.0.
New files (`hubs/src/classroom/`, `hubs/src/react-components/classroom/`, `hubs/test/unit/classroom/`) are our own.

**Gate 4 rule:** if this list grows past about 25 files, raise the "stay on Hubs vs custom stack" decision early.
Every patched line is marked with a `classroom: UPSTREAM_PATCHES #n` comment. Search for it after a `git subtree pull`.

| # | Upstream file | Why we touched it | Hook added | Date | Rebase notes |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | `hubs/src/hub.js` | Receive classroom commands (Gather, Seat Lock); start the hand-raise queue | 1 import; `initClassroom()` after `APP.messageDispatch` is set; early `return receiveClassroomMessage(...)` for `type === "classroom"` at the top of `hubPhxChannel.on("message")` so the commands never show in chat | 2026-10-19 | 3 marked spots. If the message handler moves, keep the early return **before** `messageDispatch.receive`. |
| 2 | `hubs/src/react-components/ui-root.js` | Teacher toolbar button + Teacher Controls sidebar | 1 import; `sidebarId === "teacher"` block before the `"profile"` sidebar; a `ToolbarButton` after `ChatToolbarButton`, shown when `entered && isModerator` | 2026-10-19 | 3 marked spots. Depends on the existing `isModerator`, `toggleSidebar` and `setSidebar`. |
| 3 | `hubs/src/assets/locales/locale_config.js` | Register Filipino | `fil: "Filipino"` in `AVAILABLE_LOCALES`; `tl → fil` in `FALLBACK_LOCALES` | 2026-10-19 | 2 marked lines. `fil.json` is our own new file. |
| 4 | `hubs/src/react-components/room/RoomEntryModal.js` + `ui-root.js` | Pre-join card (Lite mode, class rules) on the entry screen | `RoomEntryModal` now renders `children` under the room name; `ui-root` passes `<ClassroomPreJoinContainer store>` as its child (1 import + the child) | 2026-10-19 | 3 marked spots in RoomEntryModal, 2 in ui-root. If upstream adds its own `children` use, merge them. |
