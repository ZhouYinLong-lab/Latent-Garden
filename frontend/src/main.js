import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import "./styles.css";
import {
  categoryColor,
  colorFor,
  filterNodes,
  graphDataFor,
  hasTrue3D,
  neighborIds,
  normalizeGarden,
} from "./graph-data.js";

const params = new URLSearchParams(location.search);
const requestedView = params.get("view") === "engineering" ? "engineering" : "full";
const dataUrl = params.get("data") || (requestedView === "engineering" ? "./engineering-garden.json" : "./garden.json");
if (params.get("embed") === "1") document.documentElement.dataset.embed = "true";
if (params.get("theme")) document.documentElement.dataset.theme = params.get("theme");

const state = {
  garden: null,
  graph: null,
  mode: "3d",
  query: "",
  category: null,
  tags: new Set(),
  type: null,
  colorBy: "category",
  selectedId: null,
  hoveredId: null,
  filteredNodes: [],
  nodeById: new Map(),
  objects: new Map(),
  canRender3D: false,
  webgl: false,
  autoOrbitStopped: false,
};

const $ = selector => document.querySelector(selector);
const graphElement = $("#graph");
const statusElement = $("#status");
const markerTextures = new Map();
let cardLayoutFrame = 0;
let cardLayoutUntil = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value || ""), location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function idOf(value) {
  return String(value?.id ?? value ?? "");
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function categories() {
  return [...new Set(state.garden.nodes.flatMap(node => node.categories.length ? node.categories : ["未分类"]))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function filterCount() {
  return Number(Boolean(state.category)) + state.tags.size + Number(Boolean(state.type));
}

function currentFocusSet() {
  const id = state.selectedId || state.hoveredId;
  if (!id || !state.garden) return null;
  return new Set([id, ...neighborIds(state.garden.edges, id)]);
}

function markerTexture(color) {
  if (markerTextures.has(color)) return markerTextures.get(color);
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#17120c";
  context.fillRect(2, 2, 12, 12);
  context.fillStyle = color;
  context.fillRect(4, 0, 8, 16);
  context.fillRect(0, 4, 16, 8);
  context.fillStyle = "#d8c8a2";
  context.fillRect(6, 6, 4, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  markerTextures.set(color, texture);
  return texture;
}

function overlaps(left, right, gap = 7) {
  return left.left < right.right + gap
    && left.right > right.left - gap
    && left.top < right.bottom + gap
    && left.bottom > right.top - gap;
}

function layoutArticleCards() {
  cardLayoutFrame = 0;
  if (!state.graph || !state.objects.size) return;
  const graphRect = graphElement.getBoundingClientRect();
  const occupied = [".garden-brand", ".toolbar", ".legend", ".view-switch", ".filter-panel:not([hidden])", ".detail-panel:not([hidden])"]
    .map(selector => $(selector))
    .filter(Boolean)
    .filter(element => element.getClientRects().length)
    .map(element => element.getBoundingClientRect());
  const entries = [...state.objects.entries()].sort(([leftId], [rightId]) => {
    const leftPriority = Number(leftId === state.selectedId) * 2 + Number(leftId === state.hoveredId);
    const rightPriority = Number(rightId === state.selectedId) * 2 + Number(rightId === state.hoveredId);
    return rightPriority - leftPriority || leftId.localeCompare(rightId);
  }).filter(([id]) => state.filteredNodes.some(node => node.id === id));

  const filteredIds = new Set(state.filteredNodes.map(node => node.id));
  for (const [id, object] of state.objects) {
    const filteredOut = !filteredIds.has(id);
    object.userData.card?.classList.toggle("is-filtered-out", filteredOut);
    if (filteredOut) object.userData.card?.setAttribute("aria-hidden", "true");
  }
  for (const [, object] of entries) object.userData.card?.classList.remove("is-collapsed");
  for (const [id, object] of entries) {
    const card = object.userData.card;
    if (!card) continue;
    const pinned = id === state.selectedId || id === state.hoveredId;
    const distance = state.graph.camera().position.distanceTo(object.position);
    const depthScale = state.mode === "3d" ? Math.min(1.08, Math.max(.72, 590 / Math.max(distance, 1))) : 1;
    card.style.setProperty("--depth-scale", depthScale.toFixed(2));
    card.style.zIndex = pinned ? "2000" : String(Math.max(1, Math.round(1600 - distance)));
    const rect = card.getBoundingClientRect();
    const outside = rect.right < graphRect.left || rect.left > graphRect.right || rect.bottom < graphRect.top || rect.top > graphRect.bottom;
    const blocked = !pinned && (outside || occupied.some(item => overlaps(rect, item)));
    card.classList.toggle("is-collapsed", blocked);
    card.tabIndex = blocked ? -1 : 0;
    card.setAttribute("aria-hidden", String(blocked));
    if (!blocked) occupied.push(rect);
  }
  if (performance.now() < cardLayoutUntil) scheduleCardLayout();
}

function scheduleCardLayout() {
  if (cardLayoutFrame) cancelAnimationFrame(cardLayoutFrame);
  cardLayoutFrame = requestAnimationFrame(() => {
    cardLayoutFrame = requestAnimationFrame(layoutArticleCards);
  });
}

function keepCardLayoutFresh(duration = 850) {
  cardLayoutUntil = Math.max(cardLayoutUntil, performance.now() + duration);
  scheduleCardLayout();
}

function makeNodeObject(node) {
  const existing = state.objects.get(node.id);
  if (existing) return existing;
  const color = colorFor(node, state.colorBy, state.garden);
  const anchor = document.createElement("div");
  anchor.className = "article-node-anchor";
  const card = document.createElement("article");
  card.className = "article-node-card";
  card.style.setProperty("--node-color", color);
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `打开文章：${node.title}`);
  card.tabIndex = 0;
  const top = document.createElement("div");
  top.className = "article-node-top";
  const category = document.createElement("span");
  category.className = "article-node-category";
  category.textContent = node.categories[0] || "未分类";
  const date = document.createElement("span");
  date.className = "article-node-date";
  date.textContent = String(node.date || "").slice(0, 4) || "—";
  top.append(category, date);
  const title = document.createElement("strong");
  title.className = "article-node-title";
  title.textContent = node.title;
  const tags = document.createElement("span");
  tags.className = "article-node-tags";
  tags.textContent = node.tags.slice(0, 2).map(tag => `#${tag}`).join("  ") || "查看文章";
  card.append(top, title, tags);
  anchor.append(card);
  const activate = event => {
    event.stopPropagation();
    selectNode(node.id, true);
  };
  card.addEventListener("click", activate);
  card.addEventListener("pointerdown", event => event.stopPropagation());
  card.addEventListener("pointerenter", () => {
    state.hoveredId = node.id;
    refreshEmphasis();
  });
  card.addEventListener("pointerleave", () => {
    if (state.hoveredId === node.id) state.hoveredId = null;
    refreshEmphasis();
  });
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(event);
    }
  });

  const group = new THREE.Group();
  const label = new CSS2DObject(anchor);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: markerTexture(color),
    transparent: true,
    alphaTest: .05,
    depthWrite: false,
  }));
  marker.scale.set(11, 11, 1);
  group.add(label, marker);
  group.userData.card = card;
  group.userData.marker = marker;
  state.objects.set(node.id, group);
  return group;
}

