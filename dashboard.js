const statusElement = document.querySelector("#status");
const statusText = document.querySelector("#statusText");
const connectionDetail = document.querySelector("#connectionDetail");
const connectionForm = document.querySelector("#connectionForm");
const saveTokenButton = connectionForm.querySelector('button[type="submit"]');
const accessTokenInput = document.querySelector("#accessToken");
const saveSettingsButton = document.querySelector("#saveSettings");
const settingsDetail = document.querySelector("#settingsDetail");
const optionalChannelsElement = document.querySelector("#optionalChannels");
const soundEnabledInput = document.querySelector("#soundEnabled");
const notificationVolumeInput = document.querySelector("#notificationVolume");
const notificationVolumeValue = document.querySelector("#notificationVolumeValue");
const messageFontSizeInput = document.querySelector("#messageFontSize");
const messageFontSizeValue = document.querySelector("#messageFontSizeValue");
const notificationPreviewAudio = new Audio(chrome.runtime.getURL("notification-sound.mp3"));
let optionalChannels = [];
let enabledChannelIds = new Set();
let savedSettings = null;

function showSaved(element, text) {
  document.querySelector(".save-confirmation")?.remove();
  const confirmation = document.createElement("span");
  confirmation.className = "save-confirmation";
  confirmation.setAttribute("popover", "manual");
  confirmation.textContent = text;
  element.replaceChildren(confirmation);
  confirmation.showPopover?.();
  setTimeout(() => confirmation.remove(), 1000);
}

function readSettings() {
  return {
    enabledChannelIds: [...enabledChannelIds].sort((a, b) => a - b),
    soundEnabled: soundEnabledInput.checked,
    notificationVolume: Number(notificationVolumeInput.value),
    messageFontSize: Number(messageFontSizeInput.value),
  };
}

function updateSaveState() {
  const hasChanges = savedSettings !== null && JSON.stringify(readSettings()) !== savedSettings;
  saveSettingsButton.classList.toggle("has-changes", hasChanges);
  return hasChanges;
}

function handleSettingsInput() {
  updateSaveState();
  if (!saveSettingsButton.disabled) {
    settingsDetail.textContent = "";
  }
}

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

function renderOptionalChannels() {
  if (optionalChannels.length === 0) {
    const detail = document.createElement("p");
    detail.className = "detail";
    detail.textContent = "当前没有可选频道";
    optionalChannelsElement.replaceChildren(detail);
    return;
  }

  const rows = optionalChannels.map((channel) => {
    const label = document.createElement("label");
    label.className = "preference";
    const name = document.createElement("span");
    const input = document.createElement("input");
    name.textContent = channel.name;
    input.type = "checkbox";
    input.dataset.channelId = String(channel.id);
    input.checked = enabledChannelIds.has(channel.id);
    input.addEventListener("input", () => {
      if (input.checked) {
        enabledChannelIds.add(channel.id);
      } else {
        enabledChannelIds.delete(channel.id);
      }
      handleSettingsInput();
    });
    label.append(name, input);
    return label;
  });
  optionalChannelsElement.replaceChildren(...rows);
}

function setOptionalChannels(channels) {
  optionalChannels = Array.isArray(channels) ? channels : [];
  renderOptionalChannels();
}

async function runConnectionAction(message, successText, failureText) {
  if (saveTokenButton.disabled) return;
  saveTokenButton.disabled = true;
  connectionDetail.textContent = "";
  try {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      connectionDetail.textContent = failureText;
    } else if (accessTokenInput.value.trim() === message.accessToken) {
      showSaved(connectionDetail, successText);
    } else {
      connectionDetail.textContent = "";
    }
  } catch {
    connectionDetail.textContent = failureText;
  } finally {
    saveTokenButton.disabled = false;
  }
}

accessTokenInput.addEventListener("input", () => {
  if (connectionDetail.textContent === "Access Token 已保存") connectionDetail.textContent = "";
});

connectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveTokenButton.disabled) return;

  const accessToken = accessTokenInput.value.trim();
  if (!accessToken) {
    connectionDetail.textContent = "请输入 Access Token";
    return;
  }

  await runConnectionAction(
    { type: "set-access-token", accessToken },
    "Access Token 已保存", "Access Token 保存失败，请重试。",
  );
});

saveSettingsButton.addEventListener("click", async () => {
  if (saveSettingsButton.disabled) return;
  saveSettingsButton.disabled = true;
  settingsDetail.textContent = "";
  const settings = readSettings();
  try {
    await chrome.storage.local.set(settings);
    savedSettings = JSON.stringify(settings);
    if (updateSaveState()) {
      settingsDetail.textContent = "";
    } else {
      showSaved(settingsDetail, "设置已保存");
    }
  } catch {
    settingsDetail.textContent = "设置保存失败，请重试。";
  } finally {
    saveSettingsButton.disabled = false;
  }
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
  soundEnabledInput,
  notificationVolumeInput,
  messageFontSizeInput,
]) {
  input.addEventListener("input", handleSettingsInput);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "connection-state") {
    renderConnectionState(message.state, message.detail);
  } else if (message.type === "optional-channels") {
    setOptionalChannels(message.optionalChannels);
  }
});

chrome.runtime.sendMessage({ type: "get-status" }).then((status) => {
  accessTokenInput.value = status.accessToken;
  renderConnectionState(status.state);
  setOptionalChannels(status.optionalChannels);
});

chrome.storage.local
  .get({
    enabledChannelIds: [],
    soundEnabled: true,
    notificationVolume: 50,
    messageFontSize: 15,
  })
  .then((settings) => {
    enabledChannelIds = new Set(
      Array.isArray(settings.enabledChannelIds)
        ? settings.enabledChannelIds.filter(Number.isInteger)
        : [],
    );
    renderOptionalChannels();
    soundEnabledInput.checked = settings.soundEnabled;
    notificationVolumeInput.value = settings.notificationVolume;
    notificationVolumeValue.value = `${notificationVolumeInput.value}%`;
    messageFontSizeInput.value = settings.messageFontSize;
    messageFontSizeValue.value = `${messageFontSizeInput.value}px`;
    savedSettings = JSON.stringify(readSettings());
    saveSettingsButton.disabled = false;
    updateSaveState();
  });
