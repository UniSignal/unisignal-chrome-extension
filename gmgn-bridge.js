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
    "recommended",
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
    "user",
  ];
  const pendingMessages = new Map();
  let scanTimer;
  let injectTimer;
  let webpackRequire;
  let quotationSocketManager;

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
      if (!item || item.id?.startsWith(UNISIGNAL_ITEM_PREFIX)) continue;
      if (!item.user?.twitter_user_id && !item.user?.screen_name) continue;
      return {
        id: item.user.twitter_user_id || item.user.screen_name,
        platform: item.platform || 0,
      };
    }
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
        s: "UniSignal",
        n: message.title,
        a: message.avatar,
        f: 0,
        uid: nativeUser.id,
        url: message.telegramUrl,
      },
      c: { t: message.text },
      ut: [...USER_TAGS],
      pf: nativeUser.platform,
      tt: "token",
      t: message.token
        ? {
          c: message.token.chain,
          s: "CA",
          a: message.token.address,
          i: "",
        }
        : {},
    };
  }

  function flushMessages() {
    clearTimeout(injectTimer);
    const manager = getQuotationSocketManager();
    const nativeUser = getNativeUserIdentity();
    if (!manager || !nativeUser) {
      injectTimer = setTimeout(flushMessages, 250);
      return;
    }

    const messages = [...pendingMessages.values()];
    pendingMessages.clear();

    manager.getXMonitorSocket().handleBasicData(
      messages.map((message) => toTwitterMessage(message, nativeUser)),
    );
    manager.getXMonitorSocket().handleTokenData(
      messages.map((message) => toTwitterMessage(message, nativeUser)),
    );
    manager.getXMonitorUserBasicSocket().handleUserBasicData(
      messages.map((message) => toTwitterMessage(message, nativeUser)),
    );
    manager.getXMonitorUserTokenSocket().handleUserTokenData(
      messages.map((message) => toTwitterMessage(message, nativeUser)),
    );
    scheduleScan();
  }

  document.addEventListener("unisignal:inject-twitter", () => {
    const serialized = document.documentElement.dataset.unisignalTwitterMessages;
    delete document.documentElement.dataset.unisignalTwitterMessages;
    if (!serialized) return;

    try {
      for (const message of JSON.parse(serialized)) pendingMessages.set(message.key, message);
      clearTimeout(injectTimer);
      injectTimer = setTimeout(flushMessages, 0);
    } catch {
      return;
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
