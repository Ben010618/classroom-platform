# 3D Virtual Classroom — Workspace

Plan: [BLUEPRINT.md](BLUEPRINT.md) · Device check (live): https://ben010618.github.io/classroom-platform/ · Hubs fork: https://github.com/Ben010618/hubs (branch `classroom`)

## Layout

| Path | What |
| :--- | :--- |
| `tools/smoke-test/` | Device and network check page (EN/FIL). Static and dependency-free; edit `config.js` only. |
| `docs/letters/` | Draft letters to the Schools Division Office. **Git-ignored: kept on the local PC only, never pushed.** |
| `C:\dev\classroom\hubs` | Our fork: https://github.com/Ben010618/hubs, branch `classroom`. Kept **outside OneDrive** on purpose. Classroom code goes in `src/classroom/`, and the patch log is `UPSTREAM_PATCHES.md`. |

## Phase 0 — Prep (Days 1–2)

| # | Task | Owner | Status |
| :- | :--- | :--- | :--- |
| 0.1 | Network smoke-test page (`tools/smoke-test/`) | Head programmer | ✅ Built and tested locally (Chrome, EN + FIL) |
| 0.2 | Draft letters to SDO ICT unit + DPO (`docs/letters/`) | Privacy owner | ✅ Drafted, **needs names, signatures and sending** |
| 0.3 | Fork `Hubs-Foundation/hubs` to our GitHub and set up `src/classroom/` | Head programmer | ✅ Forked, `classroom` branch pushed. Code audit confirmed megaphone, hand raise, PDF sync and permissions are built in. |
| 0.4 | CI that builds the custom Hubs client image | Head programmer | 🟡 Reuse the upstream `custom-docker-build-push` workflow. **To do (needs you):** enable Actions on the fork; add repo variables `REGISTRY_BASE_URL=ghcr.io` and `REGISTRY_NAMESPACE=ben010618`; add secrets `REGISTRY_USERNAME` and `REGISTRY_PASSWORD` (a PAT with `write:packages`). |
| 0.5 | Reference devices: budget Android phone (3–4 GB) + DepEd lab laptop | Ops lead | ⬜ |
| 0.6 | Domain name (e.g. `*.edu.ph` via the Division, or a project domain) | Ops lead | ⬜ |
| 0.7 | Hosting account (Hetzner Cloud Singapore, or a Manila VPS) | Ops lead | ⬜ |
| 0.8 | Measure RTT to candidate regions from Globe / Smart / DITO / school ISP | Ops lead | ⬜ Run the smoke test with `pingUrl` set to a test VM in each region |
| 0.9 | Install Docker Desktop + kubectl on the dev machine (needed for Phase 1) | Head programmer | ⬜ |

## Running the smoke test

```bash
cd tools/smoke-test
python -m http.server 8765     # then open http://localhost:8765
```

**Publishing changes to the live page:** the `gh-pages` branch is a copy of `tools/smoke-test/`. After committing to `main`, run:

```bash
git push origin `git subtree split --prefix tools/smoke-test main`:gh-pages --force
```

The microphone check needs a secure origin: use `localhost` locally, or HTTPS once it's deployed. In Phase 1 we host it on our own server at `/check`, and set `iceServers` and `pingUrl` in `config.js` to our coturn and server.
