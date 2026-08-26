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
const notificationVolumeInput = document.querySelector("#notificationVolume");
const notificationVolumeValue = document.querySelector("#notificationVolumeValue");
const messageFontSizeInput = document.querySelector("#messageFontSize");
const messageFontSizeValue = document.querySelector("#messageFontSizeValue");
const notificationPreviewAudio = new Audio(chrome.runtime.getURL("notification-sound.mp3"));

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
    notificationVolume: Number(notificationVolumeInput.value),
    messageFontSize: Number(messageFontSizeInput.value),
  });
  settingsDetail.textContent = "设置已保存";
});

messageFontSizeInput.addEventListener("input", () => {
  messageFontSizeValue.value = `${messageFontSizeInput.value}px`;
});

notificationVolumeInput.addEventListener("input", () => {
  notificationVolumeValue.value = `${notificationVolumeInput.value}%`;
});

notificationVolumeInput.addEventListener("change", () => {
  notificationPreviewAudio.volume = Number(notificationVolumeInput.value) / 100;
  notificationPreviewAudio.currentTime = 0;
  notificationPreviewAudio.play().catch(() => { });
});

for (const input of [
  secondaryChannelEnabledInput,
  soundEnabledInput,
  notificationVolumeInput,
  messageFontSizeInput,
]) {
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
  .get({
    secondaryChannelEnabled: false,
    soundEnabled: true,
    notificationVolume: 50,
    messageFontSize: 15,
  })
  .then((settings) => {
    secondaryChannelEnabledInput.checked = settings.secondaryChannelEnabled;
    soundEnabledInput.checked = settings.soundEnabled;
    notificationVolumeInput.value = settings.notificationVolume;
    notificationVolumeValue.value = `${notificationVolumeInput.value}%`;
    messageFontSizeInput.value = settings.messageFontSize;
    messageFontSizeValue.value = `${messageFontSizeInput.value}px`;
  });
