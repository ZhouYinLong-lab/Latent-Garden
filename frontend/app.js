const params = new URLSearchParams(location.search);
const dataUrl = params.get("data") || "./garden.json";
const requestedCluster = params.get("cluster");
if (params.get("embed") === "1") document.documentElement.dataset.embed = "true";
const state = { garden: null, query: "", cluster: null };
const nodeLayer = document.querySelector("#nodes");
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
  return Number.isFinite(number) ? Math.max(-1, Math.min(1, number)) : 0;
}

function applyView() {
  document.querySelector("#map").setAttribute(
    "viewBox",
    view.x + " " + view.y + " " + view.width + " " + view.height
  );
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
  document.querySelector("#legend").innerHTML = clusters.map(cluster =>
    '<button type="button" data-cluster="' + Number(cluster.id) + '" class="' +
    (state.cluster === cluster.id ? "active" : "") + '"><i style="background:' +
    safeColor(cluster.color) + '"></i>' + esc(cluster.label) + "</button>"
  ).join("");
  document.querySelectorAll("[data-cluster]").forEach(button => button.addEventListener("click", () => {
    state.cluster = state.cluster === Number(button.dataset.cluster) ? null : Number(button.dataset.cluster);
    renderNodes();
    render();
  }));
  renderNodes();
}

function renderNodes() {
  const nodes = state.garden.nodes;
  const clusters = state.garden.clusters;
  nodeLayer.innerHTML = nodes.map(node => {
    const cluster = clusters.find(item => item.id === node.cluster_id);
    const searchable = [node.title, node.description].concat(node.tags || []).join(" ").toLowerCase();
    const matches = !state.query || searchable.includes(state.query);
    const visibleCluster = state.cluster === null || node.cluster_id === state.cluster;
    const radius = matches && visibleCluster ? ".028" : ".018";
    const x = safeCoordinate(node.x);
    const y = safeCoordinate(node.y);
    const label = x > 0.65
      ? '<text x="-0.045" y=".012" text-anchor="end">' + esc(node.title) + "</text>"
      : '<text x=".045" y=".012">' + esc(node.title) + "</text>";
    const showLabels = Boolean(state.query) || state.cluster !== null;
    return '<g class="node ' + (matches && visibleCluster ? "" : "dim") + (showLabels ? " show-label" : "") +
      '" transform="translate(' + x + " " + (-y) + ')" data-id="' + esc(node.id) + '">' +
      '<circle r="' + radius + '" fill="' + safeColor(cluster && cluster.color) + '"></circle>' +
      label + "</g>";
  }).join("");
  nodeLayer.querySelectorAll(".node").forEach(node => node.addEventListener("click", () => showDetail(node.dataset.id)));
}

function showDetail(id) {
  const node = state.garden.nodes.find(item => item.id === id);
  if (!node) return;
  document.querySelector("#detail-type").textContent = node.content_type;
  document.querySelector("#detail-title").textContent = node.title;
  document.querySelector("#detail-description").textContent = node.description;
  document.querySelector("#detail-tags").innerHTML = (node.tags || []).map(tag => "<span>" + esc(tag) + "</span>").join("");
  const link = document.querySelector("#detail-link");
  link.href = node.url || "#";
  link.style.display = node.url ? "inline-block" : "none";
  detail.hidden = false;
}

document.querySelector("#search").addEventListener("input", event => {
  state.query = event.target.value.trim().toLowerCase();
  renderNodes();
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
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  event.currentTarget.setPointerCapture(event.pointerId);
});
document.querySelector("#map").addEventListener("pointermove", event => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  const rect = event.currentTarget.getBoundingClientRect();
  view.x -= ((event.clientX - drag.x) / rect.width) * view.width;
  view.y -= ((event.clientY - drag.y) / rect.height) * view.height;
  drag.x = event.clientX;
  drag.y = event.clientY;
  applyView();
});
document.querySelector("#map").addEventListener("pointerup", () => { drag = null; });
document.querySelector("#map").addEventListener("pointercancel", () => { drag = null; });

fetch(dataUrl)
  .then(response => { if (!response.ok) throw new Error("Could not load " + dataUrl); return response.json(); })
  .then(garden => { state.garden = garden; status.remove(); render(); })
  .catch(error => { status.textContent = error.message; });
