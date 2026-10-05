const API = "/api";
const $ = (id) => document.getElementById(id);
const pct = (v) => (v * 100).toFixed(1) + "%";
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 3500);
}

async function api(path, options = {}) {
  const opts = { headers: { "Content-Type": "application/json" }, ...options };
  let res;
  try { res = await fetch(API + path, opts); } catch (e) { throw new Error("Cannot reach the server."); }
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

window.App = {
  features: [],
  model: null,
  datasetSummary: null,
  charts: {}
};
