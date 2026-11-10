(function () {
  const CODE_KEY = "hk-home-family-code-v1";
  const cfg = window.HOME_CLOUD_CONFIG || {};
  let app = null;
  let auth = null;
  let ready = false;
  let lastError = "";

  function friendlyError(error, stage = "general") {
    const code = String(error?.code || error?.error?.code || error?.error_code || "");
    const message = error?.message || error?.error?.message || String(error || "未知错误");
    if (/RESOURCE_NOT_FOUND|\bnot_found\b/i.test(`${code} ${message}`)) {
      if (stage === "login") return "找不到这个家庭账号。请确认账号已在当前 CloudBase 环境的「身份认证 → 用户管理」中创建，并且状态为已启用。";
      if (stage === "function") return `当前 CloudBase 环境中找不到普通云函数 ${cfg.functionName || "home-api"}，请核对函数名称和环境 ID。`;
      return "CloudBase 找不到所需资源，请确认网页配置、家庭账号和云函数属于同一个环境。";
    }
    if (/EXCEED_AUTHORITY|exceeds granted authority/i.test(message)) return "当前家庭账号没有调用云函数的权限。请在 CloudBase「身份认证 → 策略管理」中把云函数调用策略关联到“注册用户”。";
    if (/failed to fetch|network|unreachable/i.test(message)) return "CloudBase 网关无法访问。网页已使用 Publishable Key 直连，请检查 home-api 是否为已部署的普通云函数，以及 Publishable Key 是否属于当前环境。";
    if (/not found|function/i.test(message)) return `未找到普通云函数 ${cfg.functionName || "home-api"}，请确认函数名称和部署状态。`;
    return message;
  }

  function configured() {
    return cfg.envId && cfg.publishableKey && !cfg.envId.startsWith("YOUR_") && !cfg.publishableKey.startsWith("YOUR_");
  }

  function isBlockedGitHubHost() {
    return /(?:^|\.)github\.io$/i.test(location.hostname);
  }

  async function init() {
    if (!configured() || !window.cloudbase) return { ready: false, reason: "not_configured", error: "CloudBase 网页配置不完整" };
    if (isBlockedGitHubHost()) return { ready: false, reason: "unsupported_origin", error: "GitHub Pages 来源会被 CloudBase 拒绝。请使用 CloudBase 静态托管提供的访问地址连接家庭云。" };
    try {
      app = window.cloudbase.init({ env: cfg.envId, region: cfg.region || "ap-shanghai", accessKey: cfg.publishableKey, timeout: 60000 });
      auth = app.auth();
      let session = null;
      if (typeof auth.getSession === "function") {
        const state = await auth.getSession();
        if (state?.error) throw state.error;
        session = state?.data?.session || state?.session || null;
      } else if (typeof auth.getLoginState === "function") {
        session = await auth.getLoginState();
      }
      ready = Boolean(session); lastError = ready ? "" : "请使用家庭账号登录";
      return { ready, reason: ready ? "" : "login_required", error: lastError, hasFamilyCode: Boolean(getFamilyCode()) };
    } catch (error) {
      ready = false; lastError = friendlyError(error, "login");
      return { ready: false, reason: "init_failed", error: lastError };
    }
  }

  function getFamilyCode() { return localStorage.getItem(CODE_KEY) || ""; }
  function setFamilyCode(code) { localStorage.setItem(CODE_KEY, code.trim()); }
  function forgetFamilyCode() { localStorage.removeItem(CODE_KEY); }

  async function signIn(username, password) {
    if (!auth) throw new Error("CloudBase 尚未初始化");
    const credentials = { username: String(username || "").trim(), password: String(password || "") };
    if (!credentials.username || !credentials.password) throw new Error("请输入家庭账号和密码");
    try {
      const result = typeof auth.signInWithPassword === "function"
        ? await auth.signInWithPassword(credentials)
        : await auth.signIn(credentials);
      if (result?.error) throw result.error;
      ready = true; lastError = "";
      return true;
    } catch (error) {
      ready = false; lastError = friendlyError(error, "login");
      throw new Error(lastError);
    }
  }

  async function signOut() {
    try { if (auth && typeof auth.signOut === "function") await auth.signOut(); }
    finally { ready = false; forgetFamilyCode(); }
  }

  async function call(action, payload = {}) {
    if (!ready || !app) throw new Error("云端尚未连接");
    const familyCode = getFamilyCode();
    if (!familyCode) throw new Error("请先输入家庭邀请码");
    let response;
    try { response = await app.callFunction({ name: cfg.functionName || "home-api", data: { action, familyCode, ...payload } }); }
    catch (error) { throw new Error(friendlyError(error, "function")); }
    const result = response.result || response;
    if (!result.ok) throw new Error(result.error || "云端操作失败");
    return result.data;
  }

  window.HomeCloud = { init, signIn, signOut, call, configured, getFamilyCode, setFamilyCode, forgetFamilyCode, isReady: () => ready, getLastError: () => lastError };
})();
