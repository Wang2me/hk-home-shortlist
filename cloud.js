(function () {
  const CODE_KEY = "hk-home-family-code-v1";
  const cfg = window.HOME_CLOUD_CONFIG || {};
  let app = null;
  let ready = false;

  function configured() {
    return cfg.envId && cfg.publishableKey && !cfg.envId.startsWith("YOUR_") && !cfg.publishableKey.startsWith("YOUR_");
  }

  async function init() {
    if (!configured() || !window.cloudbase) return { ready: false, reason: "not_configured" };
    app = window.cloudbase.init({ env: cfg.envId, region: cfg.region || "ap-shanghai", accessKey: cfg.publishableKey, timeout: 60000 });
    await app.auth().signInAnonymously();
    ready = true;
    return { ready: true, hasFamilyCode: Boolean(getFamilyCode()) };
  }

  function getFamilyCode() { return localStorage.getItem(CODE_KEY) || ""; }
  function setFamilyCode(code) { localStorage.setItem(CODE_KEY, code.trim()); }
  function forgetFamilyCode() { localStorage.removeItem(CODE_KEY); }

  async function call(action, payload = {}) {
    if (!ready || !app) throw new Error("云端尚未连接");
    const familyCode = getFamilyCode();
    if (!familyCode) throw new Error("请先输入家庭邀请码");
    const response = await app.callFunction({ name: cfg.functionName || "home-api", data: { action, familyCode, ...payload } });
    const result = response.result || response;
    if (!result.ok) throw new Error(result.error || "云端操作失败");
    return result.data;
  }

  window.HomeCloud = { init, call, configured, getFamilyCode, setFamilyCode, forgetFamilyCode, isReady: () => ready };
})();
