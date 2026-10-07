const PAGE_PARAMS = new URLSearchParams(location.search);
const TARGET_ROOT_SELECTOR =
  PAGE_PARAMS.get("popout") === "true" && PAGE_PARAMS.get("target") === "xTracker"
    ? '[data-testid="x-tracker-root"]'
    : '[data-id="KEY_X_SNIPER_RND_V1"]';
const MAX_MESSAGE_HISTORY = 100;
const DEFAULT_MESSAGE_FONT_SIZE = 15;
const MIN_MESSAGE_FONT_SIZE = 12;
const MAX_MESSAGE_FONT_SIZE = 20;
const DEFAULT_NOTIFICATION_VOLUME = 50;
const MAIN_CHANNEL_ID = 3912057240;
const UNISIGNAL_SOUND_URL = chrome.runtime.getURL("notification-sound.mp3");
const UNISIGNAL_ICON_URL = chrome.runtime.getURL("icons/icon32.png");
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
  .title { margin-bottom: 6px; color: #65d6c4; font-size: calc(var(--message-font-size, 15px) - 1px); font-weight: 700; }
  .edited { margin-left: 6px; color: #7f8896; font-size: calc(var(--message-font-size, 15px) - 3px); font-weight: 400; }
  .text { color: #e1e6ed; font-size: var(--message-font-size, 15px); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .text a { color: #57bfff; }
  .text [data-gmgn-contract] { cursor: pointer; }
  .text code { padding: 1px 4px; border-radius: 4px; background: rgb(255 255 255 / 8%); color: #aee8d8; font-family: "SFMono-Regular", Consolas, monospace; }
  .text pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: rgb(0 0 0 / 28%); white-space: pre-wrap; }
  .text pre code { padding: 0; background: transparent; }
  .text blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 3px solid #4f9189; color: #b4bdca; }
  .footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 5px; }
  .action { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border: 1px solid rgb(127 136 150 / 45%); border-radius: 6px; background: rgb(255 255 255 / 5%); color: #cbd3dd; font-family: inherit; font-size: calc(var(--message-font-size, 15px) - 3px); font-weight: 500; line-height: 1.4; text-decoration: none; cursor: pointer; }
  .action-icon { width: 18px; height: 18px; flex: none; }
  .action:hover { border-color: #65d6c4; color: #f3f5f8; }
  .telegram { color: #57bfff; }
  time { flex: none; color: #7f8896; font-size: calc(var(--message-font-size, 15px) - 3px); text-align: right; }
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
    width: var(--floating-width, min(400px, calc(100vw - 32px)));
    height: var(--floating-height, min(760px, calc(100vh - 104px)));
    min-width: 280px;
    min-height: 160px;
    max-width: 100vw;
    max-height: 100vh;
    color: #f3f5f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  .window {
    position: relative;
    display: flex;
    height: 100%;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 10px;
    background: #121212;
    box-shadow: 0 16px 48px rgb(0 0 0 / 52%);
  }
  .toolbar { display: flex; flex: none; align-items: center; justify-content: space-between; padding: 7px 8px; background: #1f1f1f; cursor: grab; touch-action: none; }
  .toolbar.dragging { cursor: grabbing; user-select: none; }
  .brand-icon { width: 16px; height: 16px; }
  .close-button { display: flex; width: 22px; height: 22px; padding: 0; align-items: center; justify-content: center; border: 0; border-radius: 5px; background: transparent; color: #808080; font-family: inherit; font-size: 18px; line-height: 1; cursor: pointer; }
  .close-button:hover { background: #242424; color: #f5f5f5; }
  .messages { min-height: 0; flex: 1; overflow-y: auto; border-top: 1px solid rgb(255 255 255 / 16%); scrollbar-color: #525252 transparent; scrollbar-width: thin; }
  .messages::-webkit-scrollbar { width: 6px; }
  .messages::-webkit-scrollbar-thumb { border-radius: 999px; background: #525252; }
  .empty { padding: 18px; color: #808080; font-size: 14px; text-align: center; }
  .resize-handle {
    display: block;
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    touch-action: none;
    background: linear-gradient(135deg, transparent 55%, #46b87d 55%);
  }
`;
const DISPLAY_CONTROL_STYLE_SHEET = new CSSStyleSheet();
DISPLAY_CONTROL_STYLE_SHEET.replaceSync(DISPLAY_CONTROL_CSS);

let messageHistory = [];
let renderTimer;
let reconnectTimer;
let workerPort;
let lastInjectedSignature = "";
let mixedMessagesDirty = true;
let mixedMessagesSignature = "";
const mixedRowSignatures = new WeakMap();
let lastFloatingSignature = "";
let displayMode = "mixed";
let displayControl;
let floatingMessages;
let soundEnabled = true;
let notificationVolume = DEFAULT_NOTIFICATION_VOLUME;
let messageFontSize = DEFAULT_MESSAGE_FONT_SIZE;
let optionalChannelNames = new Map();
let enabledChannelIds = new Set();
const notificationAudio = new Audio(UNISIGNAL_SOUND_URL);

function normalizeMessageFontSize(value) {
  const fontSize = Number(value);
  if (!Number.isFinite(fontSize)) return DEFAULT_MESSAGE_FONT_SIZE;
  return Math.min(Math.max(fontSize, MIN_MESSAGE_FONT_SIZE), MAX_MESSAGE_FONT_SIZE);
}

function normalizeNotificationVolume(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return DEFAULT_NOTIFICATION_VOLUME;
  return Math.min(Math.max(volume, 0), 100);
}

function applyMessageFontSize() {
  for (const host of document.querySelectorAll("unisignal-telegram-feed")) {
    host.style.setProperty("--message-font-size", `${messageFontSize}px`);
  }
  const floatingHost = floatingMessages?.querySelector("unisignal-telegram-feed");
  if (floatingHost) {
    floatingHost.style.setProperty("--message-font-size", `${messageFontSize}px`);
  }
}

function shouldDisplayMessage(message) {
  if (!Number.isInteger(message.channel_id) || message.channel_id === MAIN_CHANNEL_ID) {
    return true;
  }
  return optionalChannelNames.has(message.channel_id) && enabledChannelIds.has(message.channel_id);
}

function getMessageTitle(message) {
  if (!Number.isInteger(message.channel_id) || message.channel_id === MAIN_CHANNEL_ID) {
    return "聚合监控";
  }
  return optionalChannelNames.get(message.channel_id) || "频道消息";
}

function setOptionalChannels(channels) {
  optionalChannelNames = new Map(
    (Array.isArray(channels) ? channels : [])
      .filter((channel) => Number.isInteger(channel?.id) && typeof channel?.name === "string")
      .map((channel) => [channel.id, channel.name]),
  );
  mixedMessagesDirty = true;
  scheduleRender(0);
}

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

function getNotificationSound(message) {
  if (!Number.isInteger(message.channel_id) || message.channel_id === MAIN_CHANNEL_ID) {
    return {
      url: UNISIGNAL_SOUND_URL,
      volume: notificationVolume / 100,
    };
  }

  try {
    const chain =
      new URLSearchParams(location.search).get("chain") || location.pathname.split("/")[1];
    const config = JSON.parse(localStorage.getItem("soundConfig"))?.[chain];
    if (!config?.xMonitorState || !config.xMonitorType || config.xMonitorType === "Off") {
      return null;
    }
    const volume = Number(config.notificationVolume);
    return {
      url: new URL(
        `/static/sounds/${encodeURIComponent(config.xMonitorType)}.mp3`,
        location.origin,
      ).href,
      volume: Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 100) / 100 : 0.5,
    };
  } catch {
    return null;
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
    link.dataset.gmgnContract = address.toLowerCase();
    link.dataset.gmgnChain = chain.toLowerCase();
  }

  for (const match of container.textContent.matchAll(/https?:\/\/gmgn\.ai\/[^\s<>"'`]+/gi)) {
    const href = match[0].replace(/[.,;:!?，。；：！？、）)\]】}]+$/u, "");
    const token = new URL(href).pathname.match(GMGN_TOKEN_PATH_PATTERN);
    if (token) gmgnContracts.set(token[2].toLowerCase(), token[1].toLowerCase());
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

function createMessageGroup(messages, host = document.createElement("unisignal-telegram-feed")) {
  host.style.setProperty("--message-font-size", `${messageFontSize}px`);
  const hasShadow = Boolean(host.shadowRoot);
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  shadow.adoptedStyleSheets = [MESSAGE_STYLE_SHEET];
  shadow.replaceChildren();
  if (!hasShadow) shadow.addEventListener("click", (event) => {
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
    article.dataset.messageKey = getMessageKey(data);
    const title = document.createElement("div");
    const text = document.createElement("div");
    const footer = document.createElement("div");
    const time = document.createElement("time");
    title.className = "title";
    title.textContent = getMessageTitle(data);
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

function getMessageKey(message) {
  if (Number.isInteger(message.channel_id) && Number.isInteger(message.message_id)) {
    return `${message.channel_id}:${message.message_id}`;
  }

  let hash = 0;
  for (const character of `${message.date}\n${message.html}`) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  }
  return `legacy:${hash >>> 0}`;
}

function renderMixedRow(host) {
  const key = host.dataset.unisignalKey;
  const message = messageHistory.find((item) => getMessageKey(item) === key);
  if (!message || !shouldDisplayMessage(message)) return;
  const signature = JSON.stringify([message, getMessageTitle(message)]);
  if (mixedRowSignatures.get(host) === signature) return;

  createMessageGroup([message], host);
  mixedRowSignatures.set(host, signature);
}

document.addEventListener("unisignal:render-row", (event) => {
  if (event.target instanceof HTMLElement && event.target.matches("unisignal-telegram-feed")) {
    renderMixedRow(event.target);
  }
});

function syncMixedMessages() {
  if (mixedMessagesDirty) {
    mixedMessagesSignature = JSON.stringify(messageHistory
      .filter(shouldDisplayMessage)
      .map((message) => ({ key: getMessageKey(message), timestamp: Date.parse(message.date) }))
      .filter((message) => Number.isFinite(message.timestamp)));
    for (const host of document.querySelectorAll("unisignal-telegram-feed[data-unisignal-key]")) {
      renderMixedRow(host);
    }
    mixedMessagesDirty = false;
  }
  const signature = displayMode === "mixed" ? mixedMessagesSignature : "[]";
  if (signature === lastInjectedSignature) return;

  document.documentElement.dataset.unisignalMessages = signature;
  document.dispatchEvent(new Event("unisignal:sync-messages"));
  lastInjectedSignature = signature;
}

function setDisplayMode(mode) {
  if (mode === displayMode) return;
  displayMode = mode;
  lastInjectedSignature = "";
  lastFloatingSignature = "";
  scheduleRender(0);
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
    if (resize) {
      displayControl.style.left = `${start.rect.left}px`;
      displayControl.style.top = `${start.rect.top}px`;
      displayControl.style.right = "auto";
    }
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
  const shadow = displayControl.attachShadow({ mode: "open" });
  shadow.adoptedStyleSheets = [DISPLAY_CONTROL_STYLE_SHEET];
  shadow.innerHTML = `
    <div class="window">
      <div class="toolbar">
        <img class="brand-icon" src="${UNISIGNAL_ICON_URL}" alt="" />
        <button class="close-button" type="button" aria-label="关闭悬浮窗并切换为混排">×</button>
      </div>
      <div class="messages"></div>
      <div class="resize-handle"></div>
    </div>
  `;
  floatingMessages = shadow.querySelector(".messages");
  shadow.querySelector(".close-button").addEventListener("click", () => {
    setDisplayMode("mixed");
  });
  makeDisplayControlInteractive(shadow.querySelector(".toolbar"));
  makeDisplayControlInteractive(shadow.querySelector(".resize-handle"), true);
  document.documentElement.append(displayControl);
}

function renderFloatingFeed() {
  const messages = messageHistory
    .filter(shouldDisplayMessage)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const signature = JSON.stringify(messages);
  if (signature === lastFloatingSignature) return;

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "暂无消息";
    floatingMessages.replaceChildren(empty);
  } else {
    const group = createMessageGroup(messages);
    const articles = new Map(
      [...group.shadowRoot.querySelectorAll("article")]
        .map((article) => [article.dataset.messageKey, article]),
    );
    const atTop = floatingMessages.scrollTop === 0;
    let anchor;
    let anchorTop;
    if (!atTop) {
      const viewportTop = floatingMessages.getBoundingClientRect().top;
      const previousArticles = floatingMessages
        .querySelector("unisignal-telegram-feed")?.shadowRoot.querySelectorAll("article") || [];
      for (const article of previousArticles) {
        const rect = article.getBoundingClientRect();
        if (rect.bottom <= viewportTop || !articles.has(article.dataset.messageKey)) continue;
        anchor = articles.get(article.dataset.messageKey);
        anchorTop = rect.top;
        break;
      }
    }
    floatingMessages.replaceChildren(group);
    if (atTop) {
      floatingMessages.scrollTop = 0;
    } else if (anchor) {
      floatingMessages.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
    }
  }
  lastFloatingSignature = signature;
}

function renderActiveMode() {
  syncMixedMessages();
  if (!document.querySelector(TARGET_ROOT_SELECTOR)) {
    displayControl?.remove();
    return;
  }

  if (displayMode === "floating") {
    ensureDisplayControl();
    renderFloatingFeed();
  } else {
    displayControl?.remove();
    floatingMessages?.replaceChildren();
  }
  requestAnimationFrame(clampDisplayControlToViewport);
}

function scheduleRender(delay = 100) {
  if (renderTimer && delay > 0) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = undefined;
    renderActiveMode();
  }, delay);
}

function handleWorkerMessage(message) {
  if (message.type === "snapshot") {
    messageHistory = message.messageHistory.slice(-MAX_MESSAGE_HISTORY);
    setOptionalChannels(message.optionalChannels);
    mixedMessagesDirty = true;
    scheduleRender();
  } else if (message.type === "optional-channels") {
    setOptionalChannels(message.optionalChannels);
  } else if (message.type === "telegram-message") {
    upsertMessage(message.message);
    mixedMessagesDirty = true;
    scheduleRender(0);
    if (
      soundEnabled &&
      shouldDisplayMessage(message.message) &&
      message.message.type !== "telegram_message_edited"
    ) {
      const sound = getNotificationSound(message.message);
      if (sound) {
        notificationAudio.src = sound.url;
        notificationAudio.volume = sound.volume;
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch(() => { });
      }
    }
  } else if (message.type === "telegram-message-deleted") {
    deleteMessage(message.channelId, message.messageId);
    mixedMessagesDirty = true;
    scheduleRender(0);
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.soundEnabled) soundEnabled = changes.soundEnabled.newValue !== false;
  if (changes.notificationVolume) {
    notificationVolume = normalizeNotificationVolume(changes.notificationVolume.newValue);
  }
  if (changes.messageFontSize) {
    messageFontSize = normalizeMessageFontSize(changes.messageFontSize.newValue);
    applyMessageFontSize();
  }
  if (changes.enabledChannelIds) {
    enabledChannelIds = new Set(
      Array.isArray(changes.enabledChannelIds.newValue)
        ? changes.enabledChannelIds.newValue.filter(Number.isInteger)
        : [],
    );
    mixedMessagesDirty = true;
    scheduleRender(0);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "toggle-display-mode") return;
  setDisplayMode(displayMode === "mixed" ? "floating" : "mixed");
});

chrome.storage.local
  .get({
    soundEnabled: true,
    notificationVolume: DEFAULT_NOTIFICATION_VOLUME,
    messageFontSize: DEFAULT_MESSAGE_FONT_SIZE,
    enabledChannelIds: [],
  })
  .then((settings) => {
    soundEnabled = settings.soundEnabled !== false;
    notificationVolume = normalizeNotificationVolume(settings.notificationVolume);
    messageFontSize = normalizeMessageFontSize(settings.messageFontSize);
    enabledChannelIds = new Set(
      Array.isArray(settings.enabledChannelIds)
        ? settings.enabledChannelIds.filter(Number.isInteger)
        : [],
    );
    connectToWorker();
    scheduleRender();
  });

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
  childList: true,
  subtree: true,
});

window.addEventListener("resize", clampDisplayControlToViewport);
