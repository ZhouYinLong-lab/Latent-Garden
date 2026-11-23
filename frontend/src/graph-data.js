const PALETTE = ["#78937b", "#738898", "#ad895b", "#8b7793", "#a66f62", "#73958f", "#b29c62", "#7d88a2"];

export function hasTrue3D(nodes) {
  return nodes.length > 0 && nodes.every(node => [node.x3, node.y3, node.z3].every(value => Number.isFinite(Number(value))));
}

export function normalizeGarden(payload) {
  if (!payload || !Array.isArray(payload.nodes)) throw new Error("garden.json 缺少 nodes 数组");
  const nodes = payload.nodes.map(node => ({
    ...node,
    id: String(node.id),
    title: String(node.title || node.id || "未命名文章"),
    description: String(node.description || ""),
    categories: Array.isArray(node.categories) ? node.categories.map(String) : [],
    tags: Array.isArray(node.tags) ? node.tags.map(String) : [],
    content_type: String(node.content_type || "document"),
  }));
  return { ...payload, nodes, edges: normalizeEdges(payload.edges, nodes) };
}

export function normalizeEdges(edges, nodes) {
  const ids = new Set(nodes.map(node => node.id));
  if (Array.isArray(edges) && edges.length) {
    return edges
      .map(edge => ({ source: String(edge.source), target: String(edge.target), similarity: Number(edge.similarity) || 0 }))
      .filter(edge => edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target));
  }
  const pairs = new Map();
  for (const node of nodes) {
    const nearest = nodes
      .filter(candidate => candidate.id !== node.id)
      .map(candidate => ({
        node: candidate,
        distance: Math.hypot(Number(node.x || 0) - Number(candidate.x || 0), Number(node.y || 0) - Number(candidate.y || 0)),
      }))
      .sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id))
      .slice(0, 2);
    for (const item of nearest) {
      const key = [node.id, item.node.id].sort().join("\u0000");
      pairs.set(key, { source: node.id, target: item.node.id, similarity: Math.max(0, 1 - item.distance / 2.6) });
    }
  }
  return [...pairs.values()];
}

export function filterNodes(nodes, filters) {
  const query = String(filters.query || "").trim().toLocaleLowerCase();
  const selectedTags = filters.tags instanceof Set ? filters.tags : new Set(filters.tags || []);
  return nodes.filter(node => {
    const searchText = [node.title, node.description, ...node.categories, ...node.tags].join(" ").toLocaleLowerCase();
    return (!query || searchText.includes(query))
      && (!filters.category || node.categories.includes(filters.category))
      && (!filters.type || node.content_type === filters.type)
      && (!selectedTags.size || node.tags.some(tag => selectedTags.has(tag)));
  });
}

export function graphDataFor(garden, filteredNodes, mode = "3d", scale = 300) {
  const ids = new Set(filteredNodes.map(node => node.id));
  const nodes = filteredNodes.map(node => {
    const position = mode === "3d"
      ? [Number(node.x3), Number(node.y3), Number(node.z3)]
      : [Number(node.x), -Number(node.y), 0];
    const [x, y, z] = position.map(value => (Number.isFinite(value) ? value : 0) * scale);
    return { ...node, x, y, z, fx: x, fy: y, fz: z };
  });
  const links = garden.edges
    .filter(edge => ids.has(String(edge.source?.id ?? edge.source)) && ids.has(String(edge.target?.id ?? edge.target)))
    .map(edge => ({ ...edge, source: String(edge.source?.id ?? edge.source), target: String(edge.target?.id ?? edge.target) }));
  return { nodes, links };
}

export function categoryColor(category, categories) {
  const index = Math.max(0, categories.indexOf(category || "未分类"));
  return PALETTE[index % PALETTE.length];
}

export function colorFor(node, colorBy, garden) {
  const values = colorBy === "tag"
    ? garden.nodes.flatMap(item => item.tags)
    : colorBy === "type"
      ? garden.nodes.map(item => item.content_type)
      : colorBy === "year"
        ? garden.nodes.map(item => String(item.date || "").slice(0, 4)).filter(Boolean)
        : garden.nodes.flatMap(item => item.categories.length ? item.categories : ["未分类"]);
  const unique = [...new Set(values)].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const value = colorBy === "tag" ? node.tags[0] : colorBy === "type" ? node.content_type : colorBy === "year" ? String(node.date || "").slice(0, 4) : node.categories[0] || "未分类";
  return categoryColor(value, unique);
}

export function neighborIds(edges, id) {
  return edges.flatMap(edge => {
    const source = String(edge.source?.id ?? edge.source);
    const target = String(edge.target?.id ?? edge.target);
    if (source === id) return [target];
    if (target === id) return [source];
    return [];
  });
}
