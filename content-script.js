const TARGET_SELECTOR = '[data-testid="virtuoso-item-list"]';
const MAX_MESSAGE_HISTORY = 100;
const ALLOWED_TAGS = new Set(["a", "blockquote", "code", "del", "em", "pre", "strong", "u"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tg:"]);

const STATE_LABELS = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  reconnecting: "等待重连",
  error: "连接错误",
};

const PANEL_CSS = `
  :host {
    display: block;
    position: sticky;
    top: 0;
    z-index: 100;
    margin: 8px;
    color: #f3f5f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  .panel {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 10px;
    background: rgb(16 19 24 / 96%);
    box-shadow: 0 10px 30px rgb(0 0 0 / 28%);
    backdrop-filter: blur(12px);
  }
  .header {
    display: flex;
    align-items: center;
    min-height: 42px;
    padding: 8px 10px;
    border-bottom: 1px solid rgb(255 255 255 / 9%);
  }
  .identity { display: flex; align-items: center; min-width: 0; gap: 7px; }
  .dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #7e8794; }
  .panel.connected .dot { background: #45d39c; box-shadow: 0 0 0 3px rgb(69 211 156 / 13%); }
  .panel.connecting .dot, .panel.reconnecting .dot { background: #e9c85f; }
  .panel.error .dot { background: #ff697c; }
  .title { overflow: hidden; font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .state { color: #929baa; font-size: 11px; }
  .count { margin-left: auto; color: #929baa; font-size: 11px; }
  .toggle {
    margin-left: 8px;
    padding: 4px 7px;
    border: 0;
    border-radius: 6px;
    background: rgb(255 255 255 / 8%);
    color: #bfc6d1;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
  }
  .messages { max-height: 320px; padding: 8px; overflow: auto; }
  .panel.collapsed .messages { display: none; }
  .panel.collapsed .header { border-bottom: 0; }
  .empty { padding: 12px; color: #7f8896; font-size: 12px; text-align: center; }
  .message { padding: 10px; border: 1px solid rgb(255 255 255 / 9%); border-radius: 8px; background: rgb(255 255 255 / 4%); }
  .message + .message { margin-top: 7px; }
  .text { color: #e1e6ed; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .text a { color: #57bfff; }
  .text code { padding: 1px 4px; border-radius: 4px; background: rgb(255 255 255 / 8%); color: #aee8d8; font-family: "SFMono-Regular", Consolas, monospace; }
  .text pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: rgb(0 0 0 / 28%); white-space: pre-wrap; }
  .text pre code { padding: 0; background: transparent; }
  .text blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 3px solid #4f9189; color: #b4bdca; }
  .time { display: block; margin-top: 7px; color: #7f8896; font-size: 10px; text-align: right; }
`;

let host;
let panel;
let messagesElement;
let countElement;
let stateElement;
let toggleElement;
let mountedList;
let mountTimer;
let reconnectTimer;
let workerPort;
let messageHistory = [];

function isAllowedLink(href) {
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
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

function createMessage(payload) {
  const message = document.createElement("article");
  const text = document.createElement("div");
  const time = document.createElement("time");

  message.className = "message";
  text.className = "text";
  time.className = "time";
  appendSanitizedHtml(text, payload.data.html);
  time.textContent = new Date(payload.data.date).toLocaleString("zh-CN", { hour12: false });
  message.append(text, time);
  return message;
}

function updateCount() {
  countElement.textContent = `${messageHistory.length} 条`;
}

function appendPayload(payload) {
  if (messageHistory.length === 0) messagesElement.replaceChildren();
  messageHistory.push(payload);
  messagesElement.prepend(createMessage(payload));
  messagesElement.scrollTop = 0;

  if (messageHistory.length > MAX_MESSAGE_HISTORY) {
    messageHistory.shift();
    messagesElement.lastElementChild.remove();
  }
  updateCount();
}

function renderHistory(history) {
  messageHistory = [];
  messagesElement.replaceChildren();
  for (const payload of history) appendPayload(payload);

  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "等待 Telegram 推送...";
    messagesElement.append(empty);
  }
  updateCount();
}

function renderState(state) {
  for (const stateName of Object.keys(STATE_LABELS)) {
    panel.classList.remove(stateName);
  }
  panel.classList.add(state);
  stateElement.textContent = STATE_LABELS[state] || state;
}

function createPanel() {
  host = document.createElement("unisignal-telegram-feed");
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(PANEL_CSS);
  shadow.adoptedStyleSheets = [sheet];

  panel = document.createElement("section");
  panel.className = "panel disconnected";
  const header = document.createElement("div");
  header.className = "header";
  const identity = document.createElement("div");
  identity.className = "identity";
  const dot = document.createElement("span");
  dot.className = "dot";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = "UniSignal Telegram";
  stateElement = document.createElement("span");
  stateElement.className = "state";
  stateElement.textContent = "未连接";
  countElement = document.createElement("span");
  countElement.className = "count";
  countElement.textContent = "0 条";
  toggleElement = document.createElement("button");
  toggleElement.className = "toggle";
  toggleElement.type = "button";
  toggleElement.textContent = "收起";
  messagesElement = document.createElement("div");
  messagesElement.className = "messages";

  toggleElement.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    toggleElement.textContent = collapsed ? "展开" : "收起";
  });

  identity.append(dot, title, stateElement);
  header.append(identity, countElement, toggleElement);
  panel.append(header, messagesElement);
  shadow.append(panel);
  renderHistory([]);
}

function findTargetList() {
  const lists = [...document.querySelectorAll(TARGET_SELECTOR)];
  return (
    lists.find((list) => list.getClientRects().length > 0 && list.querySelector(".gmgn-vlist-item")) ||
    lists.find((list) => list.getClientRects().length > 0)
  );
}

function mountPanel() {
  const targetList = findTargetList();
  if (!targetList) return;
  if (host.isConnected && mountedList === targetList) return;

  targetList.before(host);
  mountedList = targetList;
}

function scheduleMount() {
  clearTimeout(mountTimer);
  mountTimer = setTimeout(mountPanel, 100);
}

function handleWorkerMessage(message) {
  if (message.type === "snapshot") {
    renderState(message.state);
    renderHistory(message.messageHistory);
  } else if (message.type === "connection-state") {
    renderState(message.state);
  } else if (message.type === "ws-data") {
    appendPayload({ data: message.data, receivedAt: message.receivedAt });
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
    workerPort = null;
    reconnectTimer = setTimeout(connectToWorker, 1_000);
  });
}

createPanel();
mountPanel();
connectToWorker();

new MutationObserver(scheduleMount).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
