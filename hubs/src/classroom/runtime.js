// Classroom runtime: connects the pure protocol (protocol.js) to the live Hubs client.
// Learner side: obeys Gather / Seat Lock from teachers. Teacher side: actions used by the Teacher HUD.
import {
  CLASSROOM_MESSAGE_TYPE,
  COMMANDS,
  commandForMe,
  gatherTarget,
  assignSeats,
  learnerIds,
  isTeacherMeta,
  hubSettingsWithPermissions,
  lectureModePermissions,
  isValidWaypointName
} from "./protocol";

import { updateHandQueue, peopleFromPresence } from "./hand-queue";

const SEAT_NAME = /^seat[-_ ]?\d+$/i;
const HAND_QUEUE_POLL_MS = 1000;

// ---------------------------------------------------------------- hand-raise queue (any client)

let handQueue = [];
const handQueueListeners = new Set();

function refreshHandQueue() {
  const state = window.APP.hubChannel?.presence?.state;
  if (!state) return;
  const next = updateHandQueue(handQueue, peopleFromPresence(state), Date.now());
  const changed =
    next.length !== handQueue.length || next.some((e, i) => e.id !== handQueue[i].id || e.name !== handQueue[i].name);
  handQueue = next;
  if (changed) handQueueListeners.forEach(fn => fn(handQueue));
}

export const getHandQueue = () => handQueue;
export function subscribeHandQueue(fn) {
  handQueueListeners.add(fn);
  return () => handQueueListeners.delete(fn);
}

let initialized = false;
/** Called once from hub.js after the hub channel and message dispatch exist. */
export function initClassroom() {
  if (initialized) return;
  initialized = true;
  setInterval(refreshHandQueue, HAND_QUEUE_POLL_MS);
}
const DEFAULT_GATHER_POINT = "podium";
const LOCK_REASSERT_MS = 500;

let seatLocked = false;
let lockTimer = null;
let lastSeatAssignment = {};

const characterController = () => window.AFRAME?.scenes[0]?.systems["hubs-systems"]?.characterController;

/** Teleport via the URL fragment — the waypoint systems of both the legacy and bitECS clients handle it. */
function goToWaypoint(name) {
  if (!isValidWaypointName(name)) return;
  window.location.hash = "#" + name;
}

function applyMotionLock(on) {
  const cc = characterController();
  if (!cc) return;
  cc.isMotionDisabled = on;
  cc.isTeleportingDisabled = on;
  if (on) cc.fly = false;
}

function setSeatLocked(on) {
  seatLocked = on;
  clearInterval(lockTimer);
  lockTimer = null;
  applyMotionLock(on);
  // Waypoint travel and teleportTo() reset the controller flags, so keep re-asserting while locked.
  if (on) lockTimer = setInterval(() => applyMotionLock(true), LOCK_REASSERT_MS);
}

export const isSeatLocked = () => seatLocked;

/**
 * Called from hub.js for every incoming message of type "classroom" (they are not shown in chat).
 * @param {{sessionId:string, type:string, body:object}} message
 */
export function receiveClassroomMessage(message) {
  const hubChannel = window.APP.hubChannel;
  const cmd = commandForMe({
    type: message.type,
    body: message.body,
    senderSessionId: message.sessionId,
    mySessionId: window.NAF?.clientId,
    presenceState: hubChannel?.presence?.state
  });
  if (!cmd) return;
  switch (cmd.cmd) {
    case COMMANDS.GATHER: {
      const target = gatherTarget(cmd, window.NAF.clientId);
      if (!target) return;
      const relock = seatLocked;
      if (relock) setSeatLocked(false); // let the waypoint travel happen
      goToWaypoint(target);
      if (relock) setTimeout(() => setSeatLocked(true), 1500);
      break;
    }
    case COMMANDS.SEAT_LOCK:
      setSeatLocked(cmd.on);
      break;
  }
}

// ---------------------------------------------------------------- teacher actions

const send = body => window.APP.hubChannel.sendMessage(body, CLASSROOM_MESSAGE_TYPE);

/** Names of seat waypoints in the current scene (objects named seat-01, seat_2, "Seat 3", …). */
export function sceneSeatNames() {
  const names = new Set();
  window.AFRAME?.scenes[0]?.object3D.traverse(o => {
    if (SEAT_NAME.test(o.name)) names.add(o.name);
  });
  return [...names];
}

export function gatherAll({ toSeats = true, fallback = DEFAULT_GATHER_POINT } = {}) {
  const presenceState = window.APP.hubChannel.presence.state;
  const seats = toSeats ? assignSeats(lastSeatAssignment, learnerIds(presenceState), sceneSeatNames()) : {};
  if (toSeats) lastSeatAssignment = seats;
  send({ cmd: COMMANDS.GATHER, seats, fallback });
}

export const sendSeatLock = on => send({ cmd: COMMANDS.SEAT_LOCK, on });

/** Mutes every learner in the room (server checks the mute_users permission). */
export function muteAllLearners() {
  const hubChannel = window.APP.hubChannel;
  const state = hubChannel.presence.state;
  for (const sid of Object.keys(state)) {
    const metas = state[sid].metas;
    const meta = metas[metas.length - 1];
    if (meta.presence === "room" && !isTeacherMeta(meta)) hubChannel.mute(sid);
  }
}

/** Sets room member permissions (enforced by Reticulum). `changes` = { voice_chat: false, … }. */
export function setMemberPermissions(changes) {
  const hub = window.APP.hub;
  return window.APP.hubChannel.updateHub(hubSettingsWithPermissions(hub, changes));
}

/** Lecture Mode: learners muted and unable to talk/chat/spawn, gathered to seats and seat-locked. */
export function setLectureMode(on) {
  setMemberPermissions(lectureModePermissions(on));
  if (on) {
    muteAllLearners();
    gatherAll({ toSeats: true });
    setTimeout(() => sendSeatLock(true), 1500);
  } else {
    sendSeatLock(false);
  }
}

export function isLectureMode(memberPermissions) {
  const p = memberPermissions || {};
  return p.voice_chat === false && p.text_chat === false && p.spawn_and_move_media === false;
}
