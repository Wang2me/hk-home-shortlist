const STORAGE_KEY = "hk-home-shortlist-v1";
const SETTINGS_KEY = "hk-home-mortgage-settings-v1";
const areas = ["上环", "西营盘东段/上环交界", "西半山低段", "西营盘", "石塘咀", "其他"];
const defaultSettings = { downPayment: 30, annualRate: 3.5, years: 30 };

let properties = load(STORAGE_KEY, []);
let settings = { ...defaultSettings, ...load(SETTINGS_KEY, {}) };
let cloudMode = false;
let cloudError = "";
let pendingResearch = [];
const $ = (id) => document.getElementById(id);

function openDialogElement(dialog) {
  if (typeof dialog?.showModal === "function") dialog.showModal();
  else if (dialog) {
    dialog.setAttribute("open", "");
    dialog.classList.add("fallback-open");
    document.body.classList.add("modal-open");
  }
}

function closeDialogElement(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  dialog.classList.remove("fallback-open");
  if (!document.querySelector("dialog[open]")) document.body.classList.remove("modal-open");
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

async function cloudCall(action, payload = {}) {
  if (!cloudMode) return null;
  return window.HomeCloud.call(action, payload);
}

async function refreshCloud(silent = false) {
  if (!cloudMode || !window.HomeCloud.getFamilyCode()) return;
  try {
    properties = await cloudCall("list");
    save(); render();
    if (!silent) toast("已同步家庭共享清单");
  } catch (error) { if (!silent) alert(`同步失败：${error.message}`); }
}

function number(value) { return Number(value) || 0; }
function moneyWan(value) { return `${number(value).toLocaleString("zh-HK", { maximumFractionDigits: 1 })}万`; }
function moneyHkd(value) { return `HK$${Math.round(number(value)).toLocaleString("zh-HK")}`; }
function monthlyPayment(priceWan) {
  const principal = number(priceWan) * 10000 * (1 - settings.downPayment / 100);
  const months = settings.years * 12;
  const rate = settings.annualRate / 100 / 12;
  if (!rate) return months ? principal / months : principal;
  return principal * rate * (1 + rate) ** months / ((1 + rate) ** months - 1);
}
function deposit(priceWan) { return number(priceWan) * 10000 * settings.downPayment / 100; }
function loan(priceWan) { return number(priceWan) * 10000 * (1 - settings.downPayment / 100); }
function fitCore(p) { return p.type !== "唐楼" && p.elevator && p.price >= 300 && p.price <= 500 && p.size >= 280 && p.size <= 350; }
function ready(p) { return ["可直接入住", "新装修", "保养良好"].includes(p.condition); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function safeUrl(value = "") { try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } }
function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function warnings(p) {
  const list = [];
  if (p.type === "唐楼") list.push("唐楼");
  if (!p.elevator) list.push("没有电梯");
  if (p.price < 300 || p.price > 500) list.push("超出总价范围");
  if (p.size < 280 || p.size > 350) list.push("面积不在目标内");
  if (p.age >= 50) list.push("楼龄较高，先问按揭年期");
  if (p.condition === "需大修") list.push("需预留装修预算");
  return list;
}

function render() {
  const q = $("searchFilter").value.trim().toLowerCase();
  const area = $("areaFilter").value;
  const maxPrice = number($("priceFilter").value);
  let visible = properties.filter((p) => {
    const haystack = `${p.name} ${p.area} ${p.notes} ${p.layout}`.toLowerCase();
    return (!q || haystack.includes(q)) && (!area || p.area === area) && p.price <= maxPrice
      && (!$("favoriteFilter").checked || p.favorite) && (!$("fitFilter").checked || fitCore(p))
      && (!$("readyFilter").checked || ready(p));
  });
  const sort = $("sortSelect").value;
  const sorts = {
    updated: (a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""),
    score: (a,b) => b.score - a.score,
    priceAsc: (a,b) => a.price - b.price,
    monthlyAsc: (a,b) => monthlyPayment(a.price) - monthlyPayment(b.price),
    commuteAsc: (a,b) => (a.ferry || 9999) - (b.ferry || 9999),
    sizeDesc: (a,b) => b.size - a.size
  };
  visible.sort(sorts[sort]);
  $("propertyGrid").innerHTML = visible.map(cardHtml).join("");
  $("emptyState").hidden = visible.length > 0;
  $("resultCount").textContent = visible.length;
  $("countStat").textContent = properties.length;
  $("favoriteStat").textContent = properties.filter((p) => p.favorite).length;
  $("averageStat").textContent = properties.length ? Math.round(properties.reduce((s,p) => s + p.price, 0) / properties.length) : "—";
  const commutes = properties.map((p) => p.ferry).filter((v) => Number.isFinite(v) && v > 0);
  $("commuteStat").textContent = commutes.length ? Math.min(...commutes) : "—";
  bindCardActions();
}

function cardHtml(p) {
  const stars = p.score ? `${"★".repeat(p.score)}${"☆".repeat(5-p.score)}` : "未评分";
  const issueHtml = warnings(p).map((w) => `<span class="warning">${escapeHtml(w)}</span>`).join("");
  const link = safeUrl(p.link);
  return `<article class="property-card">
    <div class="card-top"><div class="card-line"><div><span class="area-tag">${escapeHtml(p.area)}</span><h3>${escapeHtml(p.name)}</h3><div class="meta">${escapeHtml(p.layout || "房型待补")} · ${p.size}呎 · ${escapeHtml(p.condition)} · 楼龄${p.age || "?"}年</div></div><button class="heart ${p.favorite ? "active" : ""}" data-favorite="${p.id}" aria-label="${p.favorite ? "取消喜欢" : "标记喜欢"}">♥</button></div>
    <div class="price-row"><span class="price">${moneyWan(p.price)}<small>HKD</small></span><span class="score"><span class="stars">${stars}</span></span></div></div>
    <div class="financials"><div><small>首付 ${settings.downPayment}%</small><strong>${moneyHkd(deposit(p.price))}</strong></div><div><small>贷款 ${100-settings.downPayment}%</small><strong>${moneyHkd(loan(p.price))}</strong></div><div><small>估算月供</small><strong>${moneyHkd(monthlyPayment(p.price))}</strong></div></div>
    <div class="commute"><div><small>港澳码头</small><strong>${p.ferry ? `${p.ferry} 分钟` : "待补"}</strong></div><div><small>上环站</small><strong>${p.sheungWan ? `${p.sheungWan} 分钟` : "待补"}</strong></div><div><small>金钟</small><strong>${p.admiralty ? `${p.admiralty} 分钟` : "待补"}</strong></div></div>
    <div class="notes">${escapeHtml(p.notes || "尚未添加家庭备注。")}</div>${issueHtml ? `<div class="warnings">${issueHtml}</div>` : ""}
    <div class="card-actions">${link ? `<a class="link" href="${escapeHtml(link)}" target="_blank" rel="noopener">打开房源 ↗</a>` : `<span class="meta">暂无链接</span>`}<button class="edit-button" data-edit="${p.id}">编辑资料</button></div>
  </article>`;
}

function bindCardActions() {
  document.querySelectorAll("[data-favorite]").forEach((btn) => btn.addEventListener("click", () => {
    const p = properties.find((x) => x.id === btn.dataset.favorite); if (!p) return;
    p.favorite = !p.favorite; p.updatedAt = new Date().toISOString(); save(); render();
    cloudCall("upsert", { property:p }).catch((error) => toast(`云端保存失败：${error.message}`));
  }));
  document.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openProperty(btn.dataset.edit)));
}

