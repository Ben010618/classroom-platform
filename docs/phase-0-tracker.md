# Phase 0 Tracker

This file is replaced by GitHub Issues once they're created. Plan: [BLUEPRINT.md](../BLUEPRINT.md)

| # | Task | Owner | Status |
| :- | :--- | :--- | :--- |
| 0.1 | Device/network check page (`tools/smoke-test/`) | Head programmer | ✅ Built and tested locally (Chrome, EN + FIL) |
| 0.2 | Letters to SDO ICT unit + DPO | Privacy owner | ✅ Drafted (local PC only, not in git). **Needs names, signatures and sending.** |
| 0.3 | Our own repo with the Hubs client (`hubs/` subtree) + `hubs/src/classroom/` | Head programmer | ✅ Monorepo created. Code audit confirmed megaphone, hand raise, PDF sync and permissions are built in. |
| 0.4 | CI that builds the custom Hubs client image | Head programmer | 🟡 `.github/workflows/classroom-build.yml` written (uses GITHUB_TOKEN, no PAT). Needs the `workflow` scope to push. |
| 0.5 | Reference devices: budget Android phone (3–4 GB) + DepEd lab laptop | Ops lead | ⬜ |
| 0.6 | Domain name (e.g. `*.edu.ph` via the Division, or a project domain) | Ops lead | ⬜ |
| 0.7 | Hosting account (Hetzner Cloud Singapore, or a Manila VPS) | Ops lead | ⬜ |
| 0.8 | Measure RTT to candidate regions from Globe / Smart / DITO / school ISP | Ops lead | ⬜ Set `pingUrl` in `tools/smoke-test/config.js` to a test VM in each region |
| 0.9 | Install Docker Desktop + kubectl on the dev machine (needed for Phase 1) | Head programmer | ⬜ |
