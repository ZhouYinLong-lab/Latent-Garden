const dataUrl = new URLSearchParams(location.search).get("data") || "./garden.json";
const state = { garden: null, query: "", cluster: null };
const nodeLayer = document.querySelector("#nodes");
const detail = document.querySelector("#detail");
const status = document.querySelector("#status");

function esc(value) {
  const replacements = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => replacements[char]);
}

function render() {
  const nodes = state.garden.nodes;
  const clusters = state.garden.clusters;
  document.querySelector("#item-count").textContent = nodes.length + " 篇文字";
  document.querySelector("#cluster-count").textContent = clusters.length + " 个主题";
  document.querySelector("#generated").textContent = "生成于 " + new Date(state.garden.generated_at).toLocaleDateString();
  document.querySelector("#legend").innerHTML = clusters.map(cluster =>
    '<button type="button" data-cluster="' + cluster.id + '" class="' +
    (state.cluster === cluster.id ? "active" : "") + '"><i style="background:' +
    cluster.color + '"></i>' + esc(cluster.label) + "</button>"
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
    const label = node.x > 0.65
      ? '<text x="-0.045" y=".012" text-anchor="end">' + esc(node.title) + "</text>"
      : '<text x=".045" y=".012">' + esc(node.title) + "</text>";
    return '<g class="node ' + (matches && visibleCluster ? "" : "dim") +
      '" transform="translate(' + node.x + " " + (-node.y) + ')" data-id="' + esc(node.id) + '">' +
      '<circle r="' + radius + '" fill="' + (cluster ? cluster.color : "#d6ff5f") + '"></circle>' +
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
  render();
});
document.querySelector("#close-detail").addEventListener("click", () => { detail.hidden = true; });

fetch(dataUrl)
  .then(response => { if (!response.ok) throw new Error("Could not load " + dataUrl); return response.json(); })
  .then(garden => { state.garden = garden; status.remove(); render(); })
  .catch(error => { status.textContent = error.message; });
