const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../gmgn-bridge.js"), "utf8");

function setup(inMonitor = true) {
  const handlers = new Map();
  const dataset = {};
  const subscribers = new Set();
  const states = [];
  let stateIndex = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    forwardRef: (render) => ({ render }),
    useRef: () => ({ current: null }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial === false ? inMonitor : initial;
      return [states[index], (value) => {
        states[index] = typeof value === "function" ? value(states[index]) : value;
      }];
    },
    useEffect: () => {},
    useLayoutEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useSyncExternalStore(subscribe, snapshot) {
      subscribe(() => subscribers.add("updated"));
      return snapshot();
    },
  };
  const context = vm.createContext({
    URLSearchParams,
    location: { search: "", pathname: "/" },
    document: {
      documentElement: { dataset, append() {} },
      addEventListener: (name, handler) => handlers.set(name, handler),
      createElement: () => ({}),
    },
    window: {},
  });
  vm.runInContext(source, context);
  const chunks = context.window.webpackChunk_N_E;
  const modules = {};
  const require = () => React;
  const register = (chunk) => Object.assign(modules, chunk[1]);
  // 模拟 webpack 先排队、随后替换 push 接管后续懒加载。
  chunks.push([[], { untouched: function () {} }]);
  const previousPush = chunks.push.bind(chunks);
  chunks.push = (chunk) => { register(chunk); previousPush(chunk); };
  chunks.push([[], {
    list(module, exports, require) {
      // gmgn-vlist-item renderItem：真实模块用这两个特征定位。
      const React = require("react");
      module.exports.List = { type: React.forwardRef((props) => props) };
    },
  }]);
  const module = { exports: {} };
  modules.list(module, module.exports, require);
  const nativeProps = {
    data: [],
    itemKey: (item) => `${item.id}_${item.tw_type}_${item.tw_timestamp}`,
    renderItem: (item, index) => ({ item, index }),
  };
  return {
    subscribers,
    chunks,
    setMessages(messages) {
      dataset.unisignalMessages = JSON.stringify(messages);
      handlers.get("unisignal:sync-messages")();
      assert.equal(dataset.unisignalMessages, undefined);
    },
    render(items = []) {
      stateIndex = 0;
      const wrapper = module.exports.List.type.render({ ...nativeProps, data: items }, null);
      const tree = wrapper.type(wrapper.props);
      return tree.children[0].props;
    },
  };
}

const native = (id, timestamp) => ({ id, tw_timestamp: String(timestamp), tw_type: "tweet" });

test("merged list sorts by time while preserving native objects, keys and render indexes", () => {
  const bridge = setup();
  const items = [native("new", 300), native("old", 100)];
  bridge.setMessages([{ key: "1:2", timestamp: 200 }]);
  const props = bridge.render(items);
  assert.equal(props.data.length, 3);
  assert.equal(props.data[0].item, items[0]);
  assert.equal(props.data[2].item, items[1]);
  assert.equal(props.itemKey(props.data[1]), "unisignal:1:2");
  assert.equal(props.itemKey(props.data[2]), "old_tweet_100");
  assert.deepEqual(props.renderItem(props.data[2]), { item: items[1], index: 1 });
  assert.equal(props.renderItem(props.data[1]).type, "unisignal-telegram-feed");
  assert.equal(items.length, 2);
});

test("complete snapshots replace edited rows and remove deleted or disabled channel rows", () => {
  const bridge = setup();
  bridge.setMessages([{ key: "1:2", timestamp: 100 }, { key: "3:2", timestamp: 150 }]);
  assert.equal(bridge.render().data.length, 2);
  bridge.setMessages([{ key: "1:2", timestamp: 200 }]);
  const props = bridge.render();
  assert.equal(props.data.length, 1);
  assert.equal(props.data[0].message.timestamp, 200);
  assert.equal(props.itemKey(props.data[0]), "unisignal:1:2");
  assert.ok(bridge.subscribers.has("updated"));
});

test("switching to floating restores native data and switching back does not duplicate rows", () => {
  const bridge = setup();
  const items = [native("native", 100)];
  const snapshot = [{ key: "legacy:123", timestamp: 200 }];
  bridge.setMessages(snapshot);
  assert.equal(bridge.render(items).data.length, 2);
  bridge.setMessages([]);
  assert.equal(bridge.render(items).data, items);
  bridge.setMessages(snapshot);
  bridge.setMessages(snapshot);
  assert.equal(bridge.render(items).data.length, 2);
});

test("invalid page bridge payload does not replace the last valid snapshot", () => {
  const bridge = setup();
  bridge.setMessages([{ key: "1:2", timestamp: 200 }]);
  for (const payload of [null, {}, [null], [{ key: "bad", timestamp: null }]]) {
    bridge.setMessages(payload);
    assert.equal(bridge.render().data[0].message.key, "1:2");
  }
});

test("reading pauses new rows until top, while edits and removals still apply", () => {
  const bridge = setup();
  bridge.setMessages([{ key: "1:1", timestamp: 100 }, { key: "1:2", timestamp: 200 }]);
  bridge.render().onScroll({ currentTarget: { scrollTop: 1000 } });
  bridge.setMessages([{ key: "1:2", timestamp: 250 }, { key: "1:3", timestamp: 300 }]);
  let props = bridge.render();
  assert.equal(props.data.length, 1);
  assert.equal(props.data[0].message.key, "1:2");
  assert.equal(props.data[0].message.timestamp, 250);
  props.onScroll({ currentTarget: { scrollTop: 0 } });
  props = bridge.render();
  assert.equal(props.data.length, 2);
  assert.equal(props.data[0].message.key, "1:3");
});

test("lists outside the monitor retain their original data", () => {
  const bridge = setup(false);
  const items = [native("unrelated", 100)];
  bridge.setMessages([{ key: "1:2", timestamp: 200 }]);
  const props = bridge.render(items);
  assert.equal(props.data, items);
  assert.deepEqual(props.renderItem(items[0], 0), { item: items[0], index: 0 });
});
