(() => {
  const TARGET_ROOT_SELECTOR = '[data-id="KEY_X_SNIPER_RND_V1"]';
  const ITEM_SELECTOR = `${TARGET_ROOT_SELECTOR} [data-testid="virtuoso-item-list"] > [data-index]`;
  const TWITTER_EPOCH = 1_288_834_974_657n;
  const GMGN_TOKEN_PATH = /^\/bsc\/token\/0x[0-9a-f]{40}$/i;
  let scanTimer;

  document.addEventListener("unisignal:navigate", () => {
    const path = document.documentElement.dataset.unisignalNavigate;
    delete document.documentElement.dataset.unisignalNavigate;
    if (!GMGN_TOKEN_PATH.test(path || "") || location.pathname === path) return;

    history.pushState(history.state, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  });

  function isTweetSnowflake(value) {
    if (typeof value !== "string" || !/^\d{15,20}$/.test(value)) return false;
    const timestamp = Number((BigInt(value) >> 22n) + TWITTER_EPOCH);
    return timestamp >= Number(TWITTER_EPOCH) && timestamp <= Date.now() + 86_400_000;
  }

  function collectSnowflakes(value, candidates, depth = 0, seen = new WeakSet()) {
    if (typeof value === "bigint") {
      const candidate = value.toString();
      if (isTweetSnowflake(candidate)) candidates.add(candidate);
      return;
    }
    if (typeof value === "string") {
      for (const [candidate] of value.matchAll(/\d{15,20}/g)) {
        if (isTweetSnowflake(candidate)) candidates.add(candidate);
      }
      return;
    }
    if (!value || typeof value !== "object" || value instanceof Node || depth > 6) return;
    if (seen.has(value)) return;
    seen.add(value);

    for (const child of Object.values(value)) {
      collectSnowflakes(child, candidates, depth + 1, seen);
    }
  }

  function parseRelativeTimestamp(item) {
    const timeElement = [...item.querySelectorAll("span")].find((element) =>
      /^\d+\s*[smhd]$/.test(element.textContent.trim()),
    );
    if (!timeElement) return null;

    const [, amount, unit] = timeElement.textContent.trim().match(/^(\d+)\s*([smhd])$/);
    const unitMilliseconds = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    const resolution = unitMilliseconds[unit];
    return {
      timestamp: Date.now() - Number(amount) * resolution,
      tolerance: resolution * 1.5,
    };
  }

  function extractTweetId(item) {
    const relativeTime = parseRelativeTimestamp(item);
    if (!relativeTime) return null;

    const candidates = new Set();
    for (const element of [item, ...item.querySelectorAll("*")]) {
      for (const key of Object.keys(element)) {
        if (key.startsWith("__reactProps$")) {
          collectSnowflakes(element[key], candidates);
        }
        if (key.startsWith("__reactFiber$")) {
          let fiber = element[key];
          for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
            collectSnowflakes(fiber.key, candidates);
            collectSnowflakes(fiber.memoizedProps, candidates);
          }
        }
      }
    }

    let closestId = null;
    let closestDistance = Infinity;
    for (const candidate of candidates) {
      const timestamp = Number((BigInt(candidate) >> 22n) + TWITTER_EPOCH);
      const distance = Math.abs(timestamp - relativeTime.timestamp);
      if (distance < closestDistance) {
        closestId = candidate;
        closestDistance = distance;
      }
    }
    return closestDistance <= relativeTime.tolerance ? closestId : null;
  }

  function scan() {
    for (const item of document.querySelectorAll(ITEM_SELECTOR)) {
      const tweetId = extractTweetId(item);
      if (tweetId) item.dataset.unisignalTweetId = tweetId;
      else delete item.dataset.unisignalTweetId;
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
    if (target?.closest(TARGET_ROOT_SELECTOR)) return true;

    return changedNodes.some(
      (node) =>
        node instanceof Element &&
        (node.matches(TARGET_ROOT_SELECTOR) || node.querySelector(TARGET_ROOT_SELECTOR)),
    );
  }

  scheduleScan();
  new MutationObserver((mutations) => {
    if (mutations.some(mutationAffectsItems)) scheduleScan();
  }).observe(document.documentElement, {
    characterData: true,
    childList: true,
    subtree: true,
  });
})();
