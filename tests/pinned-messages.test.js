const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../gmgn-bridge.js"), "utf8");
const mergeSource = source.slice(source.indexOf("  function mergeMessages("), source.indexOf("  function installListRenderer("));
const mergeMessages = vm.runInNewContext(`${mergeSource}\nmergeMessages`);
const tweet = (id, time, type = "tweet") => ({ id, tw_type: type, tw_timestamp: String(time) });
const ids = (rows) => Array.from(rows, (row) => row.item?.id ?? row.message.key);

test("pinned tweets stay ahead of newer tweets and Telegram messages without mutating native data", () => {
  const native = [tweet("pin1", 100), tweet("pin2", 200), tweet("new", 400), tweet("old", 50)];
  const telegram = [{ key: "tg-old", timestamp: 150 }, { key: "tg-new", timestamp: 500 }];
  const before = JSON.stringify([native, telegram]);
  const rows = mergeMessages(native, telegram, (id) => id.startsWith("pin"));
  assert.deepEqual(ids(rows), ["pin1", "pin2", "tg-new", "new", "tg-old", "old"]);
  assert.equal(JSON.stringify([native, telegram]), before);
  for (const row of rows.filter((row) => row.item)) assert.equal(row.item, native[row.index]);
});

test("a newest or sole pinned tweet also stays above a newer Telegram message", () => {
  for (const native of [[tweet("pin", 200)], [tweet("pin", 200), tweet("ordinary", 100)]]) {
    assert.equal(ids(mergeMessages(native, [{ key: "tg", timestamp: 300 }], (id) => id === "pin"))[0], "pin");
  }
});

test("cancellation and expiration return the tweet to chronological order", () => {
  const native = [tweet("pin", 100), tweet("new", 300)];
  const telegram = [{ key: "tg", timestamp: 200 }];
  let active = true;
  const isPinned = (id) => active && id === "pin";
  assert.deepEqual(ids(mergeMessages(native, telegram, isPinned)), ["pin", "new", "tg"]);
  active = false;
  assert.deepEqual(ids(mergeMessages(native, telegram, isPinned)), ["new", "tg", "pin"]);
});

test("pin identity includes the event type", () => {
  const native = [tweet("same", 100), tweet("same", 300, "reply")];
  const rows = mergeMessages(native, [{ key: "tg", timestamp: 400 }], (id, type) => id === "same" && type === "tweet");
  assert.equal(rows[0].item.tw_type, "tweet");
  assert.equal(rows[1].message.key, "tg");
  assert.equal(rows[2].item.tw_type, "reply");
});

test("ordinary, empty and equal-time lists keep existing chronological behavior", () => {
  const native = [tweet("first", 200), tweet("second", 200), tweet("old", 100)];
  assert.deepEqual(ids(mergeMessages(native, [{ key: "tg", timestamp: 200 }])), ["first", "second", "tg", "old"]);
  assert.deepEqual(ids(mergeMessages([], [{ key: "tg", timestamp: 200 }])), ["tg"]);
  assert.deepEqual(ids(mergeMessages(native, [])), ["first", "second", "old"]);
  assert.deepEqual(ids(mergeMessages([], [])), []);
});
