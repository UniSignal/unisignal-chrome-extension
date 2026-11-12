(() => {
  const TOKEN_PATH = /^\/token\/[a-z0-9_-]+\/0x[0-9a-f]{40}$/i;
  const isBinance = location.hostname === "web3.binance.com";

  document.addEventListener("unisignal:navigate", () => {
    const path = document.documentElement.dataset.unisignalNavigate;
    delete document.documentElement.dataset.unisignalNavigate;
    if (!TOKEN_PATH.test(path || "") || location.pathname === path) return;

    // Reuse the site's router so navigation preserves the page and feed.
    const link = document.querySelector('a[href^="/"]');
    const fiberKey = link && Object.keys(link).find((key) => key.startsWith("__reactFiber$"));
    for (let fiber = link?.[fiberKey]; fiber; fiber = fiber.return) {
      const value = fiber.memoizedProps?.value;
      const navigator = isBinance ? value?.router : value?.navigator;
      if (typeof navigator?.push === "function") {
        // Binance's router adds its locale basename; passing it again breaks routing.
        if (isBinance && location.pathname === `${navigator.basename || ""}${path}`) return;
        navigator.push(path);
        return;
      }
    }
    console.warn(`UniSignal: ${location.hostname} 路由尚未就绪，无法打开代币页面`);
  });
})();