function refreshEmphasis() {
  const focus = currentFocusSet();
  for (const [id, object] of state.objects) {
    const active = !focus || focus.has(id);
    const selected = id === state.selectedId || id === state.hoveredId;
    const card = object.userData.card;
    card?.classList.toggle("is-dimmed", !active);
    card?.classList.toggle("is-selected", id === state.selectedId);
    card?.classList.toggle("is-hovered", id === state.hoveredId);
    if (object.userData.marker) {
      object.userData.marker.material.opacity = active ? 1 : .22;
      const markerSize = selected ? 15 : 11;
      object.userData.marker.scale.set(markerSize, markerSize, 1);
    }
  }
  if (state.graph) {
    state.graph
      .linkColor(link => {
        const active = focus && focus.has(idOf(link.source)) && focus.has(idOf(link.target));
        return active ? "rgba(173,137,91,.78)" : "rgba(152,135,106,.23)";
      })
      .linkWidth(link => focus && focus.has(idOf(link.source)) && focus.has(idOf(link.target)) ? 1.2 : .4)
      .refresh();
  }
  scheduleCardLayout();
}

function initGraph() {
  state.webgl = supportsWebGL();
  if (!state.webgl) {
    graphElement.hidden = true;
    $("#fallback").hidden = false;
    return;
  }
  try {
    const cardRenderer = new CSS2DRenderer();
    cardRenderer.domElement.classList.add("node-card-layer");
    state.graph = ForceGraph3D({ extraRenderers: [cardRenderer] })(graphElement)
      .backgroundColor("rgba(0,0,0,0)")
      .showNavInfo(false)
      .enableNodeDrag(false)
      .warmupTicks(0)
      .cooldownTicks(0)
      .nodeThreeObject(makeNodeObject)
      .linkOpacity(1)
      .linkDirectionalParticles(0)
      .onNodeHover(node => {
        state.hoveredId = node ? node.id : null;
        graphElement.style.cursor = node ? "pointer" : "grab";
        refreshEmphasis();
      })
      .onNodeClick(node => selectNode(node.id, true))
      .onBackgroundClick(() => closeDetail());
    const controls = state.graph.controls();
    controls.enableDamping = true;
    controls.dampingFactor = .08;
    controls.enablePan = true;
    controls.minDistance = 150;
    controls.maxDistance = 1100;
    controls.addEventListener("change", scheduleCardLayout);
    new ResizeObserver(() => {
      state.graph.width(graphElement.clientWidth).height(graphElement.clientHeight);
      scheduleCardLayout();
    }).observe(graphElement);
    const observer = new IntersectionObserver(entries => {
      if (!state.graph) return;
      if (entries[0]?.isIntersecting && !document.hidden) state.graph.resumeAnimation();
      else state.graph.pauseAnimation();
    }, { threshold: .01 });
    observer.observe(graphElement);
    document.addEventListener("visibilitychange", () => document.hidden ? state.graph.pauseAnimation() : state.graph.resumeAnimation());
  } catch (error) {
    console.error(error);
    state.webgl = false;
    graphElement.hidden = true;
    $("#fallback").hidden = false;
  }
}