function openProperty(id = "") {
  $("propertyForm").reset();
  $("propertyId").value = id;
  $("dialogTitle").textContent = id ? "编辑房源" : "新增房源";
  $("deleteBtn").hidden = !id;
  $("elevatorInput").checked = true;
  if (id) {
    const p = properties.find((x) => x.id === id); if (!p) return;
    const mapping = { nameInput:"name", addressInput:"address", areaInput:"area", priceInput:"price", sizeInput:"size", layoutInput:"layout", ageInput:"age", conditionInput:"condition", typeInput:"type", ferryInput:"ferry", sheungWanInput:"sheungWan", admiraltyInput:"admiralty", scoreInput:"score", linkInput:"link", notesInput:"notes" };
    Object.entries(mapping).forEach(([el,key]) => $(el).value = p[key] ?? "");
    $("elevatorInput").checked = Boolean(p.elevator); $("favoriteInput").checked = Boolean(p.favorite);
  }
  openDialogElement($("propertyDialog"));
}

$("propertyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const id = $("propertyId").value || newId();
  const old = properties.find((p) => p.id === id);
  const p = { id, name: $("nameInput").value.trim(), address:$("addressInput").value.trim(), area: $("areaInput").value, price:number($("priceInput").value), size:number($("sizeInput").value), layout:$("layoutInput").value.trim(), age:number($("ageInput").value), condition:$("conditionInput").value, type:$("typeInput").value, elevator:$("elevatorInput").checked, favorite:$("favoriteInput").checked, ferry:number($("ferryInput").value), sheungWan:number($("sheungWanInput").value), admiralty:number($("admiraltyInput").value), score:number($("scoreInput").value), link:$("linkInput").value.trim(), notes:$("notesInput").value.trim(), sources:old?.sources || [], createdAt:old?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString() };
  if (old) properties = properties.map((x) => x.id === id ? p : x); else properties.unshift(p);
  save(); closeDialogElement($("propertyDialog")); render(); toast(old ? "房源资料已更新" : "房源已加入候选簿");
  cloudCall("upsert", { property:p }).catch((error) => toast(`云端保存失败：${error.message}`));
});

