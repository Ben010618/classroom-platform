# Upstream Patches

Every file from `Hubs-Foundation/hubs` that we modify. These files stay under MPL-2.0 and must be published with our fork. New files under `src/classroom/` are our own.

**Gate 4 rule:** if this list grows past about 25 files, raise the "stay on Hubs vs custom stack" decision early.

| # | Upstream file | Why we touched it | Hook added | Date | Rebase notes |
| :- | :--- | :--- | :--- | :--- | :--- |
| 5 | `hubs/src/naf-dialog-adapter.js` | Stop sending learner IPs to Google STUN (#34); optional coturn on 443 via a second host (#33) | 1 import; `getIceServers` body replaced by a call to `buildIceServers` in `classroom/ice-servers.js` (keeps `this._serverUrl`) | 2026-10-20 | 2 marked spots. If upstream changes `getIceServers`, port any new TURN logic into `buildIceServers`. Numbers 1–4 are in the open feature PRs. |
