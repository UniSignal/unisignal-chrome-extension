const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../service-worker.js"), "utf8");
const message = (id, html = "正文", type = "telegram_message") => ({
  type, channel_id: 123, message_id: id, html, date: "2026-10-06T00:00:00Z",
});

async function worker() {
  const sockets = [];
  const events = [];
  const timers = new Map();
  let timerId = 0;
  let onConnect;
  let stored = [];
  class WebSocket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor(url) { this.url = url; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() {}
  }
  const context = vm.createContext({
    WebSocket,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return 0; }, clearInterval() {},
    chrome: {
      storage: { local: {
        async get() { return { accessToken: "test", messageHistory: [message(999)] }; },
        async set(data) { if (data.messageHistory) stored = structuredClone(data.messageHistory); },
      } },
      action: { onClicked: { addListener() {} } },
      runtime: {
        sendMessage: async () => {},
        onConnect: { addListener(fn) { onConnect = fn; } },
        onMessage: { addListener() {} },
      },
    },
  });
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  onConnect({
    name: "gmgn-feed", postMessage(data) { events.push(structuredClone(data)); },
    onDisconnect: { addListener() {} },
  });
  const receive = (data, socket = sockets.at(-1)) => socket.onmessage({ data: JSON.stringify(data) });
  return { sockets, events, timers, receive, context, stored: () => stored };
}

test("disconnects alternate endpoints; manual reconnect resets to primary and ignores stale closes", async () => {
  const w = await worker();
  assert.equal(w.sockets[0].url, "wss://wss.unisignal.xyz/ws");
  const staleClose = w.sockets[0].onclose;
  w.sockets[0].onclose();
  for (const [id, timeout] of [...w.timers]) {
    w.timers.delete(id);
    timeout();
  }
  assert.equal(w.sockets[1].url, "wss://wss.unisignal.dev/ws");
  w.sockets[1].onopen();
  assert.deepEqual(w.sockets[1].sent, [{ type: "auth", token: "test" }]);
  w.receive({ type: "authenticated" });
  w.receive({ type: "history", messages: [message(1)] });
  assert.deepEqual(w.stored(), [message(1)]);
  staleClose();
  assert.equal(w.timers.size, 0);
  w.sockets[1].onclose();
  for (const [id, timeout] of [...w.timers]) {
    w.timers.delete(id);
    timeout();
  }
  assert.equal(w.sockets[2].url, "wss://wss.unisignal.xyz/ws");
  w.sockets[2].onclose();
  vm.runInContext('connect("replacement")', w.context);
  assert.equal(w.timers.size, 0);
  assert.equal(w.sockets[3].url, "wss://wss.unisignal.xyz/ws");
  w.sockets[3].onopen();
  assert.deepEqual(w.sockets[3].sent, [{ type: "auth", token: "replacement" }]);
});

test("authentication pulls history; snapshot preserves live edits/deletes without replaying alerts", async () => {
  const w = await worker();
  w.receive({ type: "authenticated", optional_channels: [{ id: 123, name: "频道" }] });
  assert.deepEqual(w.sockets[0].sent, [{ type: "history" }]);
  w.receive(message(1, "新正文", "telegram_message_edited"));
  w.receive({ type: "telegram_message_deleted", channel_id: 123, message_id: 2 });
  w.receive(message(3));
  const liveCount = w.events.filter((event) => event.type === "telegram-message").length;
  w.receive({ type: "history", messages: [message(1), message(2), null, { type: "telegram_message" }] });
  assert.deepEqual(w.stored(), [message(1, "新正文", "telegram_message_edited"), message(3)]);
  assert.equal(w.events.at(-1).type, "snapshot");
  assert.deepEqual(w.events.at(-1).optionalChannels, [{ id: 123, name: "频道" }]);
  assert.equal(w.events.filter((event) => event.type === "telegram-message").length, liveCount);
  assert.equal(w.timers.size, 0);
});

test("history is capped, empty snapshots clear stale data, and reconnect requests again", async () => {
  const w = await worker();
  w.receive({ type: "authenticated" });
  w.receive({ type: "history", messages: Array.from({ length: 105 }, (_, i) => message(i)) });
  assert.equal(w.stored().length, 100);
  assert.equal(w.stored()[0].message_id, 5);
  vm.runInContext('connect("test")', w.context);
  w.receive({ type: "authenticated" });
  assert.deepEqual(w.sockets[1].sent, [{ type: "history" }]);
  w.receive({ type: "history", messages: [] });
  assert.deepEqual(w.stored(), []);
  w.receive(message(7), w.sockets[0]);
  assert.deepEqual(w.stored(), []);
});

test("older servers and legacy messages continue working when history is unsupported", async () => {
  const w = await worker();
  w.receive({ type: "authenticated" });
  const legacy = { type: "telegram_message", html: "旧格式", date: "2026-10-06T00:00:00Z" };
  w.receive(legacy);
  assert.deepEqual(w.stored().at(-1), legacy);
  for (const timeout of w.timers.values()) timeout();
  w.receive({ type: "history", messages: [] });
  assert.deepEqual(w.stored().at(-1), legacy);
  w.receive(message(1));
  w.receive(message(1, "修改", "telegram_message_edited"));
  assert.equal(w.stored().filter((item) => item.message_id === 1).length, 1);
});

test("content script snapshots and edits stay silent, ordinary messages play sound", () => {
  const content = fs.readFileSync(path.join(__dirname, "../content-script.js"), "utf8");
  const handler = content.slice(content.indexOf("function handleWorkerMessage("), content.indexOf("function connectToWorker("));
  let sounds = 0;
  const context = vm.createContext({
    MAX_MESSAGE_HISTORY: 100, setOptionalChannels() {}, scheduleRender() {},
    upsertMessage() {}, deleteMessage() {}, soundEnabled: true,
    shouldDisplayMessage: () => true,
    getNotificationSound: () => ({ url: "test", volume: 1 }),
    notificationAudio: { play() { sounds++; return Promise.resolve(); } },
  });
  vm.runInContext(handler, context);
  context.handleWorkerMessage({ type: "snapshot", messageHistory: [message(1)] });
  context.handleWorkerMessage({ type: "telegram-message", message: message(1, "修改", "telegram_message_edited") });
  assert.equal(sounds, 0);
  context.handleWorkerMessage({ type: "telegram-message", message: message(2) });
  assert.equal(sounds, 1);
});
