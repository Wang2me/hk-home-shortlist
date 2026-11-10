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
    ferry: num(input.ferry), sheungWan: num(input.sheungWan), admiralty: num(input.admiralty), score: Math.max(0, Math.min(5, num(input.score))),
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
  const record = { ...p, _id: docId, familyId: fid };
  try { await collection.doc(docId).set(record); }
  catch { await collection.doc(docId).update(record); }
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
  if (!response.ok) throw new Error(data?.error?.message || `DeepSeek 请求失败（${response.status}）`);
  return data;
}

async function research(query) {
  if (!query || query.trim().length < 4) throw new Error("请写明想找的区域和条件");
  const search = await deepSeek("/v1/tools/search", { query: query.trim().slice(0, 128), count: 10, need_content: true, ori_question: query.trim().slice(0, 128) });
  const evidence = (search.results || []).slice(0, 10).map((r) => ({ title: r.title, url: r.url, site: r.site_name, date: r.date, summary: r.summary || r.snippet, content: (r.content || "").slice(0, 10000) }));
  if (!evidence.length) return { properties: [], sources: [] };
  const prompt = `请从以下联网检索结果中提取真实在售香港住宅。只返回JSON，不要猜测缺失数字。目标：自住、300–500万港币、280–350实呎、上环/西营盘东段/西半山低段/西营盘，排除唐楼、必须电梯、可入住优先。用户补充要求：${query}\n\n资料：${JSON.stringify(evidence)}`;
  const chat = await deepSeek("/chat/completions", { model: "deepseek-flash", reasoning_effort: "none", response_format: { type: "json_object" }, messages: [{ role: "system", content: "你是谨慎的香港房源资料整理员。输出JSON对象，键为properties。每项仅含 name,address,area,price,size,layout,age,condition,type,elevator,link,notes,sourceUrl。price单位为万港币，未知数字填0；不得虚构。相同房源去重。" }, { role: "user", content: prompt }], max_tokens: 8000 });
  const parsed = JSON.parse(chat.choices?.[0]?.message?.content || '{"properties":[]}');
  const properties = (parsed.properties || []).slice(0, 20).map((p) => cleanProperty({ ...p, link: p.link || p.sourceUrl, sources: p.sourceUrl ? [{ url: p.sourceUrl }] : [], notes: `${p.notes || ""}${p.sourceUrl ? `\n来源：${p.sourceUrl}` : ""}`.trim() }));
  return { properties, sources: evidence.map(({ title, url, site, date }) => ({ title, url, site, date })) };
}

async function mapGet(path, params) {
  const key = process.env.TENCENT_MAP_KEY;
  if (!key) throw new Error("云函数尚未配置 TENCENT_MAP_KEY");
  const url = new URL(`https://apis.map.qq.com${path}`);
  Object.entries({ ...params, key }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.status !== 0) throw new Error(data.message || "腾讯地图请求失败");
  return data.result;
}

async function commute(address) {
  if (!address || address.trim().length < 4) throw new Error("请先填写完整房源地址");
  const geo = await mapGet("/ws/geocoder/v1/", { address: `香港 ${address.trim()}`, region: "香港" });
  const from = `${geo.location.lat},${geo.location.lng}`;
  const walking = await mapGet("/ws/distance/v1/matrix", { mode: "walking", from, to: `${DESTINATIONS.ferry};${DESTINATIONS.sheungWan}` });
  let admiralty = 0;
  try {
    const transit = await mapGet("/ws/direction/v1/transit/", { from, to: DESTINATIONS.admiralty, policy: "LEAST_TIME" });
    admiralty = Math.ceil(Number(transit.routes?.[0]?.duration || 0));
  } catch { /* 部分腾讯地图账号未开通公交路线，保留为0 */ }
  const elements = walking.rows?.[0]?.elements || [];
  return { ferry: Math.ceil((elements[0]?.duration || 0) / 60), sheungWan: Math.ceil((elements[1]?.duration || 0) / 60), admiralty, location: geo.location, calculatedAt: new Date().toISOString() };
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
      case "commute": return { ok: true, data: await commute(event.address) };
      default: throw new Error("未知操作");
    }
  } catch (error) { console.error(error); return { ok: false, error: error.message || "服务器错误" }; }
};