function stopAutoOrbit() {
  state.autoOrbitStopped = true;
  if (state.graph) state.graph.controls().autoRotate = false;
}

function startAutoOrbit() {
  if (!state.graph || state.mode !== "3d" || state.autoOrbitStopped || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const controls = state.graph.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = .36;
  window.setTimeout(stopAutoOrbit, 6500);
}

function resetCamera(animate = true) {
  if (!state.graph) return;
  const controls = state.graph.controls();
  controls.enableRotate = state.mode === "3d";
  const position = state.mode === "3d" ? { x: 520, y: 380, z: 700 } : { x: 0, y: 0, z: 760 };
  state.graph.cameraPosition(position, { x: 0, y: 0, z: 0 }, animate ? 700 : 0);
  keepCardLayoutFresh(animate ? 850 : 100);
}

function updateGraph() {
  state.filteredNodes = filterNodes(state.garden.nodes, state);
  if (!state.filteredNodes.some(node => node.id === state.hoveredId)) state.hoveredId = null;
  if (state.selectedId && !state.filteredNodes.some(node => node.id === state.selectedId)) {
    state.selectedId = null;
    $("#detail").hidden = true;
  }
  const data = graphDataFor(state.garden, state.garden.nodes, state.mode);
  const filteredIds = new Set(state.filteredNodes.map(node => node.id));
  if (state.graph) {
    const current = state.graph.graphData();
    if (!current.nodes.length) {
      state.graph.graphData(data);
    } else {
      const positions = new Map(data.nodes.map(node => [node.id, node]));
      for (const node of current.nodes) {
        const position = positions.get(node.id);
        if (!position) continue;
        Object.assign(node, { x: position.x, y: position.y, z: position.z, fx: position.fx, fy: position.fy, fz: position.fz });
        state.objects.get(node.id)?.position.set(position.x, position.y, position.z);
      }
    }
    state.graph
      .nodeVisibility(node => filteredIds.has(node.id))
      .linkVisibility(link => filteredIds.has(idOf(link.source)) && filteredIds.has(idOf(link.target)));
    for (const node of state.garden.nodes) {
      const object = state.objects.get(node.id);
      if (!object) continue;
      const color = colorFor(node, state.colorBy, state.garden);
      object.userData.card?.style.setProperty("--node-color", color);
      if (object.userData.marker) {
        object.userData.marker.material.map = markerTexture(color);
        object.userData.marker.material.needsUpdate = true;
      }
    }
    state.graph.refresh();
    resetCamera(false);
    refreshEmphasis();
  }
  renderCounts();
  renderArticleLists();
  renderFilterControls();
}

function setMode(mode) {
  if (mode === "3d" && !state.canRender3D) return;
  stopAutoOrbit();
  state.mode = mode;
  document.documentElement.dataset.layout = mode;
  document.querySelectorAll("[data-mode]").forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#space-note").textContent = !state.canRender3D
    ? "旧版数据仅提供二维坐标"
    : mode === "3d"
      ? "立体语义坐标 · 拖动查看 · 滚轮远近"
      : "平面语义坐标 · 拖动平移 · 滚轮远近";
  updateGraph();
  resetCamera(true);
}

function selectNode(id, moveCamera = false) {
  const node = state.nodeById.get(String(id));
  if (!node) return;
  state.hoveredId = null;
  if (matchMedia("(max-width: 760px)").matches) {
    $("#filter-panel").hidden = true;
    $("#filter-toggle").setAttribute("aria-expanded", "false");
  }
  stopAutoOrbit();
  state.selectedId = node.id;
  const detail = $("#detail");
  $("#detail-meta").textContent = `${node.categories[0] || "未分类"} · ${node.date || "未标注日期"}`;
  $("#detail-title").textContent = node.title;
  $("#detail-description").textContent = node.description || "这篇文章暂时没有摘要。";
  $("#detail-tags").innerHTML = node.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("");
  const articleUrl = safeUrl(node.url);
  $("#detail-link").hidden = !articleUrl;
  if (articleUrl) $("#detail-link").href = articleUrl;
  const coverUrl = safeUrl(node.cover);
  $("#detail-cover").hidden = !coverUrl;
  if (coverUrl) {
    $("#detail-cover-image").src = coverUrl;
    $("#detail-cover-image").alt = `${node.title} 封面`;
  }
  const neighbors = neighborIds(state.garden.edges, node.id)
    .map(neighborId => state.nodeById.get(neighborId))
    .filter(Boolean)
    .slice(0, 6);
  $("#neighbor-list").innerHTML = neighbors.length
    ? neighbors.map(item => `<button type="button" data-node-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>`).join("")
    : "<p class=\"eyebrow\">暂无近邻</p>";
  $("#neighbor-list").querySelectorAll("[data-node-id]").forEach(button => button.addEventListener("click", () => selectNode(button.dataset.nodeId, true)));
  detail.hidden = false;
  if (moveCamera && state.graph) {
    const plotted = state.graph.graphData().nodes.find(item => item.id === node.id);
    if (plotted) {
      const distance = state.mode === "3d" ? 125 : 170;
      const length = Math.hypot(plotted.x, plotted.y, plotted.z) || 1;
      const ratio = 1 + distance / length;
      state.graph.cameraPosition(
        state.mode === "3d" ? { x: plotted.x * ratio, y: plotted.y * ratio, z: plotted.z * ratio } : { x: plotted.x, y: plotted.y, z: 280 },
        { x: plotted.x, y: plotted.y, z: plotted.z },
        700,
      );
      keepCardLayoutFresh(850);
    }
  }
  refreshEmphasis();
}

function closeDetail() {
  state.selectedId = null;
  $("#detail").hidden = true;
  refreshEmphasis();
}

function renderCounts() {
  $("#result-count").textContent = `${state.filteredNodes.length}/${state.garden.nodes.length}`;
  $("#filter-summary").textContent = state.filteredNodes.length === state.garden.nodes.length
    ? "显示全部文章"
    : `显示 ${state.filteredNodes.length} 篇文章`;
  const count = filterCount();
  $("#filter-count").hidden = count === 0;
  $("#filter-count").textContent = String(count);
}

function filterButton(label, value, active, kind) {
  return `<button type="button" class="chip${active ? " is-active" : ""}" data-filter-kind="${kind}" data-filter-value="${escapeHtml(value)}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
}

function renderFilterControls() {
  const categoryValues = categories();
  const tags = [...new Set(state.garden.nodes.flatMap(node => node.tags))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const types = [...new Set(state.garden.nodes.map(node => node.content_type))].sort();
  $("#category-filters").innerHTML = categoryValues.map(value => filterButton(value, value, state.category === value, "category")).join("");
  $("#tag-filters").innerHTML = tags.map(value => filterButton(value, value, state.tags.has(value), "tag")).join("");
  $("#type-filters").innerHTML = types.map(value => filterButton(value, value, state.type === value, "type")).join("");
  document.querySelectorAll("[data-filter-kind]").forEach(button => button.addEventListener("click", () => {
    const { filterKind: kind, filterValue: value } = button.dataset;
    if (kind === "category") state.category = state.category === value ? null : value;
    if (kind === "type") state.type = state.type === value ? null : value;
    if (kind === "tag") state.tags.has(value) ? state.tags.delete(value) : state.tags.add(value);
    updateGraph();
  }));
}

function renderLegend() {
  const values = categories();
  $("#legend-items").innerHTML = values.map(value => {
    const count = state.garden.nodes.filter(node => (node.categories.length ? node.categories : ["未分类"]).includes(value)).length;
    const color = categoryColor(value, values);
    return `<span class="legend-item"><i class="legend-dot" style="color:${color};background:${color}"></i>${escapeHtml(value)} ${count}</span>`;
  }).join("");
}

function renderArticleLists() {
  const buttons = state.filteredNodes.map(node => `<button type="button" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.title)}</button>`).join("");
  $("#article-list").innerHTML = buttons || "<p class=\"eyebrow\">没有匹配文章</p>";
  $("#article-list").querySelectorAll("[data-node-id]").forEach(button => button.addEventListener("click", () => selectNode(button.dataset.nodeId, true)));
  $("#fallback-list").innerHTML = state.filteredNodes.map(node => {
    const url = safeUrl(node.url) || "#";
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(node.title)}<span>${escapeHtml(node.categories[0] || "未分类")}</span></a>`;
  }).join("");
}

