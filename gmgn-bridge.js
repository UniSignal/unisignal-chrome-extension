(() => {
  const MONITOR_SELECTOR = '[data-id="KEY_X_SNIPER_RND_V1"]';
  const ITEM_SELECTOR = `${MONITOR_SELECTOR} [data-testid="virtuoso-item-list"] > [data-index]`;
  const GMGN_TOKEN_PATH = /^\/[a-z0-9_-]+\/token\/0x[0-9a-f]{40}$/i;
  let scanTimer;

  document.addEventListener("unisignal:navigate", () => {
    const path = document.documentElement.dataset.unisignalNavigate;
    delete document.documentElement.dataset.unisignalNavigate;
    if (!GMGN_TOKEN_PATH.test(path || "") || location.pathname === path) return;

    window.next.router.push(path);
  });

  function getItemTimestamp(wrapper) {
    const item = wrapper.querySelector(":scope > .gmgn-vlist-item");
    const reactPropsKey = item && Object.keys(item).find((key) => key.startsWith("__reactProps$"));
    return item?.[reactPropsKey]?.children?.props?.children?.props?.item?.tw_timestamp;
  }

  function scan() {
    for (const wrapper of document.querySelectorAll(ITEM_SELECTOR)) {
      const timestamp = getItemTimestamp(wrapper);
      if (timestamp) wrapper.dataset.unisignalTimestamp = timestamp;
      else delete wrapper.dataset.unisignalTimestamp;
    }
  }

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
