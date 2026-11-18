const { test: base, expect, chromium } = require("@playwright/test");
const path = require("node:path");

const test = base.extend({
  context: async ({ headless }, use) => {
    const extension = path.join(__dirname, "..");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      // Keep the real content-script match and extension APIs, without a live site dependency.
      await context.route("https://gmgn.ai/**", (route) => route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body><div data-testid="x-tracker-root"></div></body></html>',
      }));
      await use(context);
    } finally {
      await context.close();
    }
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate(async () => {
      await initialization;
      await chrome.storage.local.set({ displayMode: "floating", soundEnabled: false });
      // A fixture token must never be sent to a real server during settings tests.
      globalThis.WebSocket = class {
        close() {}
      };
    });
    await use(worker);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    expect(errors).toEqual([]);
  },
});

const message = (id, html = `调试消息 ${id}`) => ({
  type: "telegram_message", channel_id: 3912057240, message_id: id, html,
  date: new Date(Date.UTC(2026, 10, 15, 0, 0, id)).toISOString(),
});
const broadcast = (worker, payload) => worker.evaluate((data) => broadcastToContent(data), payload);
const snapshot = (worker, messages) => broadcast(worker, {
  type: "snapshot", messageHistory: messages, optionalChannels: [],
});

async function openFeed(page, worker) {
  await page.goto("https://gmgn.ai/?chain=bsc");
  await expect(page.locator("unisignal-display-control")).toBeVisible();
  await expect.poll(() => worker.evaluate(() => contentPorts.size)).toBe(1);
  return page.locator("unisignal-display-control unisignal-telegram-feed article");
}

async function openSettings(page, worker) {
  const extensionId = new URL(worker.url()).host;
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await expect(page.locator("#statusText")).toHaveText("未连接");
  await expect(page.locator("#soundEnabled")).not.toBeChecked();
}

test("worker messages, edits, deletes and snapshots preserve unchanged cards and focus", async ({ page, worker }) => {
  const cards = await openFeed(page, worker);
  await snapshot(worker, [message(1)]);
  await expect(cards).toHaveCount(1);
  const original = cards.locator("a");
  await original.evaluate((link) => { window.testLink = link; });
  await original.focus();

  await broadcast(worker, { type: "telegram-message", message: message(2) });
  await expect(cards).toHaveCount(2);
  const firstLink = page.locator('article[data-message-key="3912057240:1"] a');
  await expect(firstLink).toBeFocused();
  await expect(firstLink).toHaveAttribute("href", "https://t.me/c/3912057240/1");
  expect(await firstLink.evaluate((link) => link === window.testLink)).toBe(true);

  await broadcast(worker, {
    type: "telegram-message",
    message: { ...message(2, "编辑后的消息"), type: "telegram_message_edited" },
  });
  await expect(cards.first()).toContainText("编辑后的消息");
  await expect(cards).toHaveCount(2);
  await expect(firstLink).toBeFocused();
  await broadcast(worker, { type: "telegram-message-deleted", channelId: 3912057240, messageId: 2 });
  await expect(cards).toHaveCount(1);
  await expect(firstLink).toBeFocused();

  await snapshot(worker, [message(1), message(3)]);
  await expect(cards.first()).toHaveAttribute("data-message-key", "3912057240:3");
  await expect(firstLink).toBeFocused();
  expect(await firstLink.evaluate((link) => link === window.testLink)).toBe(true);
  await snapshot(worker, []);
  await expect(cards).toHaveCount(0);
  await expect(page.locator("unisignal-display-control .empty")).toHaveText("暂无消息");
});

test("renaming a channel updates its existing floating card without a new message", async ({ page, worker }) => {
  await worker.evaluate(() => chrome.storage.local.set({ enabledChannelIds: [123] }));
  const cards = await openFeed(page, worker);
  await broadcast(worker, {
    type: "snapshot",
    messageHistory: [{ ...message(1), channel_id: 123 }],
    optionalChannels: [{ id: 123, name: "旧频道名" }],
  });
  const title = cards.locator(".title");
  await expect(title).toHaveText("旧频道名");
  await worker.evaluate(() => setOptionalChannels([{ id: 123, name: "新频道名" }]));
  await expect(title).toHaveText("新频道名");
});