function renderViewSwitch() {
  const views = state.garden.metadata?.available_views;
  if (!Array.isArray(views) || views.length < 2) return;
  const active = state.garden.metadata?.view || requestedView;
  const nav = $("#view-switch");
  nav.innerHTML = views.map(view => {
    const url = new URL(location.href);
    url.searchParams.delete("data");
    if (view.id === "engineering") url.searchParams.set("view", "engineering");
    else url.searchParams.delete("view");
    const label = /garden/i.test(view.label || "")
      ? (view.id === "engineering" ? "工程花园" : "完整花园")
      : (view.label || view.id);
    return `<a class="${view.id === active ? "is-active" : ""}" href="${escapeHtml(url.href)}" aria-current="${view.id === active ? "page" : "false"}">${escapeHtml(label)}</a>`;
  }).join("");
  nav.hidden = false;
}

function applyPresentation() {
  const presentation = state.garden.metadata?.presentation || {};
  const genericTitle = !presentation.title || /latent garden/i.test(presentation.title);
  document.title = genericTitle ? "语义花园" : (presentation.page_title || presentation.title);
  $("#brand-eyebrow").textContent = genericTitle ? "寒柳别苑 · 文脉图" : (presentation.eyebrow || "文脉图");
  $("#brand-title").textContent = genericTitle ? "语义花园" : presentation.title;
  $("#brand-intro").textContent = genericTitle ? "循文章之间的远近，寻另一条阅读路径。" : (presentation.intro || "循文章之间的远近，寻另一条阅读路径。");
}

