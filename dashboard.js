const statusElement = document.querySelector("#status");
const statusText = document.querySelector("#statusText");
const connectionDetail = document.querySelector("#connectionDetail");
const connectionForm = document.querySelector("#connectionForm");
const accessTokenInput = document.querySelector("#accessToken");
const reconnectButton = document.querySelector("#reconnect");
const soundEnabledInput = document.querySelector("#soundEnabled");
const messageFontSizeInput = document.querySelector("#messageFontSize");
const messageFontSizeValue = document.querySelector("#messageFontSizeValue");

const STATE_LABELS = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  reconnecting: "等待重连",
};

function renderConnectionState(state, detail = "") {
  statusElement.className = `status ${state}`;
  statusText.textContent = STATE_LABELS[state] || state;
  connectionDetail.textContent = detail;
}

connectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const accessToken = accessTokenInput.value.trim();
  if (!accessToken) {
    connectionDetail.textContent = "请输入 Access Token";
    return;
  }

  await chrome.runtime.sendMessage({ type: "set-access-token", accessToken });
  connectionDetail.textContent = "Access Token 已保存，正在连接…";
});

reconnectButton.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "reconnect" });
});

soundEnabledInput.addEventListener("change", () => {
  chrome.storage.local.set({ soundEnabled: soundEnabledInput.checked });
});

messageFontSizeInput.addEventListener("input", () => {
  messageFontSizeValue.value = `${messageFontSizeInput.value}px`;
});

messageFontSizeInput.addEventListener("change", () => {
  chrome.storage.local.set({ messageFontSize: Number(messageFontSizeInput.value) });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "connection-state") {
    renderConnectionState(message.state, message.detail);
  }
});

chrome.runtime.sendMessage({ type: "get-status" }).then((status) => {
  accessTokenInput.value = status.accessToken;
  renderConnectionState(status.state);
});

chrome.storage.local.get({ soundEnabled: true, messageFontSize: 15 }).then((settings) => {
  soundEnabledInput.checked = settings.soundEnabled;
  messageFontSizeInput.value = settings.messageFontSize;
  messageFontSizeValue.value = `${messageFontSizeInput.value}px`;
});
