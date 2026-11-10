(function () {
  const CODE_KEY = "hk-home-family-code-v1";
  const cfg = window.HOME_CLOUD_CONFIG || {};
  let app = null;
  let ready = false;
  let lastError = "";

  function friendlyError(error) {
    const message = error?.message || String(error || "未知错误");
    if (/failed to fetch|network|unreachable/i.test(message)) return "CloudBase 无法访问：请在腾讯云“安全配置 → WEB安全域名”中添加 wang2me.github.io，并确认已开启匿名登录。安全域名通常需要几分钟生效。";
    if (/not found|function/i.test(message)) return `未找到普通云函数 ${cfg.functionName || "home-api"}，请确认函数名称和部署状态。`;
    return message;
  }

  function configured() {
    return cfg.envId && cfg.publishableKey && !cfg.envId.startsWith("YOUR_") && !cfg.publishableKey.startsWith("YOUR_");
  }

  async function init() {
    if (!configured() || !window.cloudbase) return { ready: false, reason: "not_configured", error: "CloudBase 网页配置不完整" };
    try {
      app = window.cloudbase.init({ env: cfg.envId, region: cfg.region || "ap-shanghai", accessKey: cfg.publishableKey, timeout: 60000 });
      const login = await app.auth().signInAnonymously();
      if (login?.error) throw login.error;
      ready = true; lastError = "";
      return { ready: true, hasFamilyCode: Boolean(getFamilyCode()) };
    } catch (error) {
      ready = false; lastError = friendlyError(error);
      return { ready: false, reason: "auth_failed", error: lastError };
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
