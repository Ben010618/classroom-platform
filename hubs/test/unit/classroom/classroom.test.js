import test from "ava";
import {
  CLASSROOM_MESSAGE_TYPE,
  COMMANDS,
  isTeacher,
  parseCommand,
  commandForMe,
  gatherTarget,
  assignSeats,
  learnerIds,
  hubSettingsWithPermissions,
  lectureModePermissions
} from "../../../src/classroom/protocol";
import { updateHandQueue, peopleFromPresence } from "../../../src/classroom/hand-queue";

const meta = (extra = {}) => ({
  presence: "room",
  roles: {},
  permissions: {},
  profile: { displayName: "x" },
  ...extra
});
const PRESENCE = {
  teacher: { metas: [meta({ roles: { owner: true } })] },
  mod: { metas: [meta({ permissions: { mute_users: true } })] },
  ana: { metas: [meta({ profile: { displayName: "Ana" } })] },
  ben: { metas: [meta({ profile: { displayName: "Ben" } })] },
  lobby: { metas: [meta({ presence: "lobby" })] }
};

test("teachers are owners, creators, or users who can mute/kick", t => {
  t.true(isTeacher(PRESENCE, "teacher"));
  t.true(isTeacher(PRESENCE, "mod"));
  t.false(isTeacher(PRESENCE, "ana"));
  t.false(isTeacher(PRESENCE, "nobody"));
});

test("uses the latest presence meta", t => {
  const state = { x: { metas: [meta({ roles: { owner: true } }), meta()] } };
  t.false(isTeacher(state, "x"));
});

test("parseCommand rejects junk and bad waypoint names", t => {
  t.is(parseCommand(null), null);
  t.is(parseCommand({ cmd: "selfDestruct" }), null);
  t.is(parseCommand({ cmd: COMMANDS.GATHER }), null);
  t.is(parseCommand({ cmd: COMMANDS.GATHER, fallback: "<script>" }), null);
  t.deepEqual(parseCommand({ cmd: COMMANDS.GATHER, fallback: "podium", seats: { ana: "seat-01", ben: "../../x" } }), {
    cmd: COMMANDS.GATHER,
    seats: { ana: "seat-01" },
    fallback: "podium"
  });
  t.deepEqual(parseCommand({ cmd: COMMANDS.SEAT_LOCK, on: "yes" }), { cmd: COMMANDS.SEAT_LOCK, on: false });
});

test("commandForMe: only obey teachers; teachers ignore commands", t => {
  const body = { cmd: COMMANDS.SEAT_LOCK, on: true };
  const base = { type: CLASSROOM_MESSAGE_TYPE, body, presenceState: PRESENCE };
  t.deepEqual(commandForMe({ ...base, senderSessionId: "teacher", mySessionId: "ana" }), { cmd: "seatLock", on: true });
  t.is(commandForMe({ ...base, senderSessionId: "ben", mySessionId: "ana" }), null, "learner cannot command");
  t.is(commandForMe({ ...base, senderSessionId: "teacher", mySessionId: "mod" }), null, "teachers don't obey");
  t.is(commandForMe({ ...base, type: "chat", senderSessionId: "teacher", mySessionId: "ana" }), null);
});

test("gatherTarget prefers my seat, else fallback", t => {
  const cmd = { cmd: COMMANDS.GATHER, seats: { ana: "seat-02" }, fallback: "podium" };
  t.is(gatherTarget(cmd, "ana"), "seat-02");
  t.is(gatherTarget(cmd, "ben"), "podium");
  t.is(gatherTarget({ cmd: COMMANDS.GATHER, seats: {}, fallback: null }, "ben"), null);
});

test("assignSeats keeps previous seats and fills in natural order", t => {
  const seats = ["seat-10", "seat-2", "seat-1"];
  t.deepEqual(assignSeats({}, ["a", "b", "c"], seats), { a: "seat-1", b: "seat-2", c: "seat-10" });
  t.deepEqual(assignSeats({ c: "seat-1" }, ["a", "b", "c"], seats), { c: "seat-1", a: "seat-2", b: "seat-10" });
  t.deepEqual(assignSeats({}, ["a", "b"], ["seat-1"]), { a: "seat-1" }, "overflow learners get no seat");
});

test("learnerIds excludes teachers and people still in the lobby", t => {
  t.deepEqual(learnerIds(PRESENCE).sort(), ["ana", "ben"]);
});

test("hubSettingsWithPermissions keeps every other setting", t => {
  const hub = {
    name: "Room",
    description: "d",
    room_size: 30,
    entry_mode: "allow",
    allow_promotion: false,
    user_data: { a: 1 },
    member_permissions: { voice_chat: true, fly: true }
  };
  const out = hubSettingsWithPermissions(hub, { voice_chat: false });
  t.deepEqual(out.member_permissions, { voice_chat: false, fly: true });
  t.is(out.name, "Room");
  t.is(out.room_size, 30);
  t.deepEqual(out.user_data, { a: 1 });
});

test("lecture mode turns off talking and spawning but leaves fly alone", t => {
  const on = lectureModePermissions(true);
  t.false(on.voice_chat);
  t.false(on.spawn_and_move_media);
  t.false("fly" in on);
  t.true(lectureModePermissions(false).voice_chat);
});

test("hand queue is first-come first-served and drops lowered hands", t => {
  let q = updateHandQueue([], [{ id: "b", name: "Ben", handRaised: true }], 100);
  q = updateHandQueue(
    q,
    [
      { id: "b", name: "Ben", handRaised: true },
      { id: "a", name: "Ana", handRaised: true }
    ],
    200
  );
  t.deepEqual(
    q.map(e => [e.id, e.since]),
    [
      ["b", 100],
      ["a", 200]
    ]
  );
  q = updateHandQueue(
    q,
    [
      { id: "b", name: "Ben", handRaised: false },
      { id: "a", name: "Ana", handRaised: true }
    ],
    300
  );
  t.deepEqual(
    q.map(e => e.id),
    ["a"]
  );
  q = updateHandQueue(
    q,
    [
      { id: "a", name: "Ana", handRaised: true },
      { id: "b", name: "Ben", handRaised: true }
    ],
    400
  );
  t.deepEqual(
    q.map(e => [e.id, e.since]),
    [
      ["a", 200],
      ["b", 400]
    ],
    "re-raising goes to the back"
  );
});

test("peopleFromPresence reads name and hand flag", t => {
  const people = peopleFromPresence({ x: { metas: [meta({ profile: { displayName: "Xi" }, hand_raised: true })] } });
  t.deepEqual(people, [{ id: "x", name: "Xi", handRaised: true }]);
});