$("deleteBtn").addEventListener("click", () => {
  const id = $("propertyId").value;
  if (id && confirm("确定删除这套房源吗？")) { properties = properties.filter((p) => p.id !== id); save(); closeDialogElement($("propertyDialog")); render(); toast("房源已删除"); cloudCall("delete", { id }).catch((error) => toast(`云端删除失败：${error.message}`)); }
});

function openSettings() {
  $("downPaymentSetting").value = settings.downPayment; $("rateSetting").value = settings.annualRate; $("yearsSetting").value = settings.years; openDialogElement($("settingsDialog"));
}
$("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
  settings = { downPayment:number($("downPaymentSetting").value), annualRate:number($("rateSetting").value), years:number($("yearsSetting").value) };
  save(); closeDialogElement($("settingsDialog")); render(); toast("按揭参数已更新");
});

function exportData() {
  const payload = { app:"安居候选簿", version:1, exportedAt:new Date().toISOString(), settings, properties };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `安居候选簿-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); toast("清单已导出，可发给家人");
}
$("importInput").addEventListener("change", async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.properties)) throw new Error("格式不正确");
    const replace = properties.length === 0 || confirm(`导入文件有 ${data.properties.length} 套房源。按“确定”替换本机清单；按“取消”合并并保留本机清单。`);
    if (replace) properties = data.properties; else {
      const merged = new Map(properties.map((p) => [p.id, p])); data.properties.forEach((p) => merged.set(p.id || newId(), p)); properties = [...merged.values()];
    }
    if (data.settings && replace) settings = { ...defaultSettings, ...data.settings };
    save(); render(); toast(`已导入 ${data.properties.length} 套房源`);
    if (cloudMode) { properties = await cloudCall("bulk_import", { properties }); save(); render(); toast("导入内容已同步给家人"); }
  } catch { alert("无法导入：请选择由“安居候选簿”导出的 JSON 文件。"); }
  event.target.value = "";
});

function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2200); }
function resetFilters() { $("searchFilter").value=""; $("areaFilter").value=""; $("priceFilter").value="500"; $("priceOutput").textContent="500万"; $("favoriteFilter").checked=false; $("fitFilter").checked=true; $("readyFilter").checked=false; $("sortSelect").value="updated"; render(); }

function updateCloudBadge() {
  $("cloudBtn").classList.toggle("connected", cloudMode && Boolean(window.HomeCloud?.getFamilyCode()));
  $("cloudText").textContent = cloudMode ? (window.HomeCloud.getFamilyCode() ? "家庭云已同步" : "连接家庭云") : "配置家庭云";
}

async function initializeCloud() {
  if (!window.HomeCloud) return updateCloudBadge();
  try {
    const state = await window.HomeCloud.init();
    cloudMode = Boolean(state.ready);
    cloudError = state.error || "";
    updateCloudBadge();
    if (cloudMode && state.hasFamilyCode) await refreshCloud(true);
  } catch (error) { console.warn("CloudBase init failed", error); cloudMode = false; updateCloudBadge(); }
}

$("cloudForm").addEventListener("submit", async (event) => {
  event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
  if (!cloudMode) return alert(cloudError || window.HomeCloud?.getLastError() || "家庭云尚未连接，请检查 CloudBase 配置。");
  const oldLocal = [...properties];
  window.HomeCloud.setFamilyCode($("familyCodeInput").value);
  try {
    await cloudCall("ping");
    const remote = await cloudCall("list");
    if (!remote.length && oldLocal.length && confirm(`云端清单还是空的，是否把本机的 ${oldLocal.length} 套房源上传给家人？`)) properties = await cloudCall("bulk_import", { properties:oldLocal });
    else properties = remote;
    save(); render(); updateCloudBadge(); closeDialogElement($("cloudDialog")); toast("家庭共享清单已连接");
  } catch (error) { window.HomeCloud.forgetFamilyCode(); updateCloudBadge(); alert(`连接失败：${error.message}`); }
});

function openCloudDialog() {
  $("familyCodeInput").value = window.HomeCloud?.getFamilyCode() || "";
  $("disconnectCloudBtn").hidden = !window.HomeCloud?.getFamilyCode();
  openDialogElement($("cloudDialog"));
}
$("cloudBtn").addEventListener("click", openCloudDialog);
$("cloudInlineBtn").addEventListener("click", openCloudDialog);
$("disconnectCloudBtn").addEventListener("click", () => { window.HomeCloud?.forgetFamilyCode(); updateCloudBadge(); closeDialogElement($("cloudDialog")); toast("已断开家庭云，本机资料仍保留"); });

$("calculateCommuteBtn").addEventListener("click", async () => {
  if (!cloudMode || !window.HomeCloud.getFamilyCode()) return alert("请先连接家庭共享清单，才能调用腾讯地图计算路线。");
  const address = $("addressInput").value.trim(); if (!address) return alert("请先填写房源完整地址。");
  const button = $("calculateCommuteBtn"); button.disabled = true; button.textContent = "正在计算…";
  try { const data = await cloudCall("commute", { address }); $("ferryInput").value=data.ferry||""; $("sheungWanInput").value=data.sheungWan||""; $("admiraltyInput").value=data.admiralty||""; toast("真实路线时间已填入"); }
  catch (error) { alert(`路线计算失败：${error.message}`); }
  finally { button.disabled=false; button.textContent="自动计算路线"; }
});

$("researchBtn").addEventListener("click", () => {
  if (!cloudMode || !window.HomeCloud.getFamilyCode()) return alert("请先连接家庭共享清单，再使用联网智能找房。");
  openDialogElement($("researchDialog"));
});
$("researchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("researchQuery").value.trim(); if (!query) return;
  $("runResearchBtn").disabled=true; $("researchStatus").textContent="正在搜索并核对网页，通常需要20–60秒…"; $("researchResults").innerHTML=""; $("researchImportBar").hidden=true;
  try {
    const data = await cloudCall("research", { query }); pendingResearch = data.properties || [];
    $("researchResults").innerHTML = pendingResearch.length ? pendingResearch.map((p,i) => `<label class="research-item"><input type="checkbox" data-research-index="${i}" checked><span><h4>${escapeHtml(p.name || "未命名房源")} · ${p.price ? moneyWan(p.price) : "价格待核"}</h4><p>${escapeHtml(p.area || "区域待核")} · ${p.size ? `${p.size}呎` : "面积待核"} · ${escapeHtml(p.condition || "装修待核")}${safeUrl(p.link) ? ` · <a href="${escapeHtml(safeUrl(p.link))}" target="_blank" rel="noopener">查看来源 ↗</a>` : ""}</p></span></label>`).join("") : `<p class="empty-state">没有找到可可靠提取的在售房源，请换一种描述再试。</p>`;
    $("researchStatus").textContent=`找到 ${pendingResearch.length} 套候选，请先打开来源核对`; $("researchImportBar").hidden=!pendingResearch.length;
  } catch (error) { $("researchStatus").textContent=""; alert(`智能检索失败：${error.message}`); }
  finally { $("runResearchBtn").disabled=false; }
});
$("importResearchBtn").addEventListener("click", async () => {
  const selected = [...document.querySelectorAll("[data-research-index]:checked")].map((el) => pendingResearch[number(el.dataset.researchIndex)]).filter(Boolean);
  if (!selected.length) return alert("请至少选择一套房源。");
  try { properties = await cloudCall("bulk_import", { properties:selected }); save(); render(); closeDialogElement($("researchDialog")); toast(`已加入并同步 ${selected.length} 套候选`); }
  catch (error) { alert(`加入失败：${error.message}`); }
});

areas.forEach((area) => $("areaFilter").insertAdjacentHTML("beforeend", `<option value="${area}">${area}</option>`));
[$("searchFilter"),$("areaFilter"),$("favoriteFilter"),$("fitFilter"),$("readyFilter"),$("sortSelect")].forEach((el) => el.addEventListener("input", render));
$("priceFilter").addEventListener("input", () => { $("priceOutput").textContent = `${$("priceFilter").value}万`; render(); });
$("addBtn").addEventListener("click", () => openProperty()); $("emptyAddBtn").addEventListener("click", () => openProperty());
$("settingsBtn").addEventListener("click", openSettings); $("exportBtn").addEventListener("click", exportData); $("resetFiltersBtn").addEventListener("click", resetFilters);
$("clearBtn").addEventListener("click", async () => { const scope = cloudMode && window.HomeCloud.getFamilyCode() ? "全家的云端及本机" : "这台设备上"; if (properties.length && confirm(`确定清空${scope}保存的全部候选房源吗？此操作无法撤销，建议先导出备份。`)) { if (cloudMode && window.HomeCloud.getFamilyCode()) await cloudCall("clear"); properties=[]; save(); render(); toast("候选清单已清空"); } });
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialogElement(dialog); }));
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialogElement(button.closest("dialog"))));
render();
initializeCloud();
setInterval(() => refreshCloud(true), 30000);