test("history cap and updates retain the reading position", async ({ page, worker }) => {
  const cards = await openFeed(page, worker);
  await snapshot(worker, Array.from({ length: 100 }, (_, i) => message(i + 1, "多行正文\n".repeat(8))));
  await expect(cards).toHaveCount(100);
  const list = page.locator("unisignal-display-control .messages");
  await list.evaluate((element) => {
    element.scrollTop = 1200;
    const viewportTop = element.getBoundingClientRect().top;
    const articles = element.querySelector("unisignal-telegram-feed").shadowRoot.querySelectorAll("article");
    window.testAnchor = [...articles].find((article) => article.getBoundingClientRect().bottom > viewportTop);
    window.testAnchorTop = window.testAnchor.getBoundingClientRect().top;
  });
  await broadcast(worker, { type: "telegram-message", message: message(101) });
  await expect(cards.first()).toHaveAttribute("data-message-key", "3912057240:101");
  await expect(cards).toHaveCount(100);
  await expect(page.locator('article[data-message-key="3912057240:1"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    Math.abs(window.testAnchor.getBoundingClientRect().top - window.testAnchorTop),
  )).toBeLessThan(1);
  await list.evaluate((element) => { element.scrollTop = 0; });
  await broadcast(worker, { type: "telegram-message", message: message(102) });
  await expect(cards.first()).toHaveAttribute("data-message-key", "3912057240:102");
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0);
});

test("settings save and connection actions acknowledge actual worker responses", async ({ page, worker }) => {
  await openSettings(page, worker);
  await page.locator("#accessToken").fill("fixture-token");
  await page.getByRole("button", { name: "保存并连接" }).click();
  await expect(page.locator("#connectionDetail")).toHaveText("Access Token 已保存");
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("accessToken")).accessToken)).toBe("fixture-token");
  await page.locator("#soundEnabled").check();
  await page.locator("#saveSettings").click();
  await expect(page.locator("#saveSettings")).not.toHaveClass("has-changes");
  await expect(page.locator("#settingsDetail")).toBeEmpty();
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("soundEnabled")).soundEnabled)).toBe(true);
});

test("saving the font size before optional channels load preserves channel selections", async ({ page, worker }) => {
  await worker.evaluate(() => chrome.storage.local.set({ enabledChannelIds: [123] }));
  await openSettings(page, worker);
  await expect(page.locator("#optionalChannels input")).toHaveCount(0);
  await page.locator("#messageFontSize").press("ArrowRight");
  await page.locator("#saveSettings").click();
  await expect(page.locator("#saveSettings")).not.toHaveClass("has-changes");
  expect(await worker.evaluate(() => chrome.storage.local.get(["enabledChannelIds", "messageFontSize"])))
    .toEqual({ enabledChannelIds: [123], messageFontSize: 16 });
});

test("worker storage failure reaches the settings page and allows retry", async ({ page, worker }) => {
  await openSettings(page, worker);
  await worker.evaluate(() => {
    globalThis.testStorageSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error("fixture storage failure"); };
  });
  await page.locator("#accessToken").fill("fixture-token");
  await page.getByRole("button", { name: "保存并连接" }).click();
  await expect(page.locator("#connectionDetail")).toHaveText("Access Token 保存失败，请重试。");
  await expect(page.getByRole("button", { name: "保存并连接" })).toBeEnabled();
  await worker.evaluate(() => { chrome.storage.local.set = globalThis.testStorageSet; });
  await page.getByRole("button", { name: "保存并连接" }).click();
  await expect(page.locator("#connectionDetail")).toHaveText("Access Token 已保存");
});

