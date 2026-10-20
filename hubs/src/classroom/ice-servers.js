// ICE servers for the Dialog SFU. Replaces upstream's list, which always added
// Google's public STUN (issue #34, learner IPs to a third party) and only knew
// the stream host for TURN (issue #33, school firewalls that allow only 443).
//
// Dialog (mediasoup) is ICE-lite with a public IP, so clients reach it from their
// host candidates and need no STUN. TURN stays the fallback when UDP is blocked.

// Per-deployment settings. Edit here before building, or override without a
// rebuild with meta tags in the page head:
//   <meta name="env:classroom_stun_urls" content="stun:turn.example.edu.ph:3478">
//   <meta name="env:classroom_turn_443_host" content="turn.example.edu.ph">
export const DEFAULTS = {
  // Comma-separated STUN URLs on OUR infrastructure. Empty = no STUN (recommended).
  stunUrls: "",
  // Host of a coturn TLS listener on port 443 (a second public IP, BLUEPRINT §5.2).
  // Empty = not deployed; clients use the TURN ports Reticulum announces.
  turn443Host: ""
};

function readMeta(name) {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`meta[name='env:${name}']`);
  return el ? el.getAttribute("content") : null;
}

export function classroomNetworkConfig() {
  const stunUrls = readMeta("classroom_stun_urls");
  const turn443Host = readMeta("classroom_turn_443_host");
  return {
    stunUrls: stunUrls !== null ? stunUrls : DEFAULTS.stunUrls,
    turn443Host: turn443Host !== null ? turn443Host : DEFAULTS.turn443Host
  };
}

export function buildIceServers(host, turn, { forceTcp = false, stunUrls = "", turn443Host = "" } = {}) {
  const iceServers = [];

  if (turn && turn.enabled) {
    const relays = turn.transports.map(ts => ({
      host: ts.port === 443 && turn443Host ? turn443Host : host,
      port: ts.port
    }));
    if (turn443Host && !relays.some(r => r.port === 443)) {
      relays.push({ host: turn443Host, port: 443 });
    }

    relays.forEach(r => {
      // Try both TURN DTLS and TCP/TLS, as upstream does
      if (!forceTcp) {
        iceServers.push({ urls: `turns:${r.host}:${r.port}`, username: turn.username, credential: turn.credential });
      }
      iceServers.push({
        urls: `turns:${r.host}:${r.port}?transport=tcp`,
        username: turn.username,
        credential: turn.credential
      });
    });
  }

  stunUrls
    .split(",")
    .map(url => url.trim())
    .filter(Boolean)
    .forEach(url => iceServers.push({ urls: url }));

  return iceServers;
}
