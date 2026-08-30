(() => {
  const pageParams = new URLSearchParams(location.search);
  const MONITOR_SELECTOR =
    pageParams.get("popout") === "true" && pageParams.get("target") === "xTracker"
      ? '[data-testid="virtuoso-scroller"]'
      : '[data-id="KEY_X_SNIPER_RND_V1"]';
  const ITEM_SELECTOR = `${MONITOR_SELECTOR} [data-testid="virtuoso-item-list"] > [data-index]`;
  const GMGN_TOKEN_PATH = /^\/[a-z0-9_-]+\/token\/0x[0-9a-f]{40}$/i;
  const UNISIGNAL_ITEM_PREFIX = "unisignal:";
  const USER_TAGS = [
    "featured",
    "kol",
    "trader",
    "master",
    "politics",
    "media",
    "companies",
    "founder",
    "exchange",
    "celebrity",
    "binance_square",
    "instagram",
    "exchange_listing",
    "other",
  ];
  const pendingMessages = new Map();
  const receivedMessageSignatures = new Map();
  let scanTimer;
  let injectTimer;
  let injectRetryCount = 0;
  let webpackRequire;
  let quotationSocketManager;
  let nativeUserIdentity;

  document.addEventListener("unisignal:navigate", () => {
    const path = document.documentElement.dataset.unisignalNavigate;
    delete document.documentElement.dataset.unisignalNavigate;
    if (!GMGN_TOKEN_PATH.test(path || "") || location.pathname === path) return;

    window.next.router.push(path);
  });

  function getItemData(wrapper) {
    const item = wrapper.querySelector(":scope > .gmgn-vlist-item");
    const reactPropsKey = item && Object.keys(item).find((key) => key.startsWith("__reactProps$"));
    return item?.[reactPropsKey]?.children?.props?.children?.props?.item;
  }

  function scan() {
    for (const wrapper of document.querySelectorAll(ITEM_SELECTOR)) {
      const item = getItemData(wrapper);
      const timestamp = item?.tw_timestamp;
      if (timestamp) wrapper.dataset.unisignalTimestamp = timestamp;
      else delete wrapper.dataset.unisignalTimestamp;
    }
  }

  function getWebpackRequire() {
    if (webpackRequire) return webpackRequire;
    if (!Array.isArray(window.webpackChunk_N_E)) return;

    window.webpackChunk_N_E.push([
      [`unisignal-${Date.now()}`],
      {},
      (require) => {
        webpackRequire = require;
      },
    ]);
    return webpackRequire;
  }

  function getQuotationSocketManager() {
    if (quotationSocketManager) return quotationSocketManager;

    const require = getWebpackRequire();
    for (const [moduleId, factory] of Object.entries(require?.m || {})) {
      if (!/getQuotationSocketMgr\s*:/.test(String(factory))) continue;
      try {
        const module = require(moduleId);
        if (typeof module.getQuotationSocketMgr !== "function") continue;
        quotationSocketManager = module.getQuotationSocketMgr();
        return quotationSocketManager;
      } catch {
        continue;
      }
    }
  }

  function getNativeUserIdentity() {
    for (const wrapper of document.querySelectorAll(ITEM_SELECTOR)) {
      const item = getItemData(wrapper);
      if (
        !item ||
        (typeof item.id === "string" && item.id.startsWith(UNISIGNAL_ITEM_PREFIX))
      ) {
        continue;
      }
      if (!item.user?.twitter_user_id && !item.user?.screen_name) continue;
      nativeUserIdentity = {
        id: item.user.twitter_user_id || item.user.screen_name,
        platform: item.platform || 0,
      };
      return nativeUserIdentity;
    }
    return nativeUserIdentity;
  }

  function toTwitterMessage(message, nativeUser) {
    const timestamp = Date.parse(message.date);
    return {
      i: `${UNISIGNAL_ITEM_PREFIX}${message.key}`,
      tw: "tweet",
      ti: `${UNISIGNAL_ITEM_PREFIX}${message.key}`,
      ts: String(Number.isNaN(timestamp) ? Date.now() : timestamp),
      cp: 1,
      u: {
        s: "_unisignal",
        n: message.title,
        a: message.avatar,
        f: 0,
        uid: nativeUser.id,
        url: message.telegramUrl,
      },
      c: { t: message.text },
      ut: [...USER_TAGS],
      pf: nativeUser.platform,
      ...(message.token
        ? {
          tt: "token",
          t: {
            c: message.token.chain,
            s: "CA",
            a: message.token.address,
            i: "",
          },
        }
        : {}),
    };
  }

  function hasNativeSubscribers(manager, messages) {
    try {
      const needsBasic = messages.some((message) => !message.token);
      const needsToken = messages.some((message) => message.token);
      const hasBasic = [
        manager.getXMonitorSocket().basicCache.getDataSubject(),
        manager.getXMonitorUserBasicSocket().userBasicCache.getDataSubject(),
      ].some((subject) => subject.observed);
      const hasToken = [
        manager.getXMonitorSocket().tokenCache.getDataSubject(),
        manager.getXMonitorUserTokenSocket().userTokenCache.getDataSubject(),
      ].some((subject) => subject.observed);
      return (!needsBasic || hasBasic) && (!needsToken || hasToken);
    } catch {
      return false;
    }
  }

  function scheduleInjectRetry(reset = false) {
    if (reset) injectRetryCount = 0;
    if (injectTimer) return;
    const delay =
      document.visibilityState === "visible" && injectRetryCount < 40 ? 50 : 500;
    injectRetryCount += 1;
    injectTimer = setTimeout(() => {
      injectTimer = undefined;
      flushMessages();
    }, delay);
  }

  function flushMessages() {
    clearTimeout(injectTimer);
    injectTimer = undefined;
    if (pendingMessages.size === 0) return;

    const manager = getQuotationSocketManager();
    const nativeUser = getNativeUserIdentity();
    const messages = [...pendingMessages.values()];
    if (!manager || !nativeUser || !hasNativeSubscribers(manager, messages)) {
      scheduleInjectRetry();
      return;
    }

    const basicMessages = messages
      .filter((message) => !message.token)
      .map((message) => toTwitterMessage(message, nativeUser));
    const tokenMessages = messages
      .filter((message) => message.token)
      .map((message) => toTwitterMessage(message, nativeUser));
    try {
      if (basicMessages.length > 0) {
        manager.getXMonitorSocket().handleBasicData(basicMessages);
        manager.getXMonitorUserBasicSocket().handleUserBasicData(basicMessages);
      }
      if (tokenMessages.length > 0) {
        manager.getXMonitorSocket().handleTokenData(tokenMessages);
        manager.getXMonitorUserTokenSocket().handleUserTokenData(tokenMessages);
      }
      for (const message of messages) {
        receivedMessageSignatures.set(message.key, JSON.stringify(message));
      }
      pendingMessages.clear();
      injectRetryCount = 0;
      scheduleScan();
    } catch {
      quotationSocketManager = undefined;
      scheduleInjectRetry();
    }
  }

  document.addEventListener("unisignal:inject-twitter", () => {
    const serialized = document.documentElement.dataset.unisignalTwitterMessages;
    delete document.documentElement.dataset.unisignalTwitterMessages;
    if (!serialized) return;

    try {
      const messages = JSON.parse(serialized);
      const messageKeys = new Set(messages.map((message) => message.key));
      for (const key of receivedMessageSignatures.keys()) {
        if (!messageKeys.has(key)) receivedMessageSignatures.delete(key);
      }
      for (const key of pendingMessages.keys()) {
        if (!messageKeys.has(key)) pendingMessages.delete(key);
      }

      for (const message of messages) {
        const signature = JSON.stringify(message);
        if (receivedMessageSignatures.get(message.key) === signature) continue;
        pendingMessages.set(message.key, message);
      }
      if (pendingMessages.size > 0) {
        injectRetryCount = 0;
        flushMessages();
      }
    } catch {
      return;
    }
  });

  window.addEventListener("focus", () => {
    if (pendingMessages.size > 0) scheduleInjectRetry(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingMessages.size > 0) {
      scheduleInjectRetry(true);
    }
  });

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 50);
  }

  function mutationAffectsItems(mutation) {
    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    const target =
      mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (target?.closest(MONITOR_SELECTOR)) return true;

    return changedNodes.some(
      (node) =>
        node instanceof Element &&
        (node.matches(MONITOR_SELECTOR) || node.querySelector(MONITOR_SELECTOR)),
    );
  }

  scheduleScan();
  new MutationObserver((mutations) => {
    if (mutations.some(mutationAffectsItems)) scheduleScan();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
