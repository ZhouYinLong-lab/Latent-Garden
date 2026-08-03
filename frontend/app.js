const params = new URLSearchParams(location.search);
const requestedView = params.get("view") === "engineering" ? "engineering" : "full";
const dataUrl = params.get("data") || (requestedView === "engineering" ? "./engineering-garden.json" : "./garden.json");
const requestedCluster = params.get("cluster");
if (params.get("embed") === "1") document.documentElement.dataset.embed = "true";
const state = { garden: null, query: "", cluster: null };
const nodeLayer = document.querySelector("#nodes");
const labelLayer = document.querySelector("#labels");
const gridLayer = document.querySelector("#grid");
const edgeLayer = document.querySelector("#edges");
const detail = document.querySelector("#detail");
const status = document.querySelector("#status");
const defaultView = { x: -1.08, y: -1.08, width: 2.16, height: 2.16 };
const view = { ...defaultView };
let drag = null;

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
  const rings = [.18, .36, .54, .72, .88];
  const spokes = Array.from({ length: 12 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 12;
    const x = Math.cos(angle) * .9;
    const y = Math.sin(angle) * .9;
    return '<path d="M 0 0 L ' + x.toFixed(3) + " " + y.toFixed(3) + '"></path>';
  }).join("");
  gridLayer.innerHTML = rings.map(radius => '<circle cx="0" cy="0" r="' + radius + '"></circle>').join("") +
    spokes + '<circle class="center" cx="0" cy="0" r=".045"></circle>';
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
  renderPresentation();
  const activeView = state.garden.metadata && state.garden.metadata.view || requestedView;
  document.querySelectorAll("[data-view]").forEach(link => {
    const active = link.dataset.view === activeView;
    link.classList.toggle("active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelector("#legend").innerHTML = clusters.map((cluster, index) =>
    '<button type="button" aria-pressed="' + (state.cluster === cluster.id) + '" data-cluster="' + Number(cluster.id) + '" class="' +
    (state.cluster === cluster.id ? "active" : "") + '"><i style="background:' +
    safeColor(cluster.color) + '"></i><span class="cluster-name">主题 ' + (index + 1) + ' · ' + esc(cluster.label || "未命名") +
    '</span><span class="cluster-count">' + (cluster.node_ids || []).length + ' 篇</span></button>'
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
  const theme = /^[a-z0-9-]+$/i.test(String(presentation.theme || "")) ? presentation.theme : "default";
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
  return {
    matches: !state.query || searchable.includes(state.query),
    visibleCluster: state.cluster === null || node.cluster_id === state.cluster,
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
    const active = fromState.matches && fromState.visibleCluster && toState.matches && toState.visibleCluster;
    const sameTopic = fromNode.cluster_id === toNode.cluster_id;
    const cluster = clusters.find(item => item.id === fromNode.cluster_id);
    return '<line class="edge ' + (active ? "" : "dim") + (sameTopic ? " same-topic" : "") +
      '" data-a="' + esc(edge.from.id) + '" data-b="' + esc(edge.to.id) + '" x1="' + edge.from.x +
      '" y1="' + edge.from.y + '" x2="' + edge.to.x + '" y2="' + edge.to.y +
      '" style="--edge-color:' + safeColor(cluster && cluster.color) + '"></line>';
  }).join("");
}

function highlightEdges(id, highlighted) {
  edgeLayer.querySelectorAll(".edge").forEach(edge => {
    edge.classList.toggle("focus", highlighted && (edge.dataset.a === id || edge.dataset.b === id));
  });
}

function renderGraph() {
  renderEdges();
  renderNodes();
}

function renderNodes() {
  const nodes = state.garden.nodes;
  const clusters = state.garden.clusters;
  labelLayer.innerHTML = nodes.map(node => {
    const { matches, visibleCluster } = nodeVisibility(node);
    const x = safeCoordinate(node.x);
    const y = safeCoordinate(node.y);
    const layout = labelLayout(node.title, x);
    const label = '<text x="' + layout.offset + '" y=".012" text-anchor="' + layout.anchor + '">' +
      esc(layout.text) + "</text>";
    const showLabel = Boolean(state.query) && matches && visibleCluster;
    return '<g class="node-label' + (showLabel ? " show-label" : "") + '" transform="translate(' + x + " " +
      (-y) + ')" data-id="' + esc(node.id) + '">' + label + "</g>";
  }).join("");
  nodeLayer.innerHTML = nodes.map(node => {
    const cluster = clusters.find(item => item.id === node.cluster_id);
    const { matches, visibleCluster } = nodeVisibility(node);
    const radius = matches && visibleCluster ? ".028" : ".018";
    const x = safeCoordinate(node.x);
    const y = safeCoordinate(node.y);
    const content = '<g class="node ' + (matches && visibleCluster ? "" : "dim") +
      '" transform="translate(' + x + " " + (-y) + ')">' +
      '<title>' + esc(node.title) + '</title>' +
      '<circle r="' + radius + '" fill="' + safeColor(cluster && cluster.color) + '"></circle></g>';
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
    });
    item.addEventListener("pointerleave", () => {
      highlightEdges(item.dataset.id, false);
      toggleLabel(item.dataset.id, false);
    });
    item.addEventListener("focus", () => {
      highlightEdges(item.dataset.id, true);
      toggleLabel(item.dataset.id, true);
    });
    item.addEventListener("blur", () => {
      highlightEdges(item.dataset.id, false);
      toggleLabel(item.dataset.id, false);
    });
  });
  nodeLayer.querySelectorAll(".node-fallback").forEach(item => {
    item.addEventListener("click", () => showDetail(item.dataset.id));
    item.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showDetail(item.dataset.id);
      }
    });
  });
}

function showDetail(id) {
  const node = state.garden.nodes.find(item => String(item.id) === String(id));
  if (!node) return;
  document.querySelector("#detail-type").textContent = node.content_type;
  document.querySelector("#detail-title").textContent = node.title;
  document.querySelector("#detail-description").textContent = node.description;
  document.querySelector("#detail-tags").innerHTML = (node.tags || []).map(tag => "<span>" + esc(tag) + "</span>").join("");
  const link = document.querySelector("#detail-link");
  const url = safeExternalUrl(node.url);
  link.href = url || "#";
  link.style.display = url ? "inline-block" : "none";
  detail.hidden = false;
}

document.querySelector("#search").addEventListener("input", event => {
  state.query = event.target.value.trim().toLowerCase();
  renderGraph();
});
document.querySelector("#reset").addEventListener("click", () => {
  state.query = "";
  state.cluster = null;
  document.querySelector("#search").value = "";
  Object.assign(view, defaultView);
  applyView();
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
