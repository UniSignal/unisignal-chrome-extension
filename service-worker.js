const WS_URL = "wss://wss.unisignal.xyz/ws";
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_MESSAGE_HISTORY = 20;

let socket = null;
let socketGeneration = 0;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectDelay = 1_000;
let currentAccessToken = "";
let messageHistory = [];
let connectionState = "disconnected";
const contentPorts = new Set();

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // 设置页尚未打开时没有消息接收者，这是正常情况。
  });

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
  broadcast({
    type: "connection-state",
    state,
    detail,
  });
}

function buildWebSocketUrl(accessToken) {
  const url = new URL(WS_URL);
  url.searchParams.set("token", accessToken);
  return url.toString();
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
    setConnectionState("disconnected", "请配置 access token");
    return;
  }

  let nextSocket;
  try {
    nextSocket = new WebSocket(buildWebSocketUrl(currentAccessToken));
  } catch (error) {
    setConnectionState("error", error.message);
    scheduleReconnect(generation);
    return;
  }

  socket = nextSocket;
  setConnectionState("connecting");

  nextSocket.onopen = () => {
    if (generation !== socketGeneration) return;

    reconnectDelay = 1_000;
    setConnectionState("connected");
    heartbeatTimer = setInterval(() => {
      if (nextSocket.readyState === WebSocket.OPEN) {
        nextSocket.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  nextSocket.onmessage = (event) => {
    if (generation !== socketGeneration) return;

    let data = event.data;
    try {
      data = JSON.parse(event.data);
    } catch {
      // 非 JSON 消息按原始文本展示。
    }

    if (data?.type === "connected" || data?.type === "pong") return;

    const payload = {
      data,
      receivedAt: new Date().toISOString(),
    };
    messageHistory.push(payload);
    messageHistory = messageHistory.slice(-MAX_MESSAGE_HISTORY);
    broadcast({ type: "ws-data", ...payload });
  };

  nextSocket.onerror = () => {
    if (generation === socketGeneration) {
      setConnectionState("error", "WebSocket 连接出错");
    }
  };

  nextSocket.onclose = (event) => {
    if (generation !== socketGeneration) return;

    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    socket = null;
    setConnectionState("disconnected", event.reason || `连接已关闭 (${event.code})`);
    scheduleReconnect(generation);
  };
}

async function loadAndConnect() {
  const { accessToken = "" } = await chrome.storage.local.get("accessToken");
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
    state: connectionState,
    messageHistory,
  });
  port.onDisconnect.addListener(() => contentPorts.delete(port));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "get-status") {
    sendResponse({
      state: connectionState,
      accessToken: currentAccessToken,
      messageHistory,
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
