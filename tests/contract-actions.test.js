const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../content-script.js"), "utf8");
const patterns = source.slice(source.indexOf("const CONTRACT_ADDRESS_PATTERN"), source.indexOf("const MESSAGE_CSS"));
const functions = source.slice(source.indexOf("function markContractTargets"), source.indexOf("function createMessageGroup"));
const address = "0x94772dc9d30bcc0e2f1c0ca1118dda631c1b2543";

function element() {
  return { dataset: {}, children: [], append(...children) { this.children.push(...children); } };
}

const { markContractTargets, createMessageActions } = vm.runInNewContext(
  `${patterns}\n${functions}\n({ markContractTargets, createMessageActions })`,
  { URL, document: { createElement: element }, chrome: { runtime: { getURL: (file) => file } } },
);

for (const chain of [
  "bsc", "eth", "base", "robinhood", "arbitrum", "hyperevm", "arc", "stable",
  "monad", "megaeth", "xlayer", "future-evm_123",
]) {
  test(`${chain}: GMGN link creates one CA button and marks the body contract`, () => {
    const link = { href: `https://gmgn.ai/${chain}/token/ref_${address}`, dataset: {} };
    const code = { textContent: address, dataset: {} };
    const contracts = markContractTargets({
      textContent: `${address} https://gmgn.ai/${chain}/token/${address}`,
      querySelectorAll: (selector) => selector === "a" ? [link] : [code],
    });
    assert.equal(contracts.length, 1);
    for (const target of [link, code]) {
      assert.equal(target.dataset.gmgnChain, chain);
      assert.equal(target.dataset.gmgnContract, address);
    }
    const actions = createMessageActions({ channel_id: 123, message_id: 456 }, contracts);
    assert.equal(actions.children.length, 2);
    assert.equal(actions.children[0].href, "https://t.me/c/123/456");
    assert.equal(actions.children[1].dataset.gmgnChain, chain);
    assert.equal(actions.children[1].dataset.gmgnContract, address);
  });
}

test("plain Robinhood URL creates a CA button", () => {
  const contracts = markContractTargets({
    textContent: `https://gmgn.ai/robinhood/token/${address}。`,
    querySelectorAll: () => [],
  });
  const actions = createMessageActions({}, contracts);
  assert.equal(actions.children.length, 1);
  assert.equal(actions.children[0].dataset.gmgnChain, "robinhood");
});

test("unrelated hosts, invalid chain paths and non-EVM addresses do not create CA buttons", () => {
  for (const href of [
    `https://example.com/robinhood/token/${address}`,
    `https://gmgn.ai/invalid.chain/token/${address}`,
    `https://gmgn.ai//token/${address}`,
    `https://gmgn.ai/robinhood/token/${address.slice(0, -1)}`,
    `https://gmgn.ai/eth/token/${address}0`,
    "https://gmgn.ai/sol/token/So11111111111111111111111111111111111111112",
    "https://gmgn.ai/tron/token/TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
  ]) {
    const contracts = markContractTargets({
      textContent: "",
      querySelectorAll: (selector) => selector === "a" ? [{ href, dataset: {} }] : [],
    });
    assert.equal(createMessageActions({}, contracts).children.length, 0);
  }
});
