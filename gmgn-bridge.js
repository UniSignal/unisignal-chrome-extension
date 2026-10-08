(() => {
  const pageParams = new URLSearchParams(location.search);
  const MONITOR_SELECTOR =
    pageParams.get("popout") === "true" && pageParams.get("target") === "xTracker"
      ? '[data-testid="x-tracker-root"]'
      : '[data-id="KEY_X_SNIPER_RND_V1"]';
  const GMGN_TOKEN_PATH = /^\/[a-z0-9_-]+\/token\/0x[0-9a-f]{40}$/i;
  const listeners = new Set();
  const wrappedFactories = new WeakSet();
  let messages = [];
  let signature = "[]";
  let usePinnedTweets;

  document.addEventListener("unisignal:navigate", () => {
    const path = document.documentElement.dataset.unisignalNavigate;
    delete document.documentElement.dataset.unisignalNavigate;
    if (!GMGN_TOKEN_PATH.test(path || "") || location.pathname === path) return;

    window.next.router.push(path);
  });

  document.addEventListener("unisignal:sync-messages", () => {
    const serialized = document.documentElement.dataset.unisignalMessages;
    delete document.documentElement.dataset.unisignalMessages;
    if (!serialized || serialized === signature) return;

    try {
      const next = JSON.parse(serialized);
      if (!Array.isArray(next) || !next.every((item) =>
        typeof item?.key === "string" && Number.isFinite(item.timestamp)
      )) return;
      messages = next;
      signature = serialized;
      for (const listener of listeners) listener();
    } catch {
      return;
    }
  });

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function mergeMessages(nativeItems, telegramMessages, isPinnedTweet) {
    const pinned = [];
    const items = [];
    nativeItems.forEach((item, index) => {
      const target = isPinnedTweet?.(item.id, item.tw_type) ? pinned : items;
      target.push({ item, index });
    });
    for (const message of telegramMessages) {
      items.push({ message });
    }
    items.sort((a, b) => {
      const first = a.message?.timestamp ?? Number(a.item.tw_timestamp);
      const second = b.message?.timestamp ?? Number(b.item.tw_timestamp);
      return second - first;
    });
    return pinned.concat(items);
  }

  function installListRenderer(exports, React) {
    if (!React) return;
    for (const component of Object.values(exports)) {
      const forwardRef = component?.type;
      if (typeof forwardRef?.render !== "function") continue;
      const originalRender = forwardRef.render;
      const OriginalList = React.forwardRef(originalRender);

      function PinAwareMixedList(props) {
        const { isPinnedTweet } = usePinnedTweets();
        return React.createElement(MixedList, { ...props, isPinnedTweet });
      }

      function MixedList({ nativeProps, nativeRef, isPinnedTweet }) {
        const host = React.useRef(null);
        const [inMonitor, setInMonitor] = React.useState(false);
        const [readingKeys, setReadingKeys] = React.useState(null);
        const snapshot = React.useSyncExternalStore(subscribe, () => messages, () => messages);
        React.useLayoutEffect(() => {
          setInMonitor(Boolean(host.current?.closest(MONITOR_SELECTOR)));
        }, []);
        React.useEffect(() => {
          if (snapshot.length === 0) setReadingKeys(null);
        }, [snapshot]);
        const onScroll = React.useCallback((event) => {
          const reading = event.currentTarget.scrollTop > 0;
          // 与原生推文一致：阅读中暂停新增，回到顶部再显示；编辑和删除仍立即生效。
          setReadingKeys((current) => reading
            ? current || new Set(snapshot.map((message) => message.key))
            : null);
          nativeProps.onScroll?.(event);
        }, [snapshot, nativeProps.onScroll]);
        const activeMessages = React.useMemo(() => inMonitor
          ? snapshot.filter((message) => !readingKeys || readingKeys.has(message.key))
          : [], [snapshot, inMonitor, readingKeys]);
        const rows = React.useMemo(
          () => mergeMessages(nativeProps.data, activeMessages, isPinnedTweet),
          [nativeProps.data, activeMessages, isPinnedTweet],
        );
        const mountCard = React.useCallback((element) => {
          if (element) element.dispatchEvent(new Event("unisignal:render-row", { bubbles: true }));
        }, []);
        const renderItem = React.useCallback((row) => {
          if (!row.message) return nativeProps.renderItem(row.item, row.index);
          return React.createElement("unisignal-telegram-feed", {
            "data-unisignal-key": row.message.key,
            ref: mountCard,
          });
        }, [nativeProps.renderItem, mountCard]);
        const itemKey = React.useCallback((row) => row.message
          ? `unisignal:${row.message.key}`
          : nativeProps.itemKey(row.item, row.index), [nativeProps.itemKey]);
        return React.createElement("div", {
          ref: host,
          style: { height: "100%", minHeight: 0 },
          "data-unisignal-mixed-active": activeMessages.length > 0 ? "" : undefined,
        }, React.createElement(OriginalList, {
          ...nativeProps,
          ref: nativeRef,
          onScroll: inMonitor ? onScroll : nativeProps.onScroll,
          ...(activeMessages.length > 0 ? { data: rows, renderItem, itemKey } : {}),
        }));
      }

      // 在首次挂载前包装组件，原组件仍独立持有自己的 hooks 和虚拟列表状态。
      forwardRef.render = function (props, ref) {
        const keySource = String(props.itemKey);
        const isTwitterList = keySource.includes("tw_timestamp") && keySource.includes("tw_type");
        return isTwitterList
          ? React.createElement(usePinnedTweets ? PinAwareMixedList : MixedList, { nativeProps: props, nativeRef: ref })
          : React.createElement(OriginalList, { ...props, ref });
      };
    }
  }

  function wrapChunk(chunk) {
    for (const [id, factory] of Object.entries(chunk?.[1] || {})) {
      if (typeof factory !== "function" || wrappedFactories.has(factory)) continue;
      const source = String(factory);
      const isListModule = source.includes("gmgn-vlist-item") && source.includes("renderItem");
      const isPinModule = source.includes("pinnedTweets:") && source.includes("sortTweetsWithPinned:");
      if (!isListModule && !isPinModule) continue;
      const wrapped = function (module, exports, require) {
        let React;
        const trackedRequire = new Proxy(require, {
          apply(target, thisArg, args) {
            const value = Reflect.apply(target, thisArg, args);
            if (value?.createElement && value?.useSyncExternalStore) React = value;
            return value;
          },
        });
        factory.call(this, module, exports, trackedRequire);
        if (isPinModule) {
          // 复用 GMGN 的置顶状态及到期/取消规则，不按时间或 DOM 外观猜测置顶。
          usePinnedTweets = Object.values(module.exports).find((value) =>
            typeof value === "function" && String(value).includes("pinnedTweets:") &&
            String(value).includes("sortTweetsWithPinned:")
          );
        }
        if (isListModule) installListRenderer(module.exports, React);
      };
      wrappedFactories.add(wrapped);
      chunk[1][id] = wrapped;
    }
  }

  // document_start 注册；同时处理首批脚本和切换路由后懒加载的模块。
  const chunks = window.webpackChunk_N_E = window.webpackChunk_N_E || [];
  for (const chunk of chunks) wrapChunk(chunk);
  let push = function (...entries) {
    for (const chunk of entries) wrapChunk(chunk);
    return Array.prototype.push.apply(this, entries);
  };
  Object.defineProperty(chunks, "push", {
    configurable: true,
    get: () => push,
    set(nextPush) {
      push = function (...entries) {
        for (const chunk of entries) wrapChunk(chunk);
        return nextPush.apply(this, entries);
      };
    },
  });

  function addEmptyListStyle() {
    const style = document.createElement("style");
    // GMGN 的空状态在列表外；只在该列表实际包含 Telegram 行时解除遮挡。
    style.textContent = `
      .absolute.inset-0:has(> [data-unisignal-mixed-active]) {
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      .absolute.inset-0:has(> [data-unisignal-mixed-active]) ~ [data-sentry-component="EmptyMessageView"] {
        display: none !important;
      }
    `;
    document.documentElement.append(style);
  }
  if (document.documentElement) addEmptyListStyle();
  else document.addEventListener("DOMContentLoaded", addEmptyListStyle, { once: true });
})();
