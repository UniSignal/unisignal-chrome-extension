const TARGET_ROOT_SELECTOR = '[data-id="KEY_X_SNIPER_RND_V1"]';
const TARGET_SELECTOR = `${TARGET_ROOT_SELECTOR} [data-testid="virtuoso-item-list"]`;
const MAX_MESSAGE_HISTORY = 100;
const ALLOWED_TAGS = new Set(["a", "blockquote", "code", "del", "em", "pre", "strong", "u"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tg:"]);
const CONTRACT_ADDRESS_PATTERN = /(?<![0-9a-f])0x[0-9a-f]{40}(?![0-9a-f])/i;
const EXPLORER_CHAINS = { "bscscan.com": "bsc", "etherscan.io": "eth", "basescan.org": "base" };

const MESSAGE_CSS = `
  :host {
    display: block;
    padding: 8px;
    color: #f3f5f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  article {
    padding: 10px;
    border: 1px solid rgb(101 214 196 / 32%);
    border-radius: 8px;
    background: rgb(16 28 31 / 96%);
  }
  article + article { margin-top: 7px; }
  .title { margin-bottom: 6px; color: #65d6c4; font-size: 12px; font-weight: 700; }
  .edited { margin-left: 6px; color: #7f8896; font-size: 10px; font-weight: 400; }
  .text { color: #e1e6ed; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .text a { color: #57bfff; }
  .text [data-gmgn-contract] { cursor: pointer; }
  .text code { padding: 1px 4px; border-radius: 4px; background: rgb(255 255 255 / 8%); color: #aee8d8; font-family: "SFMono-Regular", Consolas, monospace; }
  .text pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: rgb(0 0 0 / 28%); white-space: pre-wrap; }
  .text pre code { padding: 0; background: transparent; }
  .text blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 3px solid #4f9189; color: #b4bdca; }
  .footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 5px; }
  .action { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid rgb(127 136 150 / 45%); border-radius: 6px; background: rgb(255 255 255 / 5%); color: #cbd3dd; font-family: inherit; font-size: 10px; font-weight: 500; line-height: 1.4; text-decoration: none; cursor: pointer; }
  .action-icon { width: 14px; height: 14px; flex: none; }
  .action:hover { border-color: #65d6c4; color: #f3f5f8; }
  .telegram { color: #57bfff; }
  time { flex: none; color: #7f8896; font-size: 10px; text-align: right; }
`;
const MESSAGE_STYLE_SHEET = new CSSStyleSheet();
MESSAGE_STYLE_SHEET.replaceSync(MESSAGE_CSS);

let messageHistory = [];
let renderTimer;
let reconnectTimer;
let workerPort;
const lastRenderSignatures = new WeakMap();
const notificationAudio = new Audio(chrome.runtime.getURL("notification-sound.mp3"));

function upsertMessage(message) {
  const hasIdentity =
    Number.isInteger(message.channel_id) && Number.isInteger(message.message_id);
  const existingIndex = hasIdentity
    ? messageHistory.findIndex(
      (item) =>
        item.channel_id === message.channel_id && item.message_id === message.message_id,
    )
    : -1;
  if (existingIndex === -1) {
    messageHistory.push(message);
  } else {
    messageHistory[existingIndex] = message;
  }
  messageHistory = messageHistory.slice(-MAX_MESSAGE_HISTORY);
}

function isAllowedLink(href) {
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

function configureContractLink(link, chain, address) {
  link.href = `${location.origin}/${chain}/token/${address.toLowerCase()}`;
  link.target = "_self";
  link.rel = "";
}

function appendSanitizedHtml(container, html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  function appendNodes(source, target) {
    for (const node of source.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        target.append(document.createTextNode(node.textContent));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const tagName = node.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tagName)) {
        appendNodes(node, target);
        continue;
      }

      if (tagName === "a") {
        const href = node.getAttribute("href");
        if (!href || !isAllowedLink(href)) {
          appendNodes(node, target);
          continue;
        }
      }

      const element = document.createElement(tagName);
      if (tagName === "a") {
        element.href = node.getAttribute("href");
        element.target = "_blank";
        element.rel = "noopener noreferrer";
      }
      if (tagName === "code" && /^language-[\w+-]+$/.test(node.className)) {
        element.className = node.className;
      }
      appendNodes(node, element);
      target.append(element);
    }
  }

  appendNodes(template.content, container);
}

function markContractTargets(container) {
  const chain = Object.entries(EXPLORER_CHAINS).find(([explorer]) =>
    container.querySelector(`a[href*="${explorer}" i]`),
  )?.[1];
  if (!chain) return [];

  const contracts = new Map();

  for (const element of container.querySelectorAll("a, code")) {
    const address = `${element.getAttribute("href") || ""} ${element.textContent}`.match(
      CONTRACT_ADDRESS_PATTERN,
    )?.[0];
    if (!address) continue;

    const normalizedAddress = address.toLowerCase();
    element.dataset.gmgnContract = normalizedAddress;
    element.dataset.gmgnChain = chain;
    if (element.tagName === "A") configureContractLink(element, chain, address);
    contracts.set(normalizedAddress, { chain, address: normalizedAddress });
  }

  return [...contracts.values()];
}

function createMessageActions(data, contracts) {
  const actions = document.createElement("div");
  actions.className = "actions";

  function createIcon(filename) {
    const icon = document.createElement("img");
    icon.className = "action-icon";
    icon.src = chrome.runtime.getURL(`icons/${filename}`);
    icon.alt = "";
    return icon;
  }

  if (Number.isInteger(data.channel_id) && Number.isInteger(data.message_id)) {
    const telegram = document.createElement("a");
    telegram.className = "action telegram";
    telegram.href = `https://t.me/c/${data.channel_id}/${data.message_id}`;
    telegram.target = "_blank";
    telegram.rel = "noopener noreferrer";
    telegram.append(createIcon("Telegram_logo.svg"), "Telegram 原消息");
    actions.append(telegram);
  }

  for (const { chain, address } of contracts) {
    const button = document.createElement("button");
    button.className = "action";
    button.type = "button";
    button.dataset.gmgnContract = address;
    button.dataset.gmgnChain = chain;
    button.title = address;
    button.append(createIcon("GMGN_logo.svg"), `CA ${address.slice(0, 6)}…${address.slice(-4)}`);
    actions.append(button);
  }

  return actions;
}

function createMessageGroup(messages) {
  const host = document.createElement("unisignal-telegram-feed");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.adoptedStyleSheets = [MESSAGE_STYLE_SHEET];
  shadow.addEventListener("click", (event) => {
    const target = event
      .composedPath()
      .find((node) => node instanceof HTMLElement && node.dataset.gmgnContract);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    document.documentElement.dataset.unisignalNavigate =
      `/${target.dataset.gmgnChain}/token/${target.dataset.gmgnContract}`;
    document.dispatchEvent(new Event("unisignal:navigate"));
  });

  for (const data of messages) {
    const article = document.createElement("article");
    const title = document.createElement("div");
    const text = document.createElement("div");
    const footer = document.createElement("div");
    const time = document.createElement("time");
    title.className = "title";
    title.textContent = "聚合监控";
    text.className = "text";
    appendSanitizedHtml(text, data.html);
    const contracts = markContractTargets(text);
    footer.className = "footer";
    footer.append(createMessageActions(data, contracts), time);
    time.textContent = new Date(data.date).toLocaleString("zh-CN", { hour12: false });
    if (data.type === "telegram_message_edited") {
      const edited = document.createElement("span");
      edited.className = "edited";
      edited.textContent = "已编辑";
      title.append(edited);
    }
    article.append(title, text, footer);
    shadow.append(article);
  }
  return host;
}

function getVisibleTweets(targetList) {
  return [...targetList.querySelectorAll(":scope > [data-index]")]
    .map((wrapper) => {
      return {
        index: Number(wrapper.dataset.index),
        item: wrapper.querySelector(":scope > .gmgn-vlist-item"),
        timestamp: Number(wrapper.dataset.unisignalTimestamp),
      };
    })
    .filter(({ item, timestamp }) => item && Number.isFinite(timestamp) && timestamp > 0)
    .sort((a, b) => a.index - b.index);
}

function buildBuckets(tweets) {
  const buckets = new Map();
  const messages = [...messageHistory].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  for (const message of messages) {
    const timestamp = Date.parse(message.date);
    if (Number.isNaN(timestamp)) continue;

    let anchor;
    if (timestamp > tweets[0].timestamp) {
      if (tweets[0].index !== 0) continue;
      anchor = tweets[0];
    } else {
      anchor = tweets.slice(1).find((tweet) => timestamp > tweet.timestamp);
    }
    if (!anchor) continue;

    if (!buckets.has(anchor)) buckets.set(anchor, []);
    buckets.get(anchor).push(message);
  }
  return buckets;
}

function findVisibleTargetLists() {
  const lists = [...document.querySelectorAll(TARGET_SELECTOR)];
  const visibleLists = lists.filter((list) => {
    const rect = list.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  for (const list of lists) {
    if (visibleLists.includes(list)) continue;
    for (const group of list.querySelectorAll("unisignal-telegram-feed")) group.remove();
    lastRenderSignatures.delete(list);
  }
  return visibleLists;
}

function renderMixedFeed() {
  const targetLists = findVisibleTargetLists();

  for (const targetList of targetLists) {
    const tweets = getVisibleTweets(targetList);
    if (tweets.length === 0) continue;

    const buckets = buildBuckets(tweets);
    const signature = JSON.stringify({
      messages: messageHistory.map(({ type, date, html }) => [type, date, html]),
      tweets: tweets.map(({ index, timestamp }) => [index, timestamp]),
    });
    const existingGroups = targetList.querySelectorAll("unisignal-telegram-feed");
    if (
      signature === lastRenderSignatures.get(targetList) &&
      existingGroups.length === buckets.size
    ) {
      continue;
    }

    for (const group of existingGroups) group.remove();
    for (const [anchor, messages] of buckets) {
      anchor.item.before(createMessageGroup(messages));
    }
    lastRenderSignatures.set(targetList, signature);
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderMixedFeed, 100);
}

function handleWorkerMessage(message) {
  if (message.type === "snapshot") {
    messageHistory = message.messageHistory.slice(-MAX_MESSAGE_HISTORY);
    scheduleRender();
  } else if (message.type === "telegram-message") {
    upsertMessage(message.message);
    scheduleRender();
    if (message.message.type !== "telegram_message_edited") {
      notificationAudio.currentTime = 0;
      notificationAudio.play().catch(() => { });
    }
  }
}

function connectToWorker() {
  clearTimeout(reconnectTimer);
  try {
    if (!chrome.runtime.id) return;
    workerPort = chrome.runtime.connect({ name: "gmgn-feed" });
  } catch {
    return;
  }
  workerPort.onMessage.addListener(handleWorkerMessage);
  workerPort.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    workerPort = null;
    reconnectTimer = setTimeout(connectToWorker, 1_000);
  });
}

connectToWorker();
scheduleRender();

function mutationAffectsFeed(mutation) {
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

new MutationObserver((mutations) => {
  if (mutations.some(mutationAffectsFeed)) scheduleRender();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-unisignal-timestamp"],
  childList: true,
  subtree: true,
});
