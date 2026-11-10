const cloudbase = require("@cloudbase/node-sdk");
const crypto = require("crypto");
const app = cloudbase.init({ env: process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const collection = db.collection("properties");

const DESTINATIONS = {
  ferry: "22.28955,114.15143",
  sheungWan: "22.28663,114.15186",
  admiralty: "22.27962,114.16545"
};

function familyId(code) {
  if (typeof code !== "string" || code.trim().length < 10) throw new Error("家庭邀请码至少需要10位");
  const salt = process.env.FAMILY_SALT;
  if (!salt) throw new Error("云函数缺少 FAMILY_SALT 环境变量");
  return crypto.createHash("sha256").update(`${salt}:${code.trim()}`).digest("hex").slice(0, 32);
}

function cleanProperty(input = {}) {
  const text = (v, n = 1000) => String(v || "").trim().slice(0, n);
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  return {
    id: text(input.id, 80) || crypto.randomUUID(), name: text(input.name, 200), address: text(input.address, 300),
    area: text(input.area, 100), price: num(input.price), size: num(input.size), layout: text(input.layout, 80), age: num(input.age),
    condition: text(input.condition, 80), type: text(input.type, 80), elevator: Boolean(input.elevator), favorite: Boolean(input.favorite),
    ferry: num(input.ferry), sheungWan: num(input.sheungWan), admiralty: num(input.admiralty), commuteMode: text(input.commuteMode, 20) || "smart", score: Math.max(0, Math.min(5, num(input.score))),
    link: text(input.link, 1500), notes: text(input.notes, 4000), sources: Array.isArray(input.sources) ? input.sources.slice(0, 10) : [],
    createdAt: text(input.createdAt, 50) || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

async function list(fid) {
  const result = await collection.where({ familyId: fid }).orderBy("updatedAt", "desc").limit(500).get();
  return result.data.map(({ familyId, _id, ...p }) => ({ ...p, id: p.id || _id }));
}

async function upsert(fid, input) {
  const p = cleanProperty(input);
  const docId = `${fid.slice(0, 12)}_${p.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}`;
  const record = { ...p, familyId: fid };
  await collection.doc(docId).set(record);
  return p;
}

async function remove(fid, id) {
  const docId = `${fid.slice(0, 12)}_${String(id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}`;
  const found = await collection.doc(docId).get();
  if (!found.data?.length || found.data[0].familyId !== fid) throw new Error("房源不存在或无权删除");
  await collection.doc(docId).remove();
  return true;
}

async function deepSeek(path, body) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("云函数尚未配置 DEEPSEEK_API_KEY");
  const response = await fetch(`https://api.deepseek.com${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) {
    const stage = path.includes("/tools/search") ? "DeepSeek 联网搜索" : "DeepSeek 房源整理";
    throw new Error(`${stage}失败（HTTP ${response.status}）：${data?.error?.message || "未知错误"}`);
  }
  return data;
}

async function research(query) {
  if (!query || query.trim().length < 4) throw new Error("请写明想找的区域和条件");
  const search = await deepSeek("/v1/tools/search", { query: query.trim().slice(0, 128), count: 10, need_content: true, ori_question: query.trim().slice(0, 128) });
  const evidence = (search.results || []).slice(0, 10).map((r) => ({ title: r.title, url: r.url, site: r.site_name, date: r.date, summary: r.summary || r.snippet, content: (r.content || "").slice(0, 10000) }));
  if (!evidence.length) return { properties: [], sources: [] };
  const prompt = `请从以下联网检索结果中提取真实在售香港住宅。只返回JSON，不要猜测缺失数字。目标：自住、300–500万港币、280–350实呎、上环/西营盘东段/西半山低段/西营盘，排除唐楼、必须电梯、可入住优先。用户补充要求：${query}\n\n资料：${JSON.stringify(evidence)}`;
  const chat = await deepSeek("/chat/completions", { model: "deepseek-flash", reasoning_effort: "none", response_format: { type: "json_object" }, messages: [{ role: "system", content: "你是谨慎的香港房源资料整理员。输出JSON对象，键为properties。每项仅含 name,address,area,price,size,layout,age,condition,type,elevator,link,notes,sourceUrl。address必须是来源页面明确写出的完整大厦/屋苑名称、街道及门牌；仅有区域时填空字符串，绝不猜测。price单位为万港币，未知数字填0；不得虚构。相同房源去重。" }, { role: "user", content: prompt }], max_tokens: 8000 });
  const parsed = JSON.parse(chat.choices?.[0]?.message?.content || '{"properties":[]}');
  const properties = (parsed.properties || []).slice(0, 20).map((p) => cleanProperty({ ...p, link: p.link || p.sourceUrl, sources: p.sourceUrl ? [{ url: p.sourceUrl }] : [], notes: `${p.notes || ""}${p.sourceUrl ? `\n来源：${p.sourceUrl}` : ""}`.trim() }));
  return { properties, sources: evidence.map(({ title, url, site, date }) => ({ title, url, site, date })) };
}

async function tencentGet(path, params) {
  const key = process.env.TENCENT_MAP_KEY;
  if (!key) throw new Error("云函数尚未配置 TENCENT_MAP_KEY");
  const url = new URL(`https://apis.map.qq.com${path}`);
  Object.entries({ ...params, key }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.status !== 0) throw new Error(`腾讯位置服务请求失败：${data.message || `HTTP ${response.status}`}`);
  return data.result;
}

async function matrixTimes(from, destinations, mode) {
  const result = await tencentGet("/ws/distance/v1/matrix", { mode, from, to: destinations.join(";") });
  return (result.rows?.[0]?.elements || []).map((item) => Math.ceil(Number(item.duration || 0) / 60));
}

async function directionTime(from, to, mode) {
  const policy = mode === "transit" ? "LEAST_TIME" : mode === "driving" ? "LEAST_TIME,REAL_TRAFFIC" : undefined;
  const result = await tencentGet(`/ws/direction/v1/${mode}/`, { from, to, ...(policy ? { policy } : {}) });
  const duration = Number(result.routes?.[0]?.duration || 0);
  if (!duration) throw new Error("腾讯位置服务暂时没有返回可用路线");
  return Math.ceil(duration);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function commute(address, requestedMode = "smart") {
  if (!address || address.trim().length < 4) throw new Error("请先填写完整房源地址");
  const allowed = ["smart", "walking", "transit", "driving", "bicycling"];
  const mode = allowed.includes(requestedMode) ? requestedMode : "smart";
  const geo = await tencentGet("/ws/geocoder/v1/", { address: `香港 ${address.trim()}`, region: "香港", policy: "1" });
  const from = `${geo.location.lat},${geo.location.lng}`;
  await delay(1100);
  let ferry = 0, sheungWan = 0, admiralty = 0;
  if (mode === "smart") {
    [ferry, sheungWan] = await matrixTimes(from, [DESTINATIONS.ferry, DESTINATIONS.sheungWan], "walking");
    await delay(1100);
    admiralty = await directionTime(from, DESTINATIONS.admiralty, "transit");
  } else if (mode === "transit") {
    ferry = await directionTime(from, DESTINATIONS.ferry, mode); await delay(1100);
    sheungWan = await directionTime(from, DESTINATIONS.sheungWan, mode); await delay(1100);
    admiralty = await directionTime(from, DESTINATIONS.admiralty, mode);
  } else {
    [ferry, sheungWan, admiralty] = await matrixTimes(from, Object.values(DESTINATIONS), mode);
  }
  const normalizedAddress = [geo.ad_info?.city, geo.ad_info?.district, geo.title].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(" ");
  return { ferry, sheungWan, admiralty, mode, normalizedAddress, provider: "腾讯位置服务", calculatedAt: new Date().toISOString() };
}

exports.main = async (event) => {
  try {
    const fid = familyId(event.familyCode);
    switch (event.action) {
      case "ping": return { ok: true, data: { connected: true } };
      case "list": return { ok: true, data: await list(fid) };
      case "upsert": return { ok: true, data: await upsert(fid, event.property) };
      case "delete": return { ok: true, data: await remove(fid, event.id) };
      case "bulk_import": for (const p of (event.properties || []).slice(0, 500)) await upsert(fid, p); return { ok: true, data: await list(fid) };
      case "clear": await collection.where({ familyId: fid }).remove(); return { ok: true, data: true };
      case "research": return { ok: true, data: await research(event.query) };
      case "commute": return { ok: true, data: await commute(event.address, event.mode) };
      default: throw new Error("未知操作");
    }
  } catch (error) { console.error(error); return { ok: false, error: error.message || "服务器错误" }; }
};
