const PAGE_PARAMS = new URLSearchParams(location.search);
const TARGET_ROOT_SELECTOR =
  PAGE_PARAMS.get("popout") === "true" && PAGE_PARAMS.get("target") === "xTracker"
    ? '[data-testid="virtuoso-scroller"]'
    : '[data-id="KEY_X_SNIPER_RND_V1"]';
const TARGET_SELECTOR = `${TARGET_ROOT_SELECTOR} [data-testid="virtuoso-item-list"]`;
const MAX_MESSAGE_HISTORY = 20;
const DEFAULT_MESSAGE_FONT_SIZE = 15;
const MIN_MESSAGE_FONT_SIZE = 12;
const MAX_MESSAGE_FONT_SIZE = 20;
const DEFAULT_NOTIFICATION_VOLUME = 50;
const UNISIGNAL = 3912057240;
const UNISIGNAL_FEED = 3808132947;
const UNISIGNAL_SOUND_URL = chrome.runtime.getURL("notification-sound.mp3");
const UNISIGNAL_ICON_URL = chrome.runtime.getURL("icons/icon32.png");
const UNISIGNAL_AVATAR_URL = chrome.runtime.getURL("icons/avatar.jpg");
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
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 8px;
    background: #1f1f1f;
  }
  article + article { margin-top: 7px; }
  .title { margin-bottom: 6px; color: #46b87d; font-size: calc(var(--message-font-size, 15px) - 1px); font-weight: 700; }
  .edited { margin-left: 6px; color: #808080; font-size: calc(var(--message-font-size, 15px) - 3px); font-weight: 400; }
  .text { color: #f5f5f5; font-size: var(--message-font-size, 15px); line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .text a { color: #4ea7fa; }
  .text [data-gmgn-contract] { cursor: pointer; }
  .text code { padding: 1px 4px; border-radius: 4px; background: #242424; color: #69cf8d; font-family: "SFMono-Regular", Consolas, monospace; }
  .text pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: #0a0a0a; white-space: pre-wrap; }
  .text pre code { padding: 0; background: transparent; }
  .text blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 3px solid #46b87d; color: #ccc; }
  .footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 5px; }
  .action { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border: 1px solid rgb(255 255 255 / 16%); border-radius: 6px; background: #242424; color: #ccc; font-family: inherit; font-size: calc(var(--message-font-size, 15px) - 3px); font-weight: 500; line-height: 1.4; text-decoration: none; cursor: pointer; }
  .action-icon { width: 18px; height: 18px; flex: none; }
  .action:hover { border-color: #46b87d; background: #2e2e2e; color: #f5f5f5; }
  .telegram { color: #4ea7fa; }
  time { flex: none; color: #808080; font-size: calc(var(--message-font-size, 15px) - 3px); text-align: right; }
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
let lastFloatingSignature = "";
let activeTargetList;
let displayMode = "mixed";
let displayControl;
let floatingMessages;
let soundEnabled = true;
let notificationVolume = DEFAULT_NOTIFICATION_VOLUME;
let messageFontSize = DEFAULT_MESSAGE_FONT_SIZE;
let secondaryChannelEnabled = false;
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
  if (!Number.isInteger(message.channel_id) || message.channel_id === UNISIGNAL) {
    return true;
  }
  return message.channel_id === UNISIGNAL_FEED && secondaryChannelEnabled;
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
  if (!Number.isInteger(message.channel_id) || message.channel_id === UNISIGNAL) {
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
  host.style.setProperty("--message-font-size", `${messageFontSize}px`);
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
    title.textContent = data.channel_id === UNISIGNAL_FEED ? "Unisignal Feed" : "聚合监控";
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

function createTwitterMessage(message) {
  const text = document.createElement("div");
  appendSanitizedHtml(text, message.html);
  const contracts = markContractTargets(text);
  const hasTelegramUrl =
    Number.isInteger(message.channel_id) && Number.isInteger(message.message_id);
  const title = message.channel_id === UNISIGNAL_FEED ? "Unisignal Feed" : "聚合监控";

  return {
    key: getMessageKey(message),
    title: message.type === "telegram_message_edited" ? `${title}（已编辑）` : title,
    avatar: UNISIGNAL_AVATAR_URL,
    text: text.textContent.trim() || " ",
    date: message.date,
    telegramUrl: hasTelegramUrl
      ? `https://t.me/c/${message.channel_id}/${message.message_id}`
      : "",
    token: contracts[0],
  };
}

function injectMessagesIntoTwitterFeed() {
  if (displayMode !== "mixed") return;

  const messages = messageHistory
    .filter(shouldDisplayMessage)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .map(createTwitterMessage);
  const signature = JSON.stringify(messages);
  if (signature === lastInjectedSignature) return;

  document.documentElement.dataset.unisignalTwitterMessages = signature;
  document.dispatchEvent(new Event("unisignal:inject-twitter"));
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
    floatingMessages.replaceChildren(createMessageGroup(messages));
  }
  lastFloatingSignature = signature;
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
    lastInjectedSignature = "";
  }
  return activeList;
}

function renderActiveMode() {
  const targetList = findActiveTargetList();
  if (!targetList) {
    displayControl?.remove();
    return;
  }

  if (displayMode === "floating") {
    ensureDisplayControl();
    for (const group of targetList.querySelectorAll("unisignal-telegram-feed")) group.remove();
    renderFloatingFeed();
  } else {
    displayControl?.remove();
    floatingMessages?.replaceChildren();
    injectMessagesIntoTwitterFeed();
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
    scheduleRender();
  } else if (message.type === "telegram-message") {
    upsertMessage(message.message);
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
  if (changes.secondaryChannelEnabled) {
    secondaryChannelEnabled = changes.secondaryChannelEnabled.newValue === true;
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
    secondaryChannelEnabled: false,
  })
  .then((settings) => {
    soundEnabled = settings.soundEnabled !== false;
    notificationVolume = normalizeNotificationVolume(settings.notificationVolume);
    messageFontSize = normalizeMessageFontSize(settings.messageFontSize);
    secondaryChannelEnabled = settings.secondaryChannelEnabled === true;
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
  attributes: true,
  attributeFilter: ["data-unisignal-timestamp"],
  childList: true,
  subtree: true,
});

window.addEventListener("resize", clampDisplayControlToViewport);
