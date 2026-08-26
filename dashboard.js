const statusElement = document.querySelector("#status");
const statusText = document.querySelector("#statusText");
const connectionDetail = document.querySelector("#connectionDetail");
const connectionForm = document.querySelector("#connectionForm");
const accessTokenInput = document.querySelector("#accessToken");
const reconnectButton = document.querySelector("#reconnect");
const saveSettingsButton = document.querySelector("#saveSettings");
const settingsDetail = document.querySelector("#settingsDetail");
const secondaryChannelEnabledInput = document.querySelector("#secondaryChannelEnabled");
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

saveSettingsButton.addEventListener("click", async () => {
  await chrome.storage.local.set({
    secondaryChannelEnabled: secondaryChannelEnabledInput.checked,
    soundEnabled: soundEnabledInput.checked,
    messageFontSize: Number(messageFontSizeInput.value),
  });
  settingsDetail.textContent = "设置已保存";
});

messageFontSizeInput.addEventListener("input", () => {
  messageFontSizeValue.value = `${messageFontSizeInput.value}px`;
});

for (const input of [secondaryChannelEnabledInput, soundEnabledInput, messageFontSizeInput]) {
  input.addEventListener("input", () => {
    settingsDetail.textContent = "";
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "connection-state") {
    renderConnectionState(message.state, message.detail);
  }
});

chrome.runtime.sendMessage({ type: "get-status" }).then((status) => {
  accessTokenInput.value = status.accessToken;
  renderConnectionState(status.state);
});

chrome.storage.local
  .get({ secondaryChannelEnabled: false, soundEnabled: true, messageFontSize: 15 })
  .then((settings) => {
    secondaryChannelEnabledInput.checked = settings.secondaryChannelEnabled;
    soundEnabledInput.checked = settings.soundEnabled;
    messageFontSizeInput.value = settings.messageFontSize;
    messageFontSizeValue.value = `${messageFontSizeInput.value}px`;
  });
