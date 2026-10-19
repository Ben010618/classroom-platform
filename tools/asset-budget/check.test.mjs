import { test } from "node:test";
import assert from "node:assert/strict";
import { Document } from "@gltf-transform/core";
import { measure, grade } from "./check.mjs";

const BUDGET = {
  fileSizeMB: { target: 8, cap: 15 },
  triangles: { target: 80000, cap: 150000 },
  drawCalls: { target: 80, cap: 120 },
  textureMaxSize: { target: 1024, cap: 2048 },
};

// A mesh with `tris` indexed triangles, used by `nodes` separate nodes.
function docWith({ tris, nodes = 1, primitives = 1 }) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh("m");
  for (let p = 0; p < primitives; p++) {
    const pos = doc.createAccessor().setType("VEC3").setArray(new Float32Array(9)).setBuffer(buffer);
    const idx = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(tris * 3)).setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setAttribute("POSITION", pos).setIndices(idx));
  }
  const scene = doc.createScene();
  for (let n = 0; n < nodes; n++) scene.addChild(doc.createNode().setMesh(mesh));
  return doc;
}

test("counts triangles once per node that uses the mesh", () => {
  const m = measure(docWith({ tris: 1000, nodes: 3 }));
  assert.equal(m.triangles, 3000);
  assert.equal(m.drawCalls, 3);
});

test("each primitive is a draw call", () => {
  const m = measure(docWith({ tris: 10, nodes: 2, primitives: 4 }));
  assert.equal(m.drawCalls, 8);
  assert.equal(m.triangles, 80);
});

test("grade: under target is OK, over target WARN, over cap FAIL", () => {
  const ok = grade({ fileSizeMB: 5, triangles: 50000, drawCalls: 50, textureMaxSize: 1024 }, BUDGET);
  assert.equal(ok.fail, false);
  assert.ok(ok.rows.every((r) => r.status === "OK"));

  const warn = grade({ fileSizeMB: 10, triangles: 50000, drawCalls: 50, textureMaxSize: 2048 }, BUDGET);
  assert.equal(warn.fail, false);
  assert.deepEqual(warn.rows.filter((r) => r.status === "WARN").map((r) => r.key), ["fileSizeMB", "textureMaxSize"]);

  const fail = grade({ fileSizeMB: 5, triangles: 200000, drawCalls: 50, textureMaxSize: 4096 }, BUDGET);
  assert.equal(fail.fail, true);
  assert.deepEqual(fail.rows.filter((r) => r.status === "FAIL").map((r) => r.key), ["triangles", "textureMaxSize"]);
});
