const WS_URL = "wss://wss.unisignal.xyz/ws";
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_MESSAGE_HISTORY = 100;

let socket = null;
let socketGeneration = 0;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectDelay = 1_000;
let currentAccessToken = "";
let messageHistory = [];
let connectionState = "disconnected";
const contentPorts = new Set();

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
  chrome.storage.local.set({ messageHistory });
}

function deleteMessage(channelId, messageId) {
  messageHistory = messageHistory.filter(
    (item) => item.channel_id !== channelId || item.message_id !== messageId,
  );
  chrome.storage.local.set({ messageHistory });
}

function broadcastToContent(message) {
  for (const port of contentPorts) {
    try {
      port.postMessage(message);
    } catch {
      contentPorts.delete(port);
    }
  }
}

function setConnectionState(state, detail = "") {
  connectionState = state;
  const message = {
    type: "connection-state",
    state,
    detail,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // 设置页尚未打开时没有消息接收者，这是正常情况。
  });
}

function clearConnectionTimers() {
  clearInterval(heartbeatTimer);
  clearTimeout(reconnectTimer);
  heartbeatTimer = null;
  reconnectTimer = null;
}

function scheduleReconnect(generation) {
  if (generation !== socketGeneration || reconnectTimer) return;

  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  setConnectionState("reconnecting", `${Math.ceil(delay / 1000)} 秒后重连`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (generation === socketGeneration) connect(currentAccessToken, false);
  }, delay);
}

function connect(accessToken, resetBackoff = true) {
  socketGeneration += 1;
  const generation = socketGeneration;

  clearConnectionTimers();
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }

  currentAccessToken = accessToken.trim();
  if (resetBackoff) reconnectDelay = 1_000;

  if (!currentAccessToken) {
    setConnectionState("disconnected", "请先填写 Access Token");
    return;
  }

  const nextSocket = new WebSocket(WS_URL);
  socket = nextSocket;
  setConnectionState("connecting");

  nextSocket.onopen = () => {
    if (generation !== socketGeneration) return;

    nextSocket.send(JSON.stringify({ type: "auth", token: currentAccessToken }));
  };

  nextSocket.onmessage = (event) => {
    if (generation !== socketGeneration) return;

    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message?.type === "authenticated") {
      reconnectDelay = 1_000;
      setConnectionState("connected");
      heartbeatTimer = setInterval(() => {
        if (nextSocket.readyState === WebSocket.OPEN) {
          nextSocket.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_INTERVAL_MS);
      return;
    }
    if (message?.type === "pong") return;
    if (message?.type === "telegram_message_deleted") {
      if (
        !Number.isInteger(message.channel_id) ||
        !Number.isInteger(message.message_id)
      ) {
        return;
      }

      deleteMessage(message.channel_id, message.message_id);
      broadcastToContent({
        type: "telegram-message-deleted",
        channelId: message.channel_id,
        messageId: message.message_id,
      });
      return;
    }
    if (
      !["telegram_message", "telegram_message_edited"].includes(message?.type) ||
      typeof message.html !== "string" ||
      typeof message.date !== "string"
    ) {
      return;
    }

    upsertMessage(message);
    broadcastToContent({ type: "telegram-message", message });
  };

  nextSocket.onclose = () => {
    if (generation !== socketGeneration) return;

    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    socket = null;
    scheduleReconnect(generation);
  };
}

async function loadAndConnect() {
  const { accessToken = "", messageHistory: storedMessages = [] } =
    await chrome.storage.local.get(["accessToken", "messageHistory"]);
  if (Array.isArray(storedMessages)) messageHistory = storedMessages.slice(-MAX_MESSAGE_HISTORY);
  broadcastToContent({ type: "snapshot", messageHistory });
  connect(accessToken);
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "gmgn-feed") return;

  contentPorts.add(port);
  port.postMessage({
    type: "snapshot",
    messageHistory,
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    contentPorts.delete(port);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "get-status") {
    sendResponse({
      state: connectionState,
      accessToken: currentAccessToken,
    });
    return;
  }

  if (message.type === "set-access-token") {
    chrome.storage.local.set({ accessToken: message.accessToken }).then(() => {
      connect(message.accessToken);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "reconnect") {
    connect(currentAccessToken);
    sendResponse({ ok: true });
  }
});

loadAndConnect();