function bindEvents() {
  $("#search").addEventListener("input", event => { state.query = event.target.value; updateGraph(); });
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $("#color-by").addEventListener("change", event => { state.colorBy = event.target.value; updateGraph(); });
  $("#filter-toggle").addEventListener("click", () => {
    const panel = $("#filter-panel");
    panel.hidden = !panel.hidden;
    $("#filter-toggle").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("#filter-close").addEventListener("click", () => { $("#filter-panel").hidden = true; $("#filter-toggle").setAttribute("aria-expanded", "false"); });
  $("#detail-close").addEventListener("click", closeDetail);
  $("#clear-filters").addEventListener("click", () => {
    state.category = null; state.tags.clear(); state.type = null; state.query = ""; $("#search").value = ""; updateGraph();
  });
  $("#reset-view").addEventListener("click", () => { stopAutoOrbit(); resetCamera(true); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeDetail();
      $("#filter-panel").hidden = true;
      $("#filter-toggle").setAttribute("aria-expanded", "false");
    }
  });
  ["pointerdown", "wheel", "keydown", "touchstart"].forEach(type => graphElement.addEventListener(type, stopAutoOrbit, { passive: true, once: true }));
}

async function loadGarden() {
  bindEvents();
  try {
    const response = await fetch(dataUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.garden = normalizeGarden(await response.json());
    state.nodeById = new Map(state.garden.nodes.map(node => [node.id, node]));
    state.canRender3D = hasTrue3D(state.garden.nodes);
    if (!state.canRender3D) {
      state.mode = "2d";
      const button = $("[data-mode=\"3d\"]");
      button.disabled = true;
      button.title = "此数据集没有真实三维坐标";
      $("#space-note").textContent = "旧版数据仅提供二维坐标";
    }
    applyPresentation();
    initGraph();
    renderLegend();
    renderViewSwitch();
    setMode(state.mode);
    statusElement.hidden = true;
    if (state.canRender3D) startAutoOrbit();
  } catch (error) {
    console.error(error);
    statusElement.textContent = `花园加载失败：${error.message}`;
  }
}

loadGarden();
