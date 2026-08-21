const statusElement = document.querySelector("#status");
const statusText = document.querySelector("#statusText");
const connectionDetail = document.querySelector("#connectionDetail");
const connectionForm = document.querySelector("#connectionForm");
const accessTokenInput = document.querySelector("#accessToken");
const messagesElement = document.querySelector("#messages");
const messageCountElement = document.querySelector("#messageCount");
const openPipButton = document.querySelector("#openPip");
const reconnectButton = document.querySelector("#reconnect");
const pipHint = document.querySelector("#pipHint");

let pipWindow = null;
let messageHistory = [];

const MAX_MESSAGE_HISTORY = 100;

const STATE_LABELS = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  reconnecting: "等待重连",
  error: "连接错误",
};

function formatTime(isoTime) {
  return new Date(isoTime).toLocaleString("zh-CN", { hour12: false });
}

function renderConnectionState(state, detail = "") {
  statusElement.className = `status ${state}`;
  statusText.textContent = STATE_LABELS[state] || state;
  connectionDetail.textContent = detail;
}

function parsePush(payload) {
  const data = payload.data;
  return {
    html: data.html,
    time: formatTime(data.date),
  };
}

const ALLOWED_TAGS = new Set(["a", "blockquote", "code", "del", "em", "pre", "strong", "u"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tg:"]);

function isAllowedLink(href) {
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

function appendSanitizedHtml(targetDocument, container, html) {
  const template = targetDocument.createElement("template");
  template.innerHTML = html;

  function appendNodes(source, target) {
    for (const node of source.childNodes) {
      if (node.nodeType === 3) {
        target.append(targetDocument.createTextNode(node.textContent));
        continue;
      }
      if (node.nodeType !== 1) continue;

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

      const element = targetDocument.createElement(tagName);
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

function createMessageElement(targetDocument, payload) {
  const parsed = parsePush(payload);
  const card = targetDocument.createElement("article");
  const text = targetDocument.createElement("div");
  const time = targetDocument.createElement("time");

  card.className = "message-card";
  text.className = "message-text";
  time.className = "message-time";

  appendSanitizedHtml(targetDocument, text, parsed.html);
  time.textContent = parsed.time;

  card.append(text, time);
  return card;
}

function updateMessageCount() {
  messageCountElement.textContent = `${messageHistory.length} 条消息`;
  if (pipWindow && !pipWindow.closed) {
    pipWindow.document.querySelector("#pipCount").textContent = `${messageHistory.length} 条`;
  }
}

function prependToContainer(container, payload) {
  container.prepend(createMessageElement(container.ownerDocument, payload));
  container.scrollTop = 0;
}

function appendPayload(payload) {
  if (messageHistory.length === 0) messagesElement.replaceChildren();
  messageHistory.push(payload);
  prependToContainer(messagesElement, payload);

  if (messageHistory.length > MAX_MESSAGE_HISTORY) {
    messageHistory.shift();
    messagesElement.lastElementChild.remove();
  }

  if (pipWindow && !pipWindow.closed) {
    const pipMessages = pipWindow.document.querySelector("#pipMessages");
    prependToContainer(pipMessages, payload);
    if (pipMessages.childElementCount > MAX_MESSAGE_HISTORY) {
      pipMessages.lastElementChild.remove();
    }
  }

  updateMessageCount();
}

function renderHistory(history) {
  messageHistory = [];
  messagesElement.replaceChildren();

  for (const payload of history) appendPayload(payload);

  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "等待服务器推送...";
    messagesElement.append(empty);
  }
  updateMessageCount();
}

function buildPipDocument(targetWindow) {
  targetWindow.document.title = "WebSocket 实时数据";

  const style = targetWindow.document.createElement("style");
  style.textContent = `
    :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #090d18; color: #f4f7ff; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; padding: 14px; background: linear-gradient(145deg, #101a2c, #080c16); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 11px; border-bottom: 1px solid #29354b; }
    strong { font-size: 14px; }
    #pipCount { color: #8e9aaf; font-size: 11px; }
    #pipMessages { height: calc(100vh - 43px); padding-top: 12px; overflow: auto; }
    .message-card { padding: 10px; border: 1px solid #29364d; border-radius: 9px; background: #0d1525; }
    .message-card + .message-card { margin-top: 8px; }
    .message-text { color: #d9e3f2; font-size: 12px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
    .message-text a { color: #71d7ff; }
    .message-text code { padding: 1px 4px; border-radius: 4px; background: #172238; color: #b9f5e8; font-family: "SFMono-Regular", Consolas, monospace; }
    .message-text pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: #080d17; white-space: pre-wrap; }
    .message-text pre code { padding: 0; background: transparent; }
    .message-text blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 3px solid #4f9189; color: #aebbd0; }
    .message-time { display: block; margin-top: 8px; color: #7f8ba0; font-size: 9px; text-align: right; }
  `;

  const header = targetWindow.document.createElement("header");
  const title = targetWindow.document.createElement("strong");
  const count = targetWindow.document.createElement("span");
  const messages = targetWindow.document.createElement("div");

  title.textContent = "Telegram 实时消息";
  count.id = "pipCount";
  messages.id = "pipMessages";
  header.append(title, count);
  targetWindow.document.head.append(style);
  targetWindow.document.body.append(header, messages);

  for (const payload of messageHistory) prependToContainer(messages, payload);
  updateMessageCount();
}

connectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const accessToken = accessTokenInput.value.trim();
  if (!accessToken) {
    connectionDetail.textContent = "请输入 access token";
    return;
  }

  await chrome.runtime.sendMessage({ type: "set-access-token", accessToken });
  connectionDetail.textContent = "Access token 已保存，正在连接...";
});

reconnectButton.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "reconnect" });
});

openPipButton.addEventListener("click", async () => {
  if (!("documentPictureInPicture" in window)) {
    pipHint.textContent = "当前 Chrome 不支持 Document Picture-in-Picture，请升级到 Chrome 116 或更高版本。";
    return;
  }

  if (pipWindow && !pipWindow.closed) {
    pipWindow.focus();
    return;
  }

  try {
    pipWindow = await documentPictureInPicture.requestWindow({
      width: 420,
      height: 260,
    });
    buildPipDocument(pipWindow);
    pipHint.textContent = "画中画已打开；请保留当前控制页。";

    pipWindow.addEventListener("pagehide", () => {
      pipWindow = null;
      pipHint.textContent = "画中画已关闭。";
    });
  } catch (error) {
    pipHint.textContent = `无法打开画中画：${error.message}`;
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "connection-state") {
    renderConnectionState(message.state, message.detail);
  } else if (message.type === "ws-data") {
    appendPayload({ data: message.data, receivedAt: message.receivedAt });
  }
});

chrome.runtime.sendMessage({ type: "get-status" }).then((status) => {
  accessTokenInput.value = status.accessToken;
  renderConnectionState(status.state);
  renderHistory(status.messageHistory);
});
