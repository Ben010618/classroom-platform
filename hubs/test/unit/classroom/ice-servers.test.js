import test from "ava";
import { buildIceServers } from "../../../src/classroom/ice-servers";

const TURN = { enabled: true, username: "u", credential: "c", transports: [{ port: 5349 }] };
const urls = list => list.map(s => s.urls);

test("never adds a third-party STUN server", t => {
  t.false(JSON.stringify(buildIceServers("stream.x", TURN)).includes("google"));
  t.deepEqual(buildIceServers("stream.x", { enabled: false }), []);
  t.deepEqual(buildIceServers("stream.x", null), []);
});

test("keeps upstream TURN entries (DTLS + TCP) with credentials", t => {
  const list = buildIceServers("stream.x", TURN);
  t.deepEqual(urls(list), ["turns:stream.x:5349", "turns:stream.x:5349?transport=tcp"]);
  t.true(list.every(s => s.username === "u" && s.credential === "c"));
});

test("force_tcp drops the DTLS entry", t => {
  t.deepEqual(urls(buildIceServers("stream.x", TURN, { forceTcp: true })), ["turns:stream.x:5349?transport=tcp"]);
});

test("turn443Host adds a 443 relay on its own host", t => {
  t.deepEqual(urls(buildIceServers("stream.x", TURN, { forceTcp: true, turn443Host: "turn.x" })), [
    "turns:stream.x:5349?transport=tcp",
    "turns:turn.x:443?transport=tcp"
  ]);
});

test("turn443Host replaces the host of an announced 443 transport instead of duplicating it", t => {
  const turn = { ...TURN, transports: [{ port: 5349 }, { port: 443 }] };
  t.deepEqual(urls(buildIceServers("stream.x", turn, { forceTcp: true, turn443Host: "turn.x" })), [
    "turns:stream.x:5349?transport=tcp",
    "turns:turn.x:443?transport=tcp"
  ]);
});

test("turn443Host does nothing while TURN is disabled", t => {
  t.deepEqual(buildIceServers("stream.x", { enabled: false }, { turn443Host: "turn.x" }), []);
});

test("our own STUN URLs are appended, trimmed, empties ignored", t => {
  t.deepEqual(urls(buildIceServers("stream.x", null, { stunUrls: " stun:turn.x:3478 , ,stun:b:3478" })), [
    "stun:turn.x:3478",
    "stun:b:3478"
  ]);
});
