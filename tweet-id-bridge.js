(() => {
  const ITEM_SELECTOR =
    '[data-id="KEY_X_SNIPER_RND_V1"] [data-testid="virtuoso-item-list"] > [data-index]';
  const TWITTER_EPOCH = 1_288_834_974_657n;
  let scanTimer;

  function isTweetSnowflake(value) {
    if (typeof value !== "string" || !/^\d{15,20}$/.test(value)) return false;
    const timestamp = Number((BigInt(value) >> 22n) + TWITTER_EPOCH);
    return timestamp >= Number(TWITTER_EPOCH) && timestamp <= Date.now() + 86_400_000;
  }

  function findTweetId(value, context = "", depth = 0, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || value instanceof Node || depth > 6) return null;
    if (seen.has(value)) return null;
    seen.add(value);

    const entries = Object.entries(value);
    for (const [key, candidate] of entries) {
      if (
        typeof candidate === "string" &&
        (/^(tweet|status)_?id(?:_str)?$/i.test(key) ||
          (/tweet|status/i.test(context) && /^(id|id_str|rest_id)$/i.test(key))) &&
        isTweetSnowflake(candidate)
      ) {
        return candidate;
      }
    }

    const objectType = String(value.__typename || value.type || "");
    const restId = value.rest_id;
    if (/tweet/i.test(objectType) && isTweetSnowflake(restId)) return restId;

    const text = value.full_text ?? value.text ?? value.content;
    const createdAt = value.created_at ?? value.createdAt ?? value.publish_time;
    for (const key of ["id", "id_str", "rest_id"]) {
      if (typeof text === "string" && createdAt && isTweetSnowflake(value[key])) {
        return value[key];
      }
    }

    for (const [key, child] of entries) {
      const tweetId = findTweetId(child, `${context}.${key}`, depth + 1, seen);
      if (tweetId) return tweetId;
    }
    return null;
  }

  function extractTweetId(item) {
    for (const element of [item, ...item.querySelectorAll("*")]) {
      for (const key of Object.keys(element)) {
        if (key.startsWith("__reactProps$")) {
          const tweetId = findTweetId(element[key]);
          if (tweetId) return tweetId;
        }
        if (key.startsWith("__reactFiber$")) {
          let fiber = element[key];
          for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
            const tweetId = findTweetId(fiber.memoizedProps);
            if (tweetId) return tweetId;
          }
        }
      }
    }
    return null;
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

  scheduleScan();
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
