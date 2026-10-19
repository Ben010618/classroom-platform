#!/usr/bin/env bash
# One-time GitHub setup for the 3D classroom project. Safe to read top to bottom; each step is labelled.
# Prerequisite (once, opens a browser):  gh auth refresh -h github.com -s workflow,project
# Run from the classroom-platform folder:  bash scripts/github-setup.sh
set -euo pipefail

OWNER=Ben010618
REPO=$OWNER/classroom-platform
FORK=$OWNER/hubs
HUBS_DIR=/c/dev/classroom/hubs

echo "== 1. Public repo + push (docs/letters is git-ignored and is NOT pushed)"
git check-ignore -q docs/letters/01-sdo-ict-unit.md || { echo "letters are not ignored, aborting"; exit 1; }
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public \
    --description "Self-hosted 3D virtual classroom for Philippine public schools (Hubs CE based)" \
    --source . --remote origin --push
else
  git push -u origin main
fi

echo "== 2. GitHub Pages: device check page from the gh-pages branch"
git push origin "$(git subtree split -q --prefix tools/smoke-test main)":refs/heads/gh-pages --force
gh api -X POST "repos/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "   (Pages already enabled)"
echo "   -> https://${OWNER,,}.github.io/classroom-platform/  (first deploy takes ~1 min)"

echo "== 3. Fork CI: push the classroom-build workflow and switch off upstream workflows we don't use"
git -C "$HUBS_DIR" push origin classroom
for wf in browser-stack.yml custom-docker-build-push.yml hc-pkgcaller.yml hubs-RetPageOrigin.yml \
          roadmap-auto-commenter.yml test-and-deploy-storybook.yml; do
  gh workflow disable "$wf" -R "$FORK" 2>/dev/null && echo "   disabled $wf" || true
done

echo "== 4. Labels"
lbl() { gh label create "$1" -R "$REPO" -c "$2" -d "$3" --force >/dev/null; }
lbl phase-0 "BFD4F2" "Prep"
lbl phase-1 "C5DEF5" "Stand up & validate"
lbl phase-2 "D4C5F9" "Scene & performance"
lbl phase-3 "FEF2C0" "Teacher HUD & features"
lbl phase-4 "F9D0C4" "Hardening & pilot"
lbl gate    "B60205" "Go/no-go checkpoint"
lbl ops     "0E8A16" "Ops lead"
lbl dev     "1D76DB" "Head programmer"
lbl privacy "5319E7" "Privacy owner / DPO"
lbl needs-you "FBCA04" "Needs an account, purchase or signature"

echo "== 5. Issues (one per roadmap task)"
issue() { gh issue create -R "$REPO" -t "$1" -l "$2" -b "$3" >/dev/null && echo "   + $1"; }
issue "0.2 Send letters to SDO ICT unit and DPO"        "phase-0,privacy,needs-you" "Drafts are on the local PC in docs/letters (not in git). Fill placeholders, principal notes, send."
issue "0.5 Get reference devices (budget Android + DepEd lab laptop)" "phase-0,ops,needs-you" "Android: 3–4 GB RAM, Helio G-class, Chrome. Laptop: Celeron-class 4 GB. See BLUEPRINT §4."
issue "0.6 Register domain"                            "phase-0,ops,needs-you" "Ask the Division about a *.edu.ph subdomain first; otherwise a project domain."
issue "0.7 Open hosting account (Hetzner SG or Manila VPS)" "phase-0,ops,needs-you" "8 vCPU / 32 GB for the K3s node + a small coturn VM. Check APAC traffic allowance."
issue "0.8 Measure RTT from Globe/Smart/DITO/school ISP" "phase-0,ops" "Set pingUrl in tools/smoke-test/config.js to a test VM in each region; record medians here."
issue "0.9 Install Docker Desktop + kubectl on dev PC"  "phase-0,dev" "Needed for Phase 1."
issue "1.1 Deploy Hubs CE on single-node K3s + coturn 443/TLS" "phase-1,ops" "Official hello-world VM path in hubs-cloud/community-edition. Swap the Hubs image to ghcr.io/ben010618/hubs:classroom-latest."
issue "1.2 Point device check at our server (iceServers + pingUrl)" "phase-1,dev" "Update config.js; re-publish gh-pages."
issue "1.3 Measure mobile data per student (Lecture vs open discussion)" "phase-1,dev" "Does Hubs stream far-away voices? Result decides the Phase 5 LiveKit question. BLUEPRINT §5.2."
issue "GATE 1: Stable CE + both devices connect from mobile data and school network" "phase-1,gate" "No feature work until this passes."
issue "2.1 Classroom scene: podium, seat waypoints, 4 pods with audio zones, podium mic" "phase-2,dev" "Blender add-on. Bake lighting. Draco + KTX2."
issue "2.2 CI asset budget check (gltf-transform)"      "phase-2,dev" "Fail if > 15 MB, > 150k tris, textures > 2048, > 120 meshes. Prompt B′ in BLUEPRINT."
issue "GATE 2: ≥45 FPS (phone ≥30 Lite) with 10 avatars, scene < 8 MB" "phase-2,gate" ""
issue "3.1 Teacher HUD panel (mute all, locks, kick)"  "phase-3,dev" "Build in Storybook first (Codespaces). Reuse existing permissions/mute APIs."
issue "3.2 Gather All + Seat Lock (classroom message protocol)" "phase-3,dev" "See src/classroom/README.md in the fork."
issue "3.3 Lecture Mode button (mute learners + gather + podium)" "phase-3,dev" "Also the mobile-data saver."
issue "3.4 Hand-raise queue on HUD (time-ordered)"     "phase-3,dev" "Presence hand_raised already exists."
issue "3.5 Pre-join card: Lite mode, mic check, privacy/screenshot rule" "phase-3,dev" "Copy the FrameVR lobby flow (BLUEPRINT §1A)."
issue "3.6 Filipino locale (fil.json)"                 "phase-3,dev" "No fil locale upstream."
issue "3.7 PPT → PDF converter sidecar"                "phase-3,ops" "LibreOffice headless."
issue "GATE 3: New teacher runs a 5-min lesson from the HUD alone" "phase-3,gate" ""
issue "4.1 Backups + restore drill, monitoring, alerts" "phase-4,ops" ""
issue "4.2 Load test 30 clients per room"              "phase-4,ops" ""
issue "4.3 PIA + Child PIA, consent forms, privacy notices, breach runbook" "phase-4,privacy,needs-you" "With the Division DPO. BLUEPRINT §6."
issue "4.4 Pilot lesson + FrameVR head-to-head"        "phase-4,dev,ops" "Fill in the §1A table."
issue "GATE 4: Stay on Hubs or start the custom LiveKit build" "phase-4,gate" "Criteria in BLUEPRINT §7."

echo "== 6. Project board (needs the 'project' scope)"
NUM=$(gh project create --owner "$OWNER" --title "3D Classroom Roadmap" --format json --jq .number)
gh project link "$NUM" --owner "$OWNER" --repo "$REPO"
gh issue list -R "$REPO" --limit 100 --json url --jq '.[].url' | while read -r url; do
  gh project item-add "$NUM" --owner "$OWNER" --url "$url" >/dev/null
done
echo "   -> https://github.com/users/$OWNER/projects/$NUM"
echo "Done."
