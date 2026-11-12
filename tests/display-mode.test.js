const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../content-script.js"), "utf8");
const siteConfig = source.slice(source.indexOf("const FLOATING_SITE"), source.indexOf("const TARGET_ROOT_SELECTOR"));
const setter = source.slice(source.indexOf("function setDisplayMode("), source.indexOf("function makeDisplayControlInteractive("));
const initialize = source.slice(source.indexOf("chrome.storage.local\n  .get("), source.indexOf("function mutationAffectsFeed("));

async function openPage(stored, hostname = "gmgn.ai") {
  const writes = [];
  const context = vm.createContext({
    location: { hostname },
    displayMode: "mixed", DEFAULT_NOTIFICATION_VOLUME: 50, DEFAULT_MESSAGE_FONT_SIZE: 15,
    normalizeNotificationVolume: (value) => value, normalizeMessageFontSize: (value) => value,
    connectToWorker() {}, scheduleRender() {}, console,
    chrome: { storage: { local: {
      async get(defaults) { return { ...defaults, ...stored }; },
      async set(value) { writes.push(value); Object.assign(stored, value); },
    } } },
  });
  vm.runInContext(`${siteConfig}\n${setter}`, context);
  await vm.runInContext(initialize, context);
  return { context, writes };
}

test("display mode survives reopening and mixed mode can be saved again", async () => {
  const stored = {};
  const first = await openPage(stored);
  assert.equal(first.context.displayMode, "mixed");
  first.context.setDisplayMode("floating");
  first.context.setDisplayMode("floating");
  assert.equal(first.writes.length, 1);
  assert.deepEqual(Object.keys(stored), ["displayMode"]);
  const second = await openPage(stored);
  assert.equal(second.context.displayMode, "floating");
  assert.equal(second.writes.length, 0);
  second.context.setDisplayMode("mixed");
  assert.equal((await openPage(stored)).context.displayMode, "mixed");
  assert.equal(first.context.displayMode, "floating");
});

test("missing or invalid saved modes use mixed mode", async () => {
  for (const displayMode of [undefined, null, "invalid", 1]) {
    assert.equal((await openPage({ displayMode })).context.displayMode, "mixed");
  }
});

test("DeBot defaults to floating and hiding it preserves the GMGN preference", async () => {
  const stored = { displayMode: "mixed" };
  const page = await openPage(stored, "debot.ai");
  assert.equal(page.context.displayMode, "floating");
  page.context.setDisplayMode("hidden");
  assert.equal((await openPage(stored, "debot.ai")).context.displayMode, "hidden");
  assert.equal((await openPage(stored)).context.displayMode, "mixed");
  page.context.setDisplayMode("floating");
  assert.equal((await openPage(stored, "debot.ai")).context.displayMode, "floating");
});

test("Binance floating visibility is independent of DeBot and GMGN", async () => {
  const stored = { displayMode: "mixed", debotDisplayMode: "hidden" };
  const binance = await openPage(stored, "web3.binance.com");
  assert.equal(binance.context.displayMode, "floating");
  binance.context.setDisplayMode("hidden");
  assert.equal((await openPage(stored, "web3.binance.com")).context.displayMode, "hidden");
  assert.equal((await openPage(stored, "debot.ai")).context.displayMode, "hidden");
  assert.equal((await openPage(stored)).context.displayMode, "mixed");
  binance.context.setDisplayMode("floating");
  assert.equal(stored.debotDisplayMode, "hidden");
});
