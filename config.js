// Smoke-test configuration. Edit this file only; index.html reads it.
window.SMOKE_CONFIG = {
  // ICE servers for the WebRTC check.
  // TODO(Phase 1): replace with our own coturn once it is deployed, e.g.
  //   { urls: "stun:turn.example.edu.ph:3478" },
  //   { urls: "turn:turn.example.edu.ph:3478?transport=udp", username: "smoke", credential: "..." },
  //   { urls: "turns:turn.example.edu.ph:443?transport=tcp", username: "smoke", credential: "..." },
  // Until then a public STUN server is used so the direct-UDP check still works.
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],

  // URL on OUR server that answers quickly (any small file). Used for round-trip time.
  // TODO(Phase 1): e.g. "https://classroom.example.edu.ph/health". null = skip the check.
  pingUrl: null,

  // Pass/warn thresholds.
  fpsGood: 45,
  fpsMin: 30,
  rttGood: 80,
  rttMax: 150,
  benchmarkSeconds: 10,
  benchmarkTriangles: 80000,
};