test("save-token blocks repeated requests and recovers after a messaging failure", async ({ page, worker }) => {
  await openSettings(page, worker);
  await page.locator("#accessToken").fill("fixture-token");
  await page.evaluate(() => {
    window.testRequests = 0;
    chrome.runtime.sendMessage = () => {
      window.testRequests++;
      return new Promise((resolve, reject) => { window.testReject = reject; });
    };
  });
  const button = page.getByRole("button", { name: "保存并连接" });
  await button.click();
  await expect(button).toBeDisabled();
  await page.locator("#connectionForm").dispatchEvent("submit");
  expect(await page.evaluate(() => window.testRequests)).toBe(1);
  await page.evaluate(() => window.testReject(new Error("fixture disconnected")));
  await expect(page.locator("#connectionDetail")).toHaveText("Access Token 保存失败，请重试。");
  await expect(button).toBeEnabled();
});

test("preferences prevent duplicate writes, report failure and permit retry", async ({ page, worker }) => {
  await openSettings(page, worker);
  await page.locator("#soundEnabled").check();
  await page.evaluate(() => {
    window.testStorageSet = chrome.storage.local.set;
    window.testRequests = 0;
    chrome.storage.local.set = () => {
      window.testRequests++;
      return new Promise((resolve, reject) => { window.testReject = reject; });
    };
  });
  const button = page.locator("#saveSettings");
  await button.click();
  await expect(button).toBeDisabled();
  await button.dispatchEvent("click");
  expect(await page.evaluate(() => window.testRequests)).toBe(1);
  await page.evaluate(() => window.testReject(new Error("fixture storage failure")));
  await expect(page.locator("#settingsDetail")).toHaveText("设置保存失败，请重试。");
  await expect(button).toHaveClass("has-changes");
  await expect(button).toBeEnabled();
  await page.evaluate(() => { chrome.storage.local.set = window.testStorageSet; });
  await button.click();
  await expect(button).not.toHaveClass("has-changes");
  await expect(page.locator("#settingsDetail")).toBeEmpty();
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("soundEnabled")).soundEnabled)).toBe(true);
});

test("settings highlight unsaved changes, reset on revert and retain edits made during save", async ({ page, worker }) => {
  await worker.evaluate(() => {
    optionalChannels = [{ id: 123, name: "可选频道" }];
  });
  await openSettings(page, worker);
  const button = page.locator("#saveSettings");
  const originalColor = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(button).not.toHaveClass("has-changes");
  for (const selector of ["#soundEnabled", "input[data-channel-id]"]) {
    const input = page.locator(selector);
    await input.check();
    await expect(button).toHaveClass("has-changes");
    expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(originalColor);
    await expect(page.locator("#settingsDetail")).toBeEmpty();
    await input.uncheck();
    await expect(button).not.toHaveClass("has-changes");
  }
  for (const selector of ["#notificationVolume", "#messageFontSize"]) {
    const input = page.locator(selector);
    await input.focus();
    await input.press("ArrowRight");
    await expect(button).toHaveClass("has-changes");
    await input.press("ArrowLeft");
    await expect(button).not.toHaveClass("has-changes");
  }
  await page.locator("#soundEnabled").check();
  await page.evaluate(() => {
    window.testStorageSet = chrome.storage.local.set;
    chrome.storage.local.set = (settings) => new Promise((resolve) => {
      window.finishSave = async () => { await window.testStorageSet.call(chrome.storage.local, settings); resolve(); };
    });
  });
  await button.click();
  await page.locator("#messageFontSize").focus();
  await page.locator("#messageFontSize").press("ArrowRight");
  await page.evaluate(() => window.finishSave());
  await expect(button).toBeEnabled();
  await expect(button).toHaveClass("has-changes");
  await expect(page.locator("#settingsDetail")).toBeEmpty();
  await page.evaluate(() => { chrome.storage.local.set = window.testStorageSet; });
  await button.click();
  await expect(button).not.toHaveClass("has-changes");
  await page.reload();
  await expect(page.locator("#messageFontSize")).toHaveValue("16");
  await expect(button).not.toHaveClass("has-changes");
});

test("settings platform shortcuts and controls fit desktop and narrow windows", async ({ page, worker }) => {
  await openSettings(page, worker);
  const platforms = { GMGN: "https://gmgn.ai/", DeBot: "https://debot.ai/", "Binance Web3": "https://web3.binance.com/" };
  for (const [name, url] of Object.entries(platforms)) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  for (const width of [1280, 600, 560, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const control of await page.locator("button, input, a").all()) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
});
