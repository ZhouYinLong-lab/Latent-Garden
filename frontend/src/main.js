import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
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

function makeNodeObject(node) {
  const color = new THREE.Color(colorFor(node, state.colorBy, state.garden));
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(4.3, 20, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .96 }),
  );
  core.userData.role = "core";
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(8.2, 16, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .11, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.userData.role = "halo";
  group.add(halo, core);
  state.objects.set(node.id, group);
  return group;
}

function refreshEmphasis() {
  const focus = currentFocusSet();
  for (const [id, object] of state.objects) {
    const active = !focus || focus.has(id);
    const selected = id === state.selectedId || id === state.hoveredId;
    object.scale.setScalar(selected ? 1.45 : 1);
    object.traverse(child => {
      if (!child.material) return;
      child.material.opacity = child.userData.role === "halo"
        ? selected ? .3 : active ? .11 : .025
        : active ? .96 : .16;
    });
  }
  if (state.graph) {
    state.graph
      .linkColor(link => {
        const active = focus && focus.has(idOf(link.source)) && focus.has(idOf(link.target));
        return active ? "rgba(158,230,184,.72)" : "rgba(145,163,155,.16)";
      })
      .linkWidth(link => focus && focus.has(idOf(link.source)) && focus.has(idOf(link.target)) ? 1.15 : .28)
      .refresh();
  }
}

function initGraph() {
  state.webgl = supportsWebGL();
  if (!state.webgl) {
    graphElement.hidden = true;
    $("#fallback").hidden = false;
    return;
  }
  try {
    state.graph = ForceGraph3D()(graphElement)
      .backgroundColor("rgba(0,0,0,0)")
      .showNavInfo(false)
      .enableNodeDrag(false)
      .warmupTicks(0)
      .cooldownTicks(0)
      .nodeThreeObject(makeNodeObject)
      .nodeLabel(node => `<div class="scene-tooltip"><strong>${escapeHtml(node.title)}</strong><span>${escapeHtml((node.categories || ["未分类"])[0])} · 点击查看文章</span></div>`)
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
    new ResizeObserver(() => state.graph.width(graphElement.clientWidth).height(graphElement.clientHeight)).observe(graphElement);
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
  const position = state.mode === "3d" ? { x: 430, y: 310, z: 510 } : { x: 0, y: 0, z: 650 };
  state.graph.cameraPosition(position, { x: 0, y: 0, z: 0 }, animate ? 700 : 0);
}

function updateGraph() {
  state.filteredNodes = filterNodes(state.garden.nodes, state);
  state.objects.clear();
  const data = graphDataFor(state.garden, state.filteredNodes, state.mode);
  if (state.graph) {
    state.graph.graphData(data);
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
  document.querySelectorAll("[data-mode]").forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#space-note").textContent = !state.canRender3D
    ? "旧版数据仅提供二维坐标"
    : mode === "3d"
      ? "真实 3D UMAP · 拖动旋转 · 滚轮缩放"
      : "二维 UMAP 俯视 · 拖动平移 · 滚轮缩放";
  updateGraph();
  resetCamera(true);
}

function selectNode(id, moveCamera = false) {
  const node = state.nodeById.get(String(id));
  if (!node) return;
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
    return `<a class="${view.id === active ? "is-active" : ""}" href="${escapeHtml(url.href)}" aria-current="${view.id === active ? "page" : "false"}">${escapeHtml(view.label || view.id)}</a>`;
  }).join("");
  nav.hidden = false;
}

function applyPresentation() {
  const presentation = state.garden.metadata?.presentation || {};
  if (presentation.page_title) document.title = presentation.page_title;
  if (presentation.eyebrow) $("#brand-eyebrow").textContent = presentation.eyebrow;
  if (presentation.title) $("#brand-title").textContent = presentation.title;
  if (presentation.intro) $("#brand-intro").textContent = presentation.intro;
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
