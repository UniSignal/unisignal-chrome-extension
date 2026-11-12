const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../floating-bridge.js"), "utf8");
const tokenPath = "/token/bsc/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

function page(withRouter = true, pathname = "/", hostname = "debot.ai", basename = "") {
  const navigations = [];
  const warnings = [];
  const dataset = {};
  const navigator = { basename, push(value) { assert.equal(this, navigator); navigations.push(value); } };
  const value = hostname === "web3.binance.com" ? { router: navigator } : { navigator };
  const link = { __reactFiber$test: { return: { memoizedProps: { value } } } };
  let listener;
  vm.runInNewContext(source, {
    location: { pathname, hostname },
    console: { warn: (value) => warnings.push(value) },
    document: {
      documentElement: { dataset },
      querySelector: () => withRouter ? link : null,
      addEventListener: (_name, callback) => { listener = callback; },
    },
  });
  return { navigations, warnings, navigate(value) { dataset.unisignalNavigate = value; listener(); } };
}

test("DeBot uses its existing navigator for a token route", () => {
  const p = page();
  p.navigate(tokenPath);
  assert.deepEqual(p.navigations, [tokenPath]);
});

test("external, malformed and current routes are ignored", () => {
  const p = page(true, tokenPath);
  for (const value of [tokenPath, "https://example.com", "/token/bsc/invalid", "//example.com"]) p.navigate(value);
  assert.deepEqual(p.navigations, []);
});

test("missing DeBot navigator reports failure without reloading", () => {
  const p = page(false);
  p.navigate(tokenPath);
  assert.equal(p.warnings.length, 1);
  assert.deepEqual(p.navigations, []);
});

test("Binance uses its router without duplicating the current language prefix", () => {
  for (const locale of ["/en", "/zh-CN", "/en-NG"]) {
    const p = page(true, `${locale}/markets`, "web3.binance.com", locale);
    p.navigate(tokenPath);
    assert.deepEqual(p.navigations, [tokenPath]);
    const current = page(true, `${locale}${tokenPath}`, "web3.binance.com", locale);
    current.navigate(tokenPath);
    assert.deepEqual(current.navigations, []);
  }
});
