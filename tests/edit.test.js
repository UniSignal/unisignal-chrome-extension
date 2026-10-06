const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../gmgn-bridge.js"), "utf8");
const updateSource = source.slice(
  source.indexOf("  function updateNativeMessages("),
  source.indexOf("  function hasNativeSubscribers("),
);

function setup(items) {
  let state = items;
  const hook = {
    memoizedState: items,
    queue: { dispatch(update) { state = update(state); } },
  };
  const element = { __reactFiber$test: { memoizedState: hook } };
  // 只渲染普通推文，待编辑的插件消息可以处于虚拟列表可视区域外。
  const wrapper = { querySelector: () => element };
  const context = vm.createContext({
    UNISIGNAL_ITEM_PREFIX: "unisignal:", ITEM_SELECTOR: "unused",
    document: { querySelectorAll: () => [wrapper, wrapper] },
    getItemData: () => items[0],
  });
  vm.runInContext(updateSource, context);
  return { update: context.updateNativeMessages, state: () => state };
}

const ordinary = { id: "native", content: { text: "原生消息" } };
const existing = {
  id: "unisignal:1:2", user: { twitter_user_id: "native-user", name: "旧标题" },
  content: { text: "旧正文" }, token: { ca: "old", price: 123 },
  translation: { zh: { content: "过期翻译" } },
};
const edited = {
  key: "1:2", title: "频道（已编辑）", text: "更新正文",
  date: "2026-10-06T00:00:00Z", telegramUrl: "https://t.me/c/1/2", avatar: "avatar",
};

test("edit updates existing offscreen message and removes stale CA and translation", () => {
  const w = setup([ordinary, existing]);
  assert.deepEqual([...w.update([edited])], ["1:2"]);
  assert.equal(w.state().length, 2);
  assert.equal(w.state()[0], ordinary);
  assert.equal(w.state()[1].content.text, "更新正文");
  assert.equal(w.state()[1].user.name, edited.title);
  assert.equal(w.state()[1].user.twitter_user_id, "native-user");
  assert.equal(w.state()[1].user.url, edited.telegramUrl);
  assert.equal(w.state()[1].token, undefined);
  assert.equal(w.state()[1].translation, undefined);
  assert.equal(existing.content.text, "旧正文");
});

test("changing CA replaces old token metadata without appending another row", () => {
  const w = setup([ordinary, existing]);
  w.update([{ ...edited, token: { chain: "bsc", address: "new" } }]);
  assert.equal(w.state().length, 2);
  assert.equal(w.state()[1].token.ca, "new");
  assert.equal(w.state()[1].token.price, undefined);
});

test("missing messages stay on the new-message path and absent keys do not remove rows", () => {
  const w = setup([ordinary, existing]);
  assert.deepEqual([...w.update([{ ...edited, key: "1:3" }])], []);
  assert.deepEqual([...w.update([])], []);
  assert.equal(w.state()[1], existing);
});
