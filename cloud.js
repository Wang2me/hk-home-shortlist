(function () {
  const CODE_KEY = "hk-home-family-code-v1";
  const cfg = window.HOME_CLOUD_CONFIG || {};
  let app = null;
  let ready = false;
  let lastError = "";

  function friendlyError(error) {
    const message = error?.message || String(error || "未知错误");
    if (/failed to fetch|network|unreachable/i.test(message)) return "CloudBase 网关无法访问。网页已使用 Publishable Key 直连，请检查 home-api 是否为已部署的普通云函数，以及 Publishable Key 是否属于当前环境。";
    if (/not found|function/i.test(message)) return `未找到普通云函数 ${cfg.functionName || "home-api"}，请确认函数名称和部署状态。`;
    return message;
  }

  function configured() {
    return cfg.envId && cfg.publishableKey && !cfg.envId.startsWith("YOUR_") && !cfg.publishableKey.startsWith("YOUR_");
  }

  function isCloudBaseHost() {
    return /(?:\.tcloudbaseapp\.com|\.tcb\.qcloud\.la)$/i.test(location.hostname) || ["localhost", "127.0.0.1"].includes(location.hostname);
  }

  async function init() {
    if (!configured() || !window.cloudbase) return { ready: false, reason: "not_configured", error: "CloudBase 网页配置不完整" };
    if (!isCloudBaseHost()) return { ready: false, reason: "unsupported_origin", error: "GitHub Pages 来源会被 CloudBase 拒绝。请使用 CloudBase 静态托管生成的 tcloudbaseapp.com 地址连接家庭云。" };
    try {
      app = window.cloudbase.init({ env: cfg.envId, region: cfg.region || "ap-shanghai", accessKey: cfg.publishableKey, timeout: 60000 });
      const login = await app.auth().signInAnonymously();
      if (login?.error) throw login.error;
      ready = true; lastError = "";
      return { ready: true, hasFamilyCode: Boolean(getFamilyCode()) };
    } catch (error) {
      ready = false; lastError = friendlyError(error);
      return { ready: false, reason: "init_failed", error: lastError };
    }
  }

  function getFamilyCode() { return localStorage.getItem(CODE_KEY) || ""; }
  function setFamilyCode(code) { localStorage.setItem(CODE_KEY, code.trim()); }
  function forgetFamilyCode() { localStorage.removeItem(CODE_KEY); }

  async function call(action, payload = {}) {
    if (!ready || !app) throw new Error("云端尚未连接");
    const familyCode = getFamilyCode();
    if (!familyCode) throw new Error("请先输入家庭邀请码");
    let response;
    try { response = await app.callFunction({ name: cfg.functionName || "home-api", data: { action, familyCode, ...payload } }); }
    catch (error) { throw new Error(friendlyError(error)); }
    const result = response.result || response;
    if (!result.ok) throw new Error(result.error || "云端操作失败");
    return result.data;
  }

  window.HomeCloud = { init, call, configured, getFamilyCode, setFamilyCode, forgetFamilyCode, isReady: () => ready, getLastError: () => lastError };
})();
