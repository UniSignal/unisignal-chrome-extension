const TARGET_SELECTOR =
  '[data-id="KEY_X_SNIPER_RND_V1"] [data-testid="virtuoso-item-list"]';
const MAX_MESSAGE_HISTORY = 20;
const ALLOWED_TAGS = new Set(["a", "blockquote", "code", "del", "em", "pre", "strong", "u"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tg:"]);
const CONTRACT_ADDRESS_PATTERN = /(?<![0-9a-f])0x[0-9a-f]{40}(?![0-9a-f])/i;

const MESSAGE_CSS = `
  :host {
    display: block;
    padding: 8px;
    color: #f3f5f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  article {
    padding: 10px;
    border: 1px solid rgb(101 214 196 / 32%);
    border-radius: 8px;
    background: rgb(16 28 31 / 96%);
  }
  article + article { margin-top: 7px; }
  .text { color: #e1e6ed; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .text a { color: #57bfff; }
  .text [data-gmgn-contract] { cursor: pointer; }
  .text code { padding: 1px 4px; border-radius: 4px; background: rgb(255 255 255 / 8%); color: #aee8d8; font-family: "SFMono-Regular", Consolas, monospace; }
  .text pre { margin: 8px 0 0; padding: 8px; overflow: auto; border-radius: 6px; background: rgb(0 0 0 / 28%); white-space: pre-wrap; }
  .text pre code { padding: 0; background: transparent; }
  .text blockquote { margin: 8px 0 0; padding-left: 9px; border-left: 3px solid #4f9189; color: #b4bdca; }
  time { display: block; margin-top: 7px; color: #7f8896; font-size: 10px; text-align: right; }
`;
const MESSAGE_STYLE_SHEET = new CSSStyleSheet();
MESSAGE_STYLE_SHEET.replaceSync(MESSAGE_CSS);
const TWITTER_EPOCH = 1_288_834_974_657n;

let messageHistory = [];
let renderTimer;
let reconnectTimer;
let workerPort;
let lastRenderSignature = "";
let activeTargetList;

function isAllowedLink(href) {
  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

function configureContractLink(link, address) {
  link.href = `${location.origin}/bsc/token/${address.toLowerCase()}`;
  link.target = "_self";
  link.rel = "";
  link.dataset.gmgnContract = address.toLowerCase();
}

function appendSanitizedHtml(container, html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  function appendNodes(source, target) {
    for (const node of source.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        target.append(document.createTextNode(node.textContent));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const tagName = node.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tagName)) {
        appendNodes(node, target);
        continue;
      }

      if (tagName === "a") {
        const href = node.getAttribute("href");
        if (!href || !isAllowedLink(href)) {
          appendNodes(node, target);
          continue;
        }
      }

      const element = document.createElement(tagName);
      if (tagName === "a") {
        element.href = node.getAttribute("href");
        element.target = "_blank";
        element.rel = "noopener noreferrer";
      }
      if (tagName === "code" && /^language-[\w+-]+$/.test(node.className)) {
        element.className = node.className;
      }
      appendNodes(node, element);
      target.append(element);
    }
  }

  appendNodes(template.content, container);
}

function markContractTargets(container) {
  for (const element of container.querySelectorAll("a, code")) {
    const address = `${element.getAttribute("href") || ""} ${element.textContent}`.match(
      CONTRACT_ADDRESS_PATTERN,
    )?.[0];
    if (!address) continue;

    element.dataset.gmgnContract = address.toLowerCase();
    if (element.tagName === "A") configureContractLink(element, address);
  }
}

function createMessageGroup(messages) {
  const host = document.createElement("unisignal-telegram-feed");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.adoptedStyleSheets = [MESSAGE_STYLE_SHEET];
  shadow.addEventListener("click", (event) => {
    const target = event
      .composedPath()
      .find((node) => node instanceof HTMLElement && node.dataset.gmgnContract);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    document.documentElement.dataset.unisignalNavigate =
      `/bsc/token/${target.dataset.gmgnContract}`;
    document.dispatchEvent(new Event("unisignal:navigate"));
  });

  for (const data of messages) {
    const article = document.createElement("article");
    const text = document.createElement("div");
    const time = document.createElement("time");
    text.className = "text";
    appendSanitizedHtml(text, data.html);
    markContractTargets(text);
    time.textContent = new Date(data.date).toLocaleString("zh-CN", { hour12: false });
    article.append(text, time);
    shadow.append(article);
  }
  return host;
}

function parseSnowflakeTime(tweetId) {
  if (!/^\d{15,20}$/.test(tweetId || "")) return null;
  return Number((BigInt(tweetId) >> 22n) + TWITTER_EPOCH);
}

function parseRelativeTime(item) {
  const timeElement = [...item.querySelectorAll("span")].find((element) =>
    /^\d+\s*[smhd]$/.test(element.textContent.trim()),
  );
  if (!timeElement) return null;

  const label = timeElement.textContent.trim();
  const [, amount, unit] = label.match(/^(\d+)\s*([smhd])$/);
  const unitMilliseconds = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return {
    label,
    timestamp: Date.now() - Number(amount) * unitMilliseconds[unit],
  };
}

function getVisibleTweets(targetList) {
  return [...targetList.querySelectorAll(":scope > [data-index]")]
    .map((wrapper) => {
      const tweetId = wrapper.dataset.unisignalTweetId;
      const relativeTime = parseRelativeTime(wrapper);
      return {
        index: Number(wrapper.dataset.index),
        item: wrapper.querySelector(":scope > .gmgn-vlist-item"),
        tweetId,
        identity:
          tweetId ||
          `${wrapper.querySelector('a[href^="https://x.com/"]')?.href}:${relativeTime?.label}`,
        timestamp: parseSnowflakeTime(tweetId) ?? relativeTime?.timestamp,
      };
    })
    .filter(({ item, timestamp }) => item && timestamp !== null)
    .sort((a, b) => a.index - b.index);
}

function buildBuckets(tweets) {
  const buckets = new Map();
  const messages = [...messageHistory].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  for (const message of messages) {
    const timestamp = Date.parse(message.date);
    if (Number.isNaN(timestamp)) continue;

    let anchor;
    if (timestamp > tweets[0].timestamp) {
      if (tweets[0].index !== 0) continue;
      anchor = tweets[0];
    } else {
      anchor = tweets.slice(1).find((tweet) => timestamp > tweet.timestamp);
    }
    if (!anchor) continue;

    if (!buckets.has(anchor)) buckets.set(anchor, []);
    buckets.get(anchor).push(message);
  }
  return buckets;
}

function findActiveTargetList() {
  const lists = [...document.querySelectorAll(TARGET_SELECTOR)];
  const activeList = lists.find((list) => {
    const rect = list.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  for (const list of lists) {
    if (list === activeList) continue;
    for (const group of list.querySelectorAll("unisignal-telegram-feed")) group.remove();
  }

  if (activeList !== activeTargetList) {
    activeTargetList = activeList;
    lastRenderSignature = "";
  }
  return activeList;
}

function renderMixedFeed() {
  const targetList = findActiveTargetList();
  if (!targetList) return;

  const tweets = getVisibleTweets(targetList);
  if (tweets.length === 0) return;

  const buckets = buildBuckets(tweets);
  const signature = JSON.stringify({
    messages: messageHistory.map(({ date, html }) => [date, html]),
    tweets: tweets.map(({ index, identity }) => [index, identity]),
  });
  const existingGroups = targetList.querySelectorAll("unisignal-telegram-feed");
  if (signature === lastRenderSignature && existingGroups.length === buckets.size) return;

  for (const group of existingGroups) group.remove();
  for (const [anchor, messages] of buckets) {
    anchor.item.before(createMessageGroup(messages));
  }
  lastRenderSignature = signature;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderMixedFeed, 100);
}

function handleWorkerMessage(message) {
  if (message.type === "snapshot") {
    messageHistory = message.messageHistory.slice(-MAX_MESSAGE_HISTORY);
    scheduleRender();
  } else if (message.type === "telegram-message") {
    messageHistory.push(message.message);
    messageHistory = messageHistory.slice(-MAX_MESSAGE_HISTORY);
    scheduleRender();
  }
}

function connectToWorker() {
  clearTimeout(reconnectTimer);
  try {
    if (!chrome.runtime.id) return;
    workerPort = chrome.runtime.connect({ name: "gmgn-feed" });
  } catch {
    return;
  }
  workerPort.onMessage.addListener(handleWorkerMessage);
  workerPort.onDisconnect.addListener(() => {
    workerPort = null;
    reconnectTimer = setTimeout(connectToWorker, 1_000);
  });
}

connectToWorker();
scheduleRender();

new MutationObserver(scheduleRender).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-unisignal-tweet-id"],
  childList: true,
  subtree: true,
});
