# Asset budget check

Enforces the 3D asset budget from [BLUEPRINT §4](../../BLUEPRINT.md) on `.glb`/`.gltf` files. Draco and meshopt files are supported.

| Metric | Target (warn) | Cap (fail) |
| :--- | ---: | ---: |
| File size | 8 MB | 15 MB |
| Triangles (counted once per node that uses a mesh) | 80,000 | 150,000 |
| Draw calls (one per primitive per node) | 80 | 120 |
| Largest texture side | 1024 px | 2048 px |

```bash
cd tools/asset-budget && npm ci
node check.mjs ../../assets            # file(s) or folder(s); exit 1 if any cap is exceeded
npx gltf-transform optimize in.glb out.glb --compress draco --texture-compress ktx2   # shrink a model
npm test
```

In CI, `.github/workflows/asset-budget.yml` runs it on every change under `assets/` and writes the table to the job summary.
Edit `budget.json` to change the limits.
