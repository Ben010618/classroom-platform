// Classroom message protocol. Pure functions only (no APP / AFRAME / NAF) so they run in unit tests.
//
// Teachers send commands over the hub channel as `message` events with type "classroom".
// Reticulum overwrites `session_id` with the real sender's, so receivers can trust it and check the
// sender's roles/permissions in presence before obeying.

export const CLASSROOM_MESSAGE_TYPE = "classroom";

export const COMMANDS = Object.freeze({
  GATHER: "gather", // { cmd, seats: { [sessionId]: waypointName }, fallback: waypointName }
  SEAT_LOCK: "seatLock" // { cmd, on: boolean }
});

// Room member permissions that Lecture Mode / the lock toggles control (enforced server-side by Reticulum).
export const LOCKABLE_PERMISSIONS = Object.freeze([
  "voice_chat",
  "text_chat",
  "spawn_and_move_media",
  "spawn_drawing",
  "spawn_camera",
  "pin_objects",
  "spawn_emoji",
  "fly"
]);

const WAYPOINT_NAME = /^[A-Za-z0-9 _.-]{1,64}$/;
const MAX_SEATS = 200;

export const isValidWaypointName = name => typeof name === "string" && WAYPOINT_NAME.test(name);

function latestMeta(presenceState, sessionId) {
  const entry = presenceState && presenceState[sessionId];
  const metas = entry && entry.metas;
  return metas && metas.length ? metas[metas.length - 1] : null;
}

/** Owners, creators and anyone allowed to kick or mute users count as teachers. */
export function isTeacherMeta(meta) {
  if (!meta) return false;
  const roles = meta.roles || {};
  const perms = meta.permissions || {};
  return !!(roles.owner || roles.creator || perms.kick_users || perms.mute_users);
}

export const isTeacher = (presenceState, sessionId) => isTeacherMeta(latestMeta(presenceState, sessionId));

/** Validates and normalises an incoming command body. Returns null for anything malformed. */
export function parseCommand(body) {
  if (!body || typeof body !== "object") return null;
  switch (body.cmd) {
    case COMMANDS.GATHER: {
      const seats = {};
      const raw = body.seats && typeof body.seats === "object" ? body.seats : {};
      const keys = Object.keys(raw).slice(0, MAX_SEATS);
      for (const sid of keys) {
        if (typeof sid === "string" && sid.length <= 64 && isValidWaypointName(raw[sid])) seats[sid] = raw[sid];
      }
      const fallback = isValidWaypointName(body.fallback) ? body.fallback : null;
      if (!fallback && !Object.keys(seats).length) return null;
      return { cmd: COMMANDS.GATHER, seats, fallback };
    }
    case COMMANDS.SEAT_LOCK:
      return { cmd: COMMANDS.SEAT_LOCK, on: body.on === true };
    default:
      return null;
  }
}

/**
 * Decides what this client should do with an incoming classroom message.
 * Returns null (ignore) or the parsed command. Teachers never move themselves.
 */
export function commandForMe({ type, body, senderSessionId, mySessionId, presenceState }) {
  if (type !== CLASSROOM_MESSAGE_TYPE) return null;
  if (!isTeacher(presenceState, senderSessionId)) return null;
  if (isTeacher(presenceState, mySessionId)) return null;
  return parseCommand(body);
}

/** Where should I go for a gather command? My assigned seat, else the fallback waypoint. */
export const gatherTarget = (cmd, mySessionId) => (cmd.seats && cmd.seats[mySessionId]) || cmd.fallback || null;

/**
 * Teacher side: assigns learners to seat waypoints. Keeps previous assignments where possible so
 * students don't hop seats between gathers, then fills free seats in name order.
 * Learners beyond the seat count get no seat (they go to the fallback waypoint).
 */
export function assignSeats(previous, learnerIds, seatNames) {
  const seatsSorted = [...seatNames]
    .filter(isValidWaypointName)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const result = {};
  const taken = new Set();
  for (const id of learnerIds) {
    const prev = previous && previous[id];
    if (prev && seatsSorted.includes(prev) && !taken.has(prev)) {
      result[id] = prev;
      taken.add(prev);
    }
  }
  const free = seatsSorted.filter(s => !taken.has(s));
  for (const id of learnerIds) {
    if (result[id] || !free.length) continue;
    result[id] = free.shift();
  }
  return result;
}

/** Learners = everyone present in the room who is not a teacher. */
export function learnerIds(presenceState) {
  return Object.keys(presenceState || {}).filter(sid => {
    const meta = latestMeta(presenceState, sid);
    return meta && meta.presence === "room" && !isTeacherMeta(meta);
  });
}

/** Builds the full `updateHub` payload from the current hub, changing only member permissions. */
export function hubSettingsWithPermissions(hub, changes) {
  return {
    name: hub.name,
    description: hub.description,
    room_size: hub.room_size,
    entry_mode: hub.entry_mode,
    allow_promotion: hub.allow_promotion,
    user_data: hub.user_data,
    member_permissions: { ...(hub.member_permissions || {}), ...changes }
  };
}

/** Lecture Mode: learners can listen and watch, but cannot talk, chat or spawn things. */
export function lectureModePermissions(on) {
  const value = !on;
  return Object.fromEntries(LOCKABLE_PERMISSIONS.filter(p => p !== "fly").map(p => [p, value]));
}
