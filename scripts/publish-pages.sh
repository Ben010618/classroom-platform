#!/usr/bin/env bash
# Publishes the device check (/) and Katuro University world (/world/) to GitHub Pages (gh-pages branch).
# Stamps a build number into the world so browsers fetch fresh scripts and assets after every release.
#   bash scripts/publish-pages.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WT="$(mktemp -d)/pages"
BUILD="$(date -u +%Y%m%d%H%M)-$(git -C "$ROOT" rev-parse --short HEAD)"

git -C "$ROOT" fetch -q origin gh-pages
git -C "$ROOT" worktree add -q "$WT" origin/gh-pages -b "pages-$BUILD"
trap 'git -C "$ROOT" worktree remove --force "$WT"; git -C "$ROOT" branch -D -q "pages-$BUILD"' EXIT

rm -rf "$WT/world" && mkdir -p "$WT/world"
# the page and its scripts only: _*.html are git-ignored dev pages
cp "$ROOT"/tools/world/index.html "$ROOT"/tools/world/*.js "$WT/world/"
cp -r "$ROOT/tools/world/assets" "$WT/world/"
sed -i "s/BUILD_ID/$BUILD/g" "$WT/world/index.html"
cp "$ROOT"/tools/smoke-test/index.html "$ROOT"/tools/smoke-test/config.js "$WT/"

cd "$WT"
git add -A
git commit -q -m "Publish build $BUILD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || { echo "nothing changed"; exit 0; }
git push -q origin "HEAD:gh-pages"
echo "Published build $BUILD → https://ben010618.github.io/classroom-platform/world/"
