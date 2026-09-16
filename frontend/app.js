const params = new URLSearchParams(location.search);
const requestedView = params.get("view") === "engineering" ? "engineering" : "full";
const dataUrl = params.get("data") || (requestedView === "engineering" ? "./engineering-garden.json" : "./garden.json");
const requestedCluster = params.get("cluster");
const requestedTheme = params.get("theme");
if (params.get("embed") === "1") document.documentElement.dataset.embed = "true";
const state = { garden: null, query: "", cluster: null, focusedId: null, trail: [] };
const nodeLayer = document.querySelector("#nodes");
const labelLayer = document.querySelector("#labels");
const gridLayer = document.querySelector("#grid");
const regionLayer = document.querySelector("#regions");
const edgeLayer = document.querySelector("#edges");
const detail = document.querySelector("#detail");
const hoverCard = document.querySelector("#hover-card");
const mapStage = document.querySelector(".map-stage");
const status = document.querySelector("#status");
const defaultView = { x: -1.08, y: -1.08, width: 2.16, height: 2.16 };
const view = { ...defaultView };
let drag = null;
const trailStorageKey = "latent-garden:trail:" + requestedView;

try {
  const savedTrail = JSON.parse(sessionStorage.getItem(trailStorageKey) || "[]");
  if (Array.isArray(savedTrail)) state.trail = savedTrail.map(String).slice(-6);
} catch (_) {
  state.trail = [];
}

function esc(value) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => replacements[char]);
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#a4b96f";
}

function safeCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-.9, Math.min(.9, number)) : 0;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch (_) {
    return null;
  }
}

function formatHoverDate(value) {
  if (!value) return "未标注日期";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.getFullYear() + "年" + String(date.getMonth() + 1).padStart(2, "0") + "月" +
    String(date.getDate()).padStart(2, "0") + "日";
}

