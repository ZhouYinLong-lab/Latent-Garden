import test from "node:test";
import assert from "node:assert/strict";
import { filterNodes, graphDataFor, hasTrue3D, normalizeGarden } from "./graph-data.js";

const garden = normalizeGarden({
  version: "0.2",
  nodes: [
    { id: "a", title: "A", categories: ["做东西"], tags: ["AI"], content_type: "article", x: -0.5, y: 0.2, x3: -0.4, y3: 0.3, z3: 0.8 },
    { id: "b", title: "B", categories: ["看人间"], tags: ["社评", "AI"], content_type: "note", x: 0.5, y: -0.2, x3: 0.4, y3: -0.3, z3: -0.8 },
  ],
  edges: [{ source: "a", target: "b", similarity: 0.9 }],
});

test("detects only complete real 3D coordinates", () => {
  assert.equal(hasTrue3D(garden.nodes), true);
  assert.equal(hasTrue3D([{ x: 0, y: 0 }]), false);
});

test("combines category, tags and query filters", () => {
  const nodes = filterNodes(garden.nodes, { query: "社评", category: "看人间", tags: new Set(["AI"]), type: null });
  assert.deepEqual(nodes.map(node => node.id), ["b"]);
});

test("maps fixed real coordinates for 3D and planar coordinates for 2D", () => {
  const three = graphDataFor(garden, garden.nodes, "3d", 100);
  assert.deepEqual([three.nodes[0].fx, three.nodes[0].fy, three.nodes[0].fz], [-40, 30, 80]);
  const two = graphDataFor(garden, garden.nodes, "2d", 100);
  assert.deepEqual([two.nodes[0].fx, two.nodes[0].fy, two.nodes[0].fz], [-50, -20, 0]);
});

test("legacy contracts receive deterministic projected edges", () => {
  const legacy = normalizeGarden({ nodes: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0.1, y: 0.1 }] });
  assert.equal(legacy.edges.length, 1);
});
