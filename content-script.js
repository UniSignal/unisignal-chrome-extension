const TARGET_ROOT_SELECTOR = '[data-id="KEY_X_SNIPER_RND_V1"]';
const TARGET_SELECTOR = `${TARGET_ROOT_SELECTOR} [data-testid="virtuoso-item-list"]`;
const MAX_MESSAGE_HISTORY = 100;
const ALLOWED_TAGS = new Set(["a", "blockquote", "code", "del", "em", "pre", "strong", "u"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tg:"]);
const CONTRACT_ADDRESS_PATTERN = /(?<![0-9a-f])0x[0-9a-f]{40}(?![0-9a-f])/i;
const GMGN_TOKEN_PATH_PATTERN =
  /^\/(bsc|eth|base)\/token\/(?:[^/]*_)?(0x[0-9a-f]{40})(?:\/|$)/i;

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
  .title { margin-bottom: 6px; color: #65d6c4; font-size: 14px; font-weight: 700; }
  .edited { margin-left: 6px; color: #7f8896; font-size: 12px; font-weight: 400; }
  .text { color: #e1e6ed; font-size: 15px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .text a { color: #57bfff; }
  .text [data-gmgn-contract] { cursor: pointer; }
  .text code { padding: 1px 4px; border-radius: 4px; background: rgb(255 255 255 / 8%); color: #aee8d8; font-family: "SFMono-Regular", Consolas, monospace; }
  .text pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: rgb(0 0 0 / 28%); white-space: pre-wrap; }
  .text pre code { padding: 0; background: transparent; }
  .text blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 3px solid #4f9189; color: #b4bdca; }
  .footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 5px; }
  .action { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border: 1px solid rgb(127 136 150 / 45%); border-radius: 6px; background: rgb(255 255 255 / 5%); color: #cbd3dd; font-family: inherit; font-size: 12px; font-weight: 500; line-height: 1.4; text-decoration: none; cursor: pointer; }
  .action-icon { width: 18px; height: 18px; flex: none; }
  .action:hover { border-color: #65d6c4; color: #f3f5f8; }
  .telegram { color: #57bfff; }
  time { flex: none; color: #7f8896; font-size: 12px; text-align: right; }
`;
const MESSAGE_STYLE_SHEET = new CSSStyleSheet();
MESSAGE_STYLE_SHEET.replaceSync(MESSAGE_CSS);

const DISPLAY_CONTROL_CSS = `
  :host {
    all: initial;
    position: fixed;
    top: 88px;
    right: 16px;
    z-index: 2147483647;
    color: #f3f5f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  :host([data-mode="floating"]) {
    width: var(--floating-width, min(400px, calc(100vw - 32px)));
    height: var(--floating-height, min(760px, calc(100vh - 104px)));
    min-width: 280px;
    min-height: 160px;
    max-width: 100vw;
    max-height: 100vh;
  }
  * { box-sizing: border-box; }
  .window {
    position: relative;
    display: flex;
    height: 100%;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgb(101 214 196 / 38%);
    border-radius: 10px;
    background: rgb(12 20 23 / 96%);
    box-shadow: 0 10px 30px rgb(0 0 0 / 38%);
  }
  .toolbar { display: flex; flex: none; align-items: center; gap: 10px; padding: 7px 8px; cursor: grab; touch-action: none; }
  .toolbar.dragging { cursor: grabbing; user-select: none; }
  .label { color: #65d6c4; font-size: 14px; font-weight: 700; }
  .modes { display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: rgb(255 255 255 / 7%); }
  button {
    padding: 6px 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #9aa4b2;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    cursor: pointer;
  }
  button:hover { color: #f3f5f8; }
  button[aria-pressed="true"] { background: #285f58; color: #f3f5f8; }
  .messages { min-height: 0; flex: 1; overflow-y: auto; border-top: 1px solid rgb(127 136 150 / 18%); }
  :host([data-mode="mixed"]) .messages { display: none; }
  .empty { padding: 18px; color: #7f8896; font-size: 14px; text-align: center; }
  .resize-handle {
    display: none;
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    touch-action: none;
    background: linear-gradient(135deg, transparent 55%, #65d6c4 55%);
  }
  :host([data-mode="floating"]) .resize-handle { display: block; }
`;
const DISPLAY_CONTROL_STYLE_SHEET = new CSSStyleSheet();
DISPLAY_CONTROL_STYLE_SHEET.replaceSync(DISPLAY_CONTROL_CSS);

let messageHistory = [];
let renderTimer;
let reconnectTimer;
let workerPort;
let lastRenderSignature = "";
let lastFloatingSignature = "";
let activeTargetList;
let displayMode = "mixed";
let displayControl;
let floatingMessages;
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

function deleteMessage(channelId, messageId) {
  messageHistory = messageHistory.filter(
    (item) => item.channel_id !== channelId || item.message_id !== messageId,
  );
}

function isAllowedLink(href) {
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

function getGmgnNotificationVolume() {
  try {
    const chain =
      new URLSearchParams(location.search).get("chain") || location.pathname.split("/")[1];
    const volume = JSON.parse(localStorage.getItem("soundConfig"))?.[chain]?.notificationVolume;
    return Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 100) / 100 : 0.5;
  } catch {
    return 0.5;
  }
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
  const gmgnContracts = new Map();

  for (const link of container.querySelectorAll("a")) {
    const url = new URL(link.href);
    const match = url.hostname === "gmgn.ai" && url.pathname.match(GMGN_TOKEN_PATH_PATTERN);
    if (!match) continue;

    const [, chain, address] = match;
    gmgnContracts.set(address.toLowerCase(), chain.toLowerCase());
  }

  for (const element of container.querySelectorAll("code")) {
    const address = element.textContent.match(CONTRACT_ADDRESS_PATTERN)?.[0];
    if (!address) continue;

    const normalizedAddress = address.toLowerCase();
    const chain = gmgnContracts.get(normalizedAddress);
    if (!chain) continue;

    element.dataset.gmgnContract = normalizedAddress;
    element.dataset.gmgnChain = chain;
  }

  return [...gmgnContracts].map(([address, chain]) => ({ chain, address }));
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

function setDisplayMode(mode) {
  if (mode === displayMode) return;
  displayMode = mode;
  lastRenderSignature = "";
  lastFloatingSignature = "";
  scheduleRender();
}

function makeDisplayControlInteractive(handle, resize = false) {
  let start;

  function stop(event) {
    if (!start || event.pointerId !== start.pointerId) return;
    start = undefined;
    handle.classList.remove("dragging");
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;

    start = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: displayControl.getBoundingClientRect(),
    };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging");
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!start || event.pointerId !== start.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (resize) {
      const width = Math.min(Math.max(start.rect.width + deltaX, 280), window.innerWidth - start.rect.left);
      const height = Math.min(Math.max(start.rect.height + deltaY, 160), window.innerHeight - start.rect.top);
      displayControl.style.setProperty("--floating-width", `${width}px`);
      displayControl.style.setProperty("--floating-height", `${height}px`);
    } else {
      const left = Math.min(Math.max(start.rect.left + deltaX, 0), window.innerWidth - start.rect.width);
      const top = Math.min(Math.max(start.rect.top + deltaY, 0), window.innerHeight - start.rect.height);
      displayControl.style.left = `${left}px`;
      displayControl.style.top = `${top}px`;
      displayControl.style.right = "auto";
    }
  });

  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);
}

function clampDisplayControlToViewport() {
  if (!displayControl?.isConnected) return;

  const rect = displayControl.getBoundingClientRect();
  const left = Math.min(Math.max(rect.left, 0), Math.max(0, window.innerWidth - rect.width));
  const top = Math.min(Math.max(rect.top, 0), Math.max(0, window.innerHeight - rect.height));
  if (left === rect.left && top === rect.top) return;

  displayControl.style.left = `${left}px`;
  displayControl.style.top = `${top}px`;
  displayControl.style.right = "auto";
}

function ensureDisplayControl() {
  if (displayControl) {
    if (!displayControl.isConnected) document.documentElement.append(displayControl);
    return;
  }

  displayControl = document.createElement("unisignal-display-control");
  displayControl.dataset.mode = displayMode;
  const shadow = displayControl.attachShadow({ mode: "open" });
  shadow.adoptedStyleSheets = [DISPLAY_CONTROL_STYLE_SHEET];
  shadow.innerHTML = `
    <div class="window">
      <div class="toolbar">
        <span class="label">UniSignal</span>
        <div class="modes">
          <button type="button" data-mode="mixed">混排</button>
          <button type="button" data-mode="floating">悬浮</button>
        </div>
      </div>
      <div class="messages"></div>
      <div class="resize-handle"></div>
    </div>
  `;
  floatingMessages = shadow.querySelector(".messages");
  shadow.addEventListener("click", (event) => {
    const mode = event.target.closest("button")?.dataset.mode;
    if (mode) setDisplayMode(mode);
  });
  makeDisplayControlInteractive(shadow.querySelector(".toolbar"));
  makeDisplayControlInteractive(shadow.querySelector(".resize-handle"), true);
  document.documentElement.append(displayControl);
}

function updateDisplayControl() {
  ensureDisplayControl();
  displayControl.dataset.mode = displayMode;
  for (const button of displayControl.shadowRoot.querySelectorAll("button[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === displayMode));
  }
}

function renderFloatingFeed() {
  const messages = [...messageHistory].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const signature = JSON.stringify(messages);
  if (signature === lastFloatingSignature) return;

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "暂无消息";
    floatingMessages.replaceChildren(empty);
  } else {
    floatingMessages.replaceChildren(createMessageGroup(messages));
  }
  lastFloatingSignature = signature;
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

function findActiveTargetList() {
  const lists = [...document.querySelectorAll(TARGET_SELECTOR)];
  const activeList = lists.find((list) => {
    const rect = list.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  for (const list of lists) {
    if (list === activeList) continue;
    for (const group of list.querySelectorAll("unisignal-telegram-feed")) group.remove();
  }

  if (activeList !== activeTargetList) {
    activeTargetList = activeList;
    lastRenderSignature = "";
  }
  return activeList;
}

function renderMixedFeed(targetList) {
  const tweets = getVisibleTweets(targetList);
  if (tweets.length === 0) return;

  const buckets = buildBuckets(tweets);
  const signature = JSON.stringify({
    messages: messageHistory.map(({ type, date, html }) => [type, date, html]),
    tweets: tweets.map(({ index, timestamp }) => [index, timestamp]),
  });
  const existingGroups = targetList.querySelectorAll("unisignal-telegram-feed");
  if (signature === lastRenderSignature && existingGroups.length === buckets.size) return;

  for (const group of existingGroups) group.remove();
  for (const [anchor, messages] of buckets) {
    anchor.item.before(createMessageGroup(messages));
  }
  lastRenderSignature = signature;
}

function renderActiveMode() {
  const targetList = findActiveTargetList();
  if (!targetList) {
    displayControl?.remove();
    return;
  }

  updateDisplayControl();
  if (displayMode === "floating") {
    for (const group of targetList.querySelectorAll("unisignal-telegram-feed")) group.remove();
    renderFloatingFeed();
  } else {
    floatingMessages.replaceChildren();
    renderMixedFeed(targetList);
  }
  requestAnimationFrame(clampDisplayControlToViewport);
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderActiveMode, 100);
}

function handleWorkerMessage(message) {
  if (message.type === "snapshot") {
    messageHistory = message.messageHistory.slice(-MAX_MESSAGE_HISTORY);
    scheduleRender();
  } else if (message.type === "telegram-message") {
    upsertMessage(message.message);
    scheduleRender();
    if (message.message.type !== "telegram_message_edited") {
      notificationAudio.volume = getGmgnNotificationVolume();
      notificationAudio.currentTime = 0;
      notificationAudio.play().catch(() => { });
    }
  } else if (message.type === "telegram-message-deleted") {
    deleteMessage(message.channelId, message.messageId);
    scheduleRender();
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

window.addEventListener("resize", clampDisplayControlToViewport);