function coverUrlFor(node) {
  const explicit = safeExternalUrl(node.cover);
  if (explicit) return explicit;
  const source = safeExternalUrl(node.url);
  if (!source) return null;
  const url = new URL(source);
  if (!/(^|\.)zylatent\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = parts.at(-1);
  if (!slug || parts.length < 2) return null;
  return new URL("/og/" + decodeURIComponent(slug) + ".png", url.origin).href;
}

function hideHoverCard() {
  if (!hoverCard) return;
  hoverCard.classList.remove("is-visible");
  hoverCard.hidden = true;
}

function positionHoverCard(target) {
  if (!hoverCard || !mapStage || hoverCard.hidden) return;
  const stageRect = mapStage.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const cardRect = hoverCard.getBoundingClientRect();
  const targetX = targetRect.left - stageRect.left + targetRect.width / 2;
  const gap = 18;
  const preferRight = targetX < stageRect.width * .58;
  const preferredLeft = preferRight
    ? targetRect.right - stageRect.left + gap
    : targetRect.left - stageRect.left - cardRect.width - gap;
  const left = Math.max(12, Math.min(stageRect.width - cardRect.width - 12, preferredLeft));
  const preferredTop = targetRect.top - stageRect.top - 16;
  const top = Math.max(12, Math.min(stageRect.height - cardRect.height - 12, preferredTop));
  hoverCard.style.left = left + "px";
  hoverCard.style.top = top + "px";
}

function showHoverCard(id, target) {
  if (!hoverCard) return;
  const node = state.garden && state.garden.nodes.find(item => String(item.id) === String(id));
  if (!node) return;
  const cluster = state.garden.clusters.find(item => item.id === node.cluster_id);
  document.querySelector("#hover-date").textContent = formatHoverDate(node.date);
  document.querySelector("#hover-kind").textContent = node.content_type === "article" ? "文章 · 语义节点" : String(node.content_type || "内容节点");
  document.querySelector("#hover-title").textContent = node.title;
  document.querySelector("#hover-description").textContent = node.description || "从语义地图继续探索这篇内容。";
  document.querySelector("#hover-tags").innerHTML = (node.tags || []).slice(0, 5).map(tag =>
    '<span>' + esc(tag) + "</span>"
  ).join("");
  hoverCard.style.setProperty("--hover-accent", safeColor(cluster && cluster.color));
  const cover = document.querySelector("#hover-cover");
  const image = document.querySelector("#hover-cover-image");
  const coverUrl = coverUrlFor(node);
  image.style.backgroundImage = "none";
  image.classList.remove("is-loaded");
  cover.classList.remove("has-image");
  if (coverUrl) {
    image.style.backgroundImage = 'url("' + coverUrl.replace(/"/g, "%22") + '")';
    image.classList.add("is-loaded");
    cover.classList.add("has-image");
  }
  hoverCard.hidden = false;
  hoverCard.classList.add("is-visible");
  requestAnimationFrame(() => positionHoverCard(target));
}

function safeTheme(value) {
  const theme = String(value || "");
  return /^(default|zylatent|obsidian)$/i.test(theme) ? theme.toLowerCase() : "default";
}

function compactLabel(value, maxCharacters) {
  const characters = Array.from(String(value || ""));
  if (characters.length <= maxCharacters) return characters.join("");
  return characters.slice(0, Math.max(1, maxCharacters - 1)).join("") + "…";
}

function labelLayout(title, x) {
  const mapEdge = .88;
  const gap = .045;
  const rightSpace = mapEdge - x - gap;
  const leftSpace = x - gap + mapEdge;
  const placeRight = rightSpace >= leftSpace;
  const available = Math.max(.2, placeRight ? rightSpace : leftSpace);
  const maxCharacters = Math.max(5, Math.min(28, Math.floor(available / .04)));
  return {
    anchor: placeRight ? "start" : "end",
    offset: placeRight ? gap : -gap,
    text: compactLabel(title, maxCharacters),
  };
}

function renderGrid() {
  gridLayer.innerHTML = [
    '<rect class="field-dots" x="-.99" y="-.99" width="1.98" height="1.98"></rect>',
    '<path class="contour contour-a" d="M-.98 .58 C-.67 .37 -.57 .09 -.24 -.02 C.08 -.13 .16 -.49 .48 -.6 C.7 -.68 .84 -.57 .98 -.48"></path>',
    '<path class="contour contour-b" d="M-.98 -.46 C-.75 -.3 -.66 .01 -.4 .15 C-.13 .29 .08 .13 .3 .29 C.56 .48 .69 .68 .98 .72"></path>',
    '<path class="contour contour-c" d="M-.78 -.98 C-.67 -.7 -.39 -.64 -.3 -.39 C-.19 -.08 -.34 .15 -.08 .4 C.16 .63 .45 .55 .61 .8 C.67 .89 .71 .95 .75 .98"></path>',
  ].join("");
}

function pointFor(node) {
  return { x: safeCoordinate(node.x), y: -safeCoordinate(node.y) };
}

function semanticNeighbors(node, limit = 5) {
  if (!state.garden || !node) return [];
  const point = pointFor(node);
  return state.garden.nodes
    .filter(candidate => String(candidate.id) !== String(node.id))
    .map(candidate => {
      const candidatePoint = pointFor(candidate);
      return { node: candidate, distance: Math.hypot(candidatePoint.x - point.x, candidatePoint.y - point.y) };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);
}

function focusSet() {
  if (!state.focusedId || !state.garden) return null;
  const node = state.garden.nodes.find(item => String(item.id) === String(state.focusedId));
  if (!node) return null;
  return new Set([String(node.id), ...semanticNeighbors(node, 5).map(item => String(item.node.id))]);
}

function sharedTags(left, right) {
  const rightTags = new Set((right.tags || []).map(tag => String(tag).toLowerCase()));
  return (left.tags || []).filter(tag => rightTags.has(String(tag).toLowerCase()));
}

function relationshipReason(source, target) {
  const tags = sharedTags(source, target);
  if (tags.length) return "共同标签 · " + tags.slice(0, 2).join("、");
  if (source.cluster_id === target.cluster_id) {
    const cluster = state.garden.clusters.find(item => item.id === source.cluster_id);
    return "同一主题 · " + (cluster ? cluster.label : "相近内容");
  }
  return "语义邻近 · 适合继续探索";
}

function rememberTrail(id) {
  state.trail = state.trail.filter(item => item !== String(id));
  state.trail.push(String(id));
  state.trail = state.trail.slice(-6);
  try { sessionStorage.setItem(trailStorageKey, JSON.stringify(state.trail)); } catch (_) { /* private mode */ }
}

function renderTrail() {
  const trail = document.querySelector("#detail-trail");
  const count = document.querySelector("#trail-count");
  if (!trail || !count || !state.garden) return;
  const items = state.trail
    .map(id => state.garden.nodes.find(node => String(node.id) === id))
    .filter(Boolean);
  count.hidden = items.length < 2;
  count.textContent = items.length < 2 ? "" : "探索过 " + items.length + " 篇";
  trail.innerHTML = items.length ? items.map(node =>
    '<button type="button" data-trail-node="' + esc(node.id) + '">' + esc(compactLabel(node.title, 18)) + "</button>"
  ).join('<span aria-hidden="true">›</span>') : '<span class="trail-empty">从一篇文章开始</span>';
  trail.querySelectorAll("[data-trail-node]").forEach(button => button.addEventListener("click", () => showDetail(button.dataset.trailNode)));
}

function convexHull(points) {
  if (points.length < 3) return points;
  const sorted = points.slice().sort((left, right) => left.x - right.x || left.y - right.y);
  const cross = (origin, left, right) =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower = [];
  sorted.forEach(point => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper = [];
  sorted.slice().reverse().forEach(point => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function regionPath(nodes) {
  const points = nodes.map(pointFor);
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length || 1;
  center.y /= points.length || 1;
  const hull = convexHull(points).map(point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.max(.01, Math.hypot(dx, dy));
    const padding = Math.min(.1, .055 + distance * .045);
    return {
      x: Math.max(-.965, Math.min(.965, point.x + (dx / distance) * padding)),
      y: Math.max(-.965, Math.min(.965, point.y + (dy / distance) * padding)),
    };
  });
  if (hull.length < 3) return "";
  const midpoint = (left, right) => ({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 });
  const start = midpoint(hull[hull.length - 1], hull[0]);
  const segments = hull.map((point, index) => {
    const end = midpoint(point, hull[(index + 1) % hull.length]);
    return "Q" + point.x.toFixed(3) + " " + point.y.toFixed(3) + " " + end.x.toFixed(3) + " " + end.y.toFixed(3);
  });
  return "M" + start.x.toFixed(3) + " " + start.y.toFixed(3) + " " + segments.join(" ") + " Z";
}

function renderRegions() {
  const clusters = state.garden.clusters;
  const nodes = state.garden.nodes;
  regionLayer.innerHTML = clusters.map(cluster => {
    const path = regionPath(nodes.filter(node => node.cluster_id === cluster.id));
    const className = state.cluster === null ? "" : state.cluster === cluster.id ? " active" : " dim";
    return path ? '<path class="cluster-region' + className + '" d="' + path + '" style="--region-color:' +
      safeColor(cluster.color) + '"></path>' : "";
  }).join("");
}

function applyView() {
  const map = document.querySelector("#map");
  map.setAttribute(
    "viewBox",
    view.x + " " + view.y + " " + view.width + " " + view.height
  );
  map.classList.toggle("can-pan", view.width < defaultView.width - .001);
}

function constrainView() {
  const maxX = defaultView.x + defaultView.width - view.width;
  const maxY = defaultView.y + defaultView.height - view.height;
  view.x = Math.max(defaultView.x, Math.min(maxX, view.x));
  view.y = Math.max(defaultView.y, Math.min(maxY, view.y));
}

function zoomAt(clientX, clientY, scale) {
  const map = document.querySelector("#map");
  const rect = map.getBoundingClientRect();
  const focusX = view.x + ((clientX - rect.left) / rect.width) * view.width;
  const focusY = view.y + ((clientY - rect.top) / rect.height) * view.height;
  const nextWidth = Math.max(.42, Math.min(defaultView.width, view.width * scale));
  const nextHeight = Math.max(.42, Math.min(defaultView.height, view.height * scale));
  view.x = focusX - (focusX - view.x) * (nextWidth / view.width);
  view.y = focusY - (focusY - view.y) * (nextHeight / view.height);
  view.width = nextWidth;
  view.height = nextHeight;
  constrainView();
  applyView();
}

function render() {
  const nodes = state.garden.nodes;
  const clusters = state.garden.clusters;
  if (state.cluster === null && requestedCluster !== null && clusters.some(cluster => Number(cluster.id) === Number(requestedCluster))) {
    state.cluster = Number(requestedCluster);
  }
  document.querySelector("#item-count").textContent = nodes.length + " 篇文字";
  document.querySelector("#cluster-count").textContent = clusters.length + " 个主题";
  document.querySelector("#generated").textContent = "生成于 " + new Date(state.garden.generated_at).toLocaleDateString();
  const focusStatus = document.querySelector("#focus-status");
  if (focusStatus) focusStatus.textContent = state.focusedId ? "局部视图 · 6 篇文章" : "全局视图";
  renderTrail();
  renderPresentation();
  const activeView = state.garden.metadata && state.garden.metadata.view || requestedView;
  document.querySelectorAll("[data-view]").forEach(link => {
    const active = link.dataset.view === activeView;
    link.classList.toggle("active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelector("#legend").innerHTML = clusters.map((cluster, index) =>
    '<button type="button" aria-pressed="' + (state.cluster === cluster.id) + '" data-cluster="' + Number(cluster.id) + '" class="' +
    (state.cluster === cluster.id ? "active" : "") + '"><span class="cluster-index">' + String(index + 1).padStart(2, "0") +
    '</span><i style="--cluster-color:' + safeColor(cluster.color) + '"></i><span class="cluster-name">' +
    esc(cluster.label || "未命名") + '</span><span class="cluster-count">' + (cluster.node_ids || []).length + ' 篇</span></button>'
  ).join("");
  document.querySelectorAll("[data-cluster]").forEach(button => button.addEventListener("click", () => {
    state.cluster = state.cluster === Number(button.dataset.cluster) ? null : Number(button.dataset.cluster);
    render();
  }));
  renderGraph();
}

function renderPresentation() {
  const metadata = state.garden.metadata || {};
  const presentation = metadata.presentation || {};
  const theme = requestedTheme ? safeTheme(requestedTheme) : safeTheme(presentation.theme);
  document.documentElement.dataset.theme = theme;
  document.title = presentation.page_title || "Latent Garden";
  document.querySelector("#brand-eyebrow").textContent = presentation.eyebrow || "CONTENT COLLECTION · SEMANTIC MAP";
  document.querySelector("#brand-title").textContent = presentation.title || "Latent Garden";
  document.querySelector("#brand-intro").textContent = presentation.intro || "Project a collection into a searchable, interactive semantic map.";
  document.querySelector("#topic-heading").textContent = presentation.topic_heading || "Topics";
  document.querySelector("#topic-copy").textContent = presentation.topic_copy || "Colors identify groups in the loaded collection.";
  document.querySelector("#source-prefix").textContent = presentation.source_prefix || "Source";
  document.querySelector("#source-label").textContent = presentation.source_label || "content collection";
  const sourceLink = document.querySelector("#source-link");
  const sourceUrl = presentation.source_url ? safeExternalUrl(presentation.source_url) : null;
  if (sourceUrl) sourceLink.href = sourceUrl;
  else sourceLink.removeAttribute("href");
  const sourceIcon = document.querySelector("#source-icon");
  const iconPath = String(presentation.source_icon || "");
  const safeIcon = /^\.\/assets\/[a-z0-9._/-]+$/i.test(iconPath);
  sourceIcon.hidden = !safeIcon;
  if (safeIcon) sourceIcon.src = iconPath;

  const views = Array.isArray(metadata.available_views) ? metadata.available_views : [];
  const switcher = document.querySelector("#view-switch");
  switcher.hidden = views.length < 2;
  switcher.innerHTML = views.map(view => {
    const id = String(view.id || "");
    const href = id === "full" ? "./" : "./?view=" + encodeURIComponent(id);
    return '<a href="' + href + '" data-view="' + esc(id) + '">' + esc(view.label || id) + "</a>";
  }).join("");
}

function nodeVisibility(node) {
  const searchable = [node.title, node.description].concat(node.tags || []).join(" ").toLowerCase();
  const focused = focusSet();
  const isFocused = !focused || focused.has(String(node.id));
  return {
    matches: !state.query || searchable.includes(state.query),
    visibleCluster: state.cluster === null || node.cluster_id === state.cluster,
    isFocused,
    isSelected: state.focusedId !== null && String(node.id) === String(state.focusedId),
  };
}

function semanticEdges(nodes) {
  const points = nodes.map(node => ({
    id: String(node.id),
    x: safeCoordinate(node.x),
    y: -safeCoordinate(node.y),
    clusterId: node.cluster_id,
  }));
  const edges = new Map();
  points.forEach(point => {
    const neighbors = points
      .filter(candidate => candidate.id !== point.id)
      .map(candidate => ({
        ...candidate,
        distance: Math.hypot(candidate.x - point.x, candidate.y - point.y),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 2);
    neighbors.forEach((neighbor, index) => {
      if (index > 0 && neighbor.distance > .48) return;
      const key = [point.id, neighbor.id].sort().join("\u0000");
      if (!edges.has(key)) edges.set(key, { from: point, to: neighbor });
    });
  });
  return Array.from(edges.values());
}

function renderEdges() {
  const nodes = state.garden.nodes;
  const byId = new Map(nodes.map(node => [String(node.id), node]));
  const clusters = state.garden.clusters;
  edgeLayer.innerHTML = semanticEdges(nodes).map(edge => {
    const fromNode = byId.get(edge.from.id);
    const toNode = byId.get(edge.to.id);
    const fromState = nodeVisibility(fromNode);
    const toState = nodeVisibility(toNode);
    const active = fromState.matches && fromState.visibleCluster && fromState.isFocused &&
      toState.matches && toState.visibleCluster && toState.isFocused;
    const sameTopic = fromNode.cluster_id === toNode.cluster_id;
    const cluster = clusters.find(item => item.id === fromNode.cluster_id);
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const distance = Math.max(.001, Math.hypot(dx, dy));
    const direction = (edge.from.id.length + edge.to.id.length) % 2 ? 1 : -1;
    const bend = Math.min(.035, distance * .075) * direction;
    const controlX = (edge.from.x + edge.to.x) / 2 - (dy / distance) * bend;
    const controlY = (edge.from.y + edge.to.y) / 2 + (dx / distance) * bend;
    const path = "M" + edge.from.x + " " + edge.from.y + " Q" + controlX.toFixed(3) + " " +
      controlY.toFixed(3) + " " + edge.to.x + " " + edge.to.y;
    return '<path class="edge ' + (active ? "" : "dim") + (sameTopic ? " same-topic" : "") +
      '" data-a="' + esc(edge.from.id) + '" data-b="' + esc(edge.to.id) + '" d="' + path +
      '" style="--edge-color:' + safeColor(cluster && cluster.color) + '"></path>';
  }).join("");
}

function highlightEdges(id, highlighted) {
  edgeLayer.querySelectorAll(".edge").forEach(edge => {
    edge.classList.toggle("focus", highlighted && (edge.dataset.a === id || edge.dataset.b === id));
  });
}

function renderGraph() {
  renderRegions();
  renderEdges();
  renderNodes();
}

function renderNodes() {
  const nodes = state.garden.nodes;
  const clusters = state.garden.clusters;
  labelLayer.innerHTML = nodes.map(node => {
    const { matches, visibleCluster, isFocused, isSelected } = nodeVisibility(node);
    const x = safeCoordinate(node.x);
    const y = safeCoordinate(node.y);
    const layout = labelLayout(node.title, x);
    const label = '<text x="' + layout.offset + '" y=".012" text-anchor="' + layout.anchor + '">' +
      esc(layout.text) + "</text>";
    const showLabel = (Boolean(state.query) || isSelected) && matches && visibleCluster && isFocused;
    return '<g class="node-label' + (showLabel ? " show-label" : "") + '" transform="translate(' + x + " " +
      (-y) + ')" data-id="' + esc(node.id) + '">' + label + "</g>";
  }).join("");
  nodeLayer.innerHTML = nodes.map(node => {
    const cluster = clusters.find(item => item.id === node.cluster_id);
    const { matches, visibleCluster, isFocused, isSelected } = nodeVisibility(node);
    const visible = matches && visibleCluster && isFocused;
    const radius = visible ? ".025" : ".018";
    const x = safeCoordinate(node.x);
    const y = safeCoordinate(node.y);
    const angle = Array.from(String(node.id)).reduce((sum, char) => sum + char.codePointAt(0), 0) % 360;
    const color = safeColor(cluster && cluster.color);
    const content = '<g class="node ' + (visible ? "" : "dim") + (isSelected ? " selected" : "") +
      '" transform="translate(' + x + " " + (-y) + ')">' +
      '<circle class="node-hit" r=".062"></circle>' +
      '<circle class="node-halo" r="' + (Number(radius) * 1.82).toFixed(3) + '" fill="' + color + '"></circle>' +
      '<g class="node-glyph" transform="rotate(' + angle + ')">' +
      '<path class="node-stem" d="M .014 -.006 Q .024 -.01 .034 -.018" stroke="' + color + '"></path>' +
      '<ellipse class="node-leaf" cx=".027" cy="-.011" rx=".013" ry=".008" fill="' + color + '"></ellipse>' +
      '<circle class="node-seed" r="' + radius + '" fill="' + color + '"></circle>' +
      '<circle class="node-core" r=".005"></circle></g></g>';
    const url = safeExternalUrl(node.url);
    if (url) {
      return '<a class="node-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-id="' +
        esc(node.id) + '" aria-label="打开原文：' + esc(node.title) + '">' + content + "</a>";
    }
    return '<g class="node-fallback" data-id="' + esc(node.id) + '" tabindex="0" role="button" aria-label="查看：' +
      esc(node.title) + '">' + content + "</g>";
  }).join("");
  function toggleLabel(id, visible) {
    labelLayer.querySelectorAll(".node-label").forEach(label => {
      if (label.dataset.id === id) label.classList.toggle("hover-label", visible);
    });
  }
  nodeLayer.querySelectorAll(".node-link, .node-fallback").forEach(item => {
    item.addEventListener("pointerenter", () => {
      highlightEdges(item.dataset.id, true);
      toggleLabel(item.dataset.id, true);
      showHoverCard(item.dataset.id, item);
    });
    item.addEventListener("pointerleave", () => {
      highlightEdges(item.dataset.id, false);
      toggleLabel(item.dataset.id, false);
      hideHoverCard();
    });
    item.addEventListener("focus", () => {
      highlightEdges(item.dataset.id, true);
      toggleLabel(item.dataset.id, true);
      showHoverCard(item.dataset.id, item);
    });
    item.addEventListener("blur", () => {
      highlightEdges(item.dataset.id, false);
      toggleLabel(item.dataset.id, false);
      hideHoverCard();
    });
  });
  nodeLayer.querySelectorAll(".node-link, .node-fallback").forEach(item => {
    item.addEventListener("click", event => {
      event.preventDefault();
      hideHoverCard();
      showDetail(item.dataset.id);
    });
    item.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showDetail(item.dataset.id);
      }
    });
  });
}

function showDetail(id) {
  hideHoverCard();
  const node = state.garden.nodes.find(item => String(item.id) === String(id));
  if (!node) return;
  state.focusedId = String(node.id);
  rememberTrail(node.id);
  const focusStatus = document.querySelector("#focus-status");
  if (focusStatus) focusStatus.textContent = "局部视图 · 6 篇文章";
  document.querySelector("#detail-type").textContent = node.content_type;
  document.querySelector("#detail-title").textContent = node.title;
  document.querySelector("#detail-description").textContent = node.description;
  document.querySelector("#detail-tags").innerHTML = (node.tags || []).map(tag => "<span>" + esc(tag) + "</span>").join("");
  const link = document.querySelector("#detail-link");
  const url = safeExternalUrl(node.url);
  link.href = url || "#";
  link.style.display = url ? "inline-block" : "none";
  const related = document.querySelector("#detail-related");
  related.innerHTML = semanticNeighbors(node, 4).map(({ node: neighbor }) =>
    '<button type="button" data-related-node="' + esc(neighbor.id) + '">' +
    '<span class="related-title">' + esc(neighbor.title) + '</span>' +
    '<span class="related-reason">' + esc(relationshipReason(node, neighbor)) + "</span></button>"
  ).join("");
  related.querySelectorAll("[data-related-node]").forEach(button => button.addEventListener("click", () => showDetail(button.dataset.relatedNode)));
  renderTrail();
  detail.hidden = false;
  renderGraph();
}

document.querySelector("#search").addEventListener("input", event => {
  state.query = event.target.value.trim().toLowerCase();
  renderGraph();
});
document.querySelector("#reset").addEventListener("click", () => {
  hideHoverCard();
  state.query = "";
  state.cluster = null;
  state.focusedId = null;
  document.querySelector("#search").value = "";
  Object.assign(view, defaultView);
  applyView();
  detail.hidden = true;
  render();
});
document.querySelector("#detail-show-all").addEventListener("click", () => {
  state.focusedId = null;
  detail.hidden = true;
  render();
});
document.querySelector("#close-detail").addEventListener("click", () => { detail.hidden = true; });

document.querySelector("#map").addEventListener("wheel", event => {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1.12 : .89);
}, { passive: false });
document.querySelector("#map").addEventListener("pointerdown", event => {
  if (event.button !== 0 || view.width >= defaultView.width - .001 || event.target.closest(".node-link, .node-fallback")) return;
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  event.currentTarget.setPointerCapture(event.pointerId);
});
document.querySelector("#map").addEventListener("pointermove", event => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3) drag.moved = true;
  view.x -= ((event.clientX - drag.x) / rect.width) * view.width;
  view.y -= ((event.clientY - drag.y) / rect.height) * view.height;
  constrainView();
  drag.x = event.clientX;
  drag.y = event.clientY;
  applyView();
});
document.querySelector("#map").addEventListener("pointerup", () => {
  drag = null;
});
document.querySelector("#map").addEventListener("pointercancel", () => { drag = null; });

renderGrid();

fetch(dataUrl)
  .then(response => { if (!response.ok) throw new Error("Could not load " + dataUrl); return response.json(); })
  .then(garden => { state.garden = garden; status.remove(); render(); })
  .catch(error => { status.textContent = error.message; });
