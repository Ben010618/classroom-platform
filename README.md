# Classroom Platform

A self-hosted, browser-based **3D virtual classroom** for Philippine public schools. Students join from a budget Android phone or a school lab laptop with nothing to install. Teachers get one control panel: mute all, lock tools, Gather All, Lecture Mode and a hand-raise queue. Student data stays on infrastructure the school controls (RA 10173).

Built on [Hubs Community Edition](https://github.com/Hubs-Foundation/hubs) (MPL-2.0).

| | |
| :--- | :--- |
| **Plan** | [BLUEPRINT.md](BLUEPRINT.md): repo choice, architecture, ops, privacy, roadmap with go/no-go gates |
| **Device check (live)** | https://ben010618.github.io/classroom-platform/ |
| **Roadmap** | Issues + the "3D Classroom Roadmap" project board ([Phase 0 tracker](docs/phase-0-tracker.md) until then) |

## Repository layout

| Path | What | License |
| :--- | :--- | :--- |
| `hubs/` | Hubs client, imported as a git subtree of `Hubs-Foundation/hubs` | MPL-2.0 (`hubs/LICENSE`) |
| `hubs/src/classroom/` | **Our classroom add-on** (Teacher HUD, Gather All, Lecture Mode…) | see below |
| `UPSTREAM_PATCHES.md` | Every upstream Hubs file we modify | — |
| `tools/smoke-test/` | Device and network check page (EN/FIL), published to GitHub Pages | see below |
| `scripts/github-setup.sh` | One-time GitHub setup (Pages, labels, issues, project board) | — |
| `.devcontainer/` | Codespaces: Node 22, Docker, kubectl/Helm | — |
| `.github/workflows/classroom-build.yml` | Builds `ghcr.io/ben010618/classroom-hubs` on changes to `hubs/` | — |

> **License for our own code:** not chosen yet (all rights reserved until we choose). Files we modify inside `hubs/` stay MPL-2.0.

## Working with upstream Hubs

```bash
git remote add hubs-upstream https://github.com/Hubs-Foundation/hubs.git   # once
git subtree pull --prefix hubs hubs-upstream master --squash               # monthly rebase window
```

Keep changes to upstream files small and log each one in `UPSTREAM_PATCHES.md`. If that list passes about 25 files, raise the Gate 4 decision early.

## Quick start

```bash
# Device check page
cd tools/smoke-test && python -m http.server 8765        # http://localhost:8765

# Hubs client (in Codespaces, or locally with Node 22)
cd hubs && npm ci && npm run storybook                   # build UI in isolation on :6006
```

Publish device-check changes to Pages:

```bash
git push origin `git subtree split --prefix tools/smoke-test main`:gh-pages --force
```

## Not in this repo (on purpose)

- **Letters to the Schools Division Office.** They stay on the local PC (OneDrive), never in git.
- **Secrets** (TURN credentials, SMTP, server keys). These go in the server or GitHub Secrets only.
- **Learner data of any kind.**
