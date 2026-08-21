const statusElement = document.querySelector("#status");
const statusText = document.querySelector("#statusText");
const connectionDetail = document.querySelector("#connectionDetail");
const connectionForm = document.querySelector("#connectionForm");
const accessTokenInput = document.querySelector("#accessToken");
const reconnectButton = document.querySelector("#reconnect");

const STATE_LABELS = {
  connected: "已连接",
  connecting: "连接中",
  disconnected: "未连接",
  reconnecting: "等待重连",
  error: "连接错误",
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
    connectionDetail.textContent = "请输入 access token";
    return;
  }

  await chrome.runtime.sendMessage({ type: "set-access-token", accessToken });
  connectionDetail.textContent = "Access token 已保存，正在连接...";
});

reconnectButton.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "reconnect" });
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
