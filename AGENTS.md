# AGENTS.md

本文件适用于整个 `unisignal-chrome-extension` 仓库。

## 项目目标

这是一个无构建步骤的 Chrome Manifest V3 扩展。它通过
`wss://wss.unisignal.xyz/ws` 接收 UniSignal Telegram 频道消息，并按时间混排到
GMGN 的推特监控列表中。

所有修改应遵循以下原则：

- 只做完成当前需求所必需的最小改动，不进行顺手重构或增加推测性兜底。
- 保持普通消息、旧版插件和现有 GMGN 路由行为兼容。
- 保留工作区中与当前任务无关的用户改动，不覆盖、不格式化、不提交这些改动。
- 静态检查不能替代真实 Chrome 页面验证；报告时明确区分两者。

## 主要文件

- `service-worker.js`：WSS 鉴权、重连、最近消息内存、向内容脚本广播。
- `content-script.js`：消息清洗、混排渲染、编辑覆盖、通知音和操作按钮。
- `gmgn-bridge.js`：主世界中的 GMGN 时间戳读取和原生路由跳转。
- `dashboard.html`、`dashboard.js`、`dashboard.css`：Access Token 设置页。
- `manifest.json`：权限、内容脚本、版本及可访问资源。
- `PRIVACY_POLICY.md`：中英文隐私政策，两种语言必须同步更新。
- `.github/workflows/release.yml`：标签触发的打包与 GitHub Release。

配套服务端位于相邻仓库：
`/home/pikacyan/UniSignal/unisignal-telegram-ws-server`。除非任务明确要求协议或服务端修改，
不要改动该仓库。

## 协议与兼容性约束

- 普通消息类型必须保持为 `telegram_message`。
- 编辑消息类型为 `telegram_message_edited`。
- 新消息载荷可以包含 `channel_id` 和 `message_id`，旧版插件会忽略新增字段。
- 消息身份由 `(channel_id, message_id)` 共同确定；编辑必须覆盖原消息，不能追加重复项。
- 普通新消息播放通知音；编辑消息不得播放通知音。
- 旧版插件不支持编辑是允许的，但普通消息必须继续正常工作。
- 服务端 `channel_id` 应是 Telegram `/c/` 链接使用的无 `-100` 前缀数字。
- 协议改变时必须同时检查服务端序列化、worker 校验、content script 渲染和旧客户端行为。

## 消息与 UI 行为

- 当前最近 20 条消息只保存在扩展内存中，不持久化。
- 未经明确要求，不得加入 `chrome.storage.local` 消息历史或 JSON 文件持久化。
- 如果改为持久化，必须同步更新中英文隐私政策中的数据类型、用途和保留期限。
- 正文 HTML 必须继续经过现有白名单清洗，禁止直接插入未经清洗的远端 HTML。
- 正文中的合约地址必须继续可点击并使用 GMGN 原生路由。
- 底部 CA 按钮是附加入口，不能替换或破坏正文合约链接。
- Telegram 原消息按钮仅在频道 ID 和消息 ID 均为整数时显示。
- 编辑标识使用“已编辑”；用户可见中文文案应保持自然且一致。
- 消息必须插入右侧推特监控的真实虚拟列表，禁止使用固定定位模拟最终效果。
- 保持现有深色视觉风格；按钮顺序为 Telegram 原消息在前、CA 按钮在后。

## 编码规则

- 使用原生 JavaScript、HTML 和 CSS，不引入构建工具或运行时依赖。
- 保持现有两空格缩进、分号和换行风格。
- 修改文件使用最小补丁，避免全文件格式化。
- SVG 优先复用 `icons/` 中的现有资源；作为页面 `<img>` 使用时需列入
  `web_accessible_resources`。
- 不记录、输出或提交 Access Token、Telegram 凭据、数据库地址及其他秘密。

## 必做验证

完成 JavaScript、Manifest 或 UI 修改后，至少运行：

```sh
node --check content-script.js
node --check service-worker.js
node --check gmgn-bridge.js
python3 -m json.tool manifest.json >/dev/null
git diff --check
```

根据改动补充以下验证：

- 消息协议：验证旧格式普通消息、新格式普通消息以及普通消息后再编辑。
- 编辑覆盖：worker 历史和页面都只能保留一条相同身份的消息。
- 通知音：用 Chrome 调试器确认普通消息进入播放分支、编辑消息不进入。
- Telegram 按钮：核对最终链接为 `https://t.me/c/<channel_id>/<message_id>`。
- CA 路由：实际点击并确认进入 `/<chain>/token/<address>`，同时核对正文链接仍可用。
- 图标：确认 `naturalWidth`、`naturalHeight` 大于零，且扩展运行错误为零。
- 所有临时消息、断点、路由替换和测试状态必须在验证后清理。

## WSL 与 Windows Chrome 调试

- Codex 运行在 WSL；用户当前加载扩展的 Windows 目录是
  `C:\Users\Administrator\Documents\uni`，对应
  `/mnt/c/Users/Administrator/Documents/uni`。
- 只有用户授权覆盖或要求实机调试时才同步到该目录；只复制本次必要文件，并用
  `sha256sum` 核对源文件和目标文件。
- Chrome 调试端口从 Chrome Canary 用户目录中的 `DevToolsActivePort` 读取，不要假定
  `/json/version` 可用；HTTP `/json/*` 返回 404 时，浏览器级 DevTools WebSocket 仍可能正常。
- 修改 Manifest 或可访问资源后必须重载扩展；修改内容脚本后刷新 GMGN 页面。
- 验证插入位置时使用真实 `worker -> content script -> GMGN 列表` 路径，不使用固定浮层预览。

## 隐私政策

以下变化需要复核并通常更新 `PRIVACY_POLICY.md`：

- 新增收集、传输或持久化的数据字段。
- 改变最近消息的存储位置或保留时间。
- 新增第三方请求、外部链接或数据共享方。
- 改变 Access Token、Telegram 用户 ID、频道成员状态或日志的处理方式。

中英文必须表达同一事实，并更新生效日期。不要把仅存在内存的数据描述为持久化数据，
也不要把 content script 与 service worker 的共同内存误写成仅后台进程内存。

## Commit 与 Release

- 提交前先检查 `git status`、`git diff` 和最近提交，避免混入用户的其他工作。
- Codex 创建的提交使用 `Codex <codex@openai.com>` 作为作者和提交者。
- 未经明确要求，不推送、打标签、删除 Release 或改写用户提交历史。
- Chrome Manifest 的 `version` 只能使用数字版本，例如 `1.2.0`。
- 预发布使用标签，例如 `1.2.0-beta.1`；包含 `-` 的标签由 Release 工作流标记为 prerelease。
- 每个 Release 必须包含准确的更新说明；不能只留下空白正文。
- 发布前确认 ZIP 包含 Manifest、三个 JavaScript 文件、设置页、图标和可选通知音，并核对
  包内 Manifest 版本。
- 大功能但保持向后兼容时优先提升次版本，例如 `1.1.x -> 1.2.0-beta.1`；只有破坏性变更才
  提升主版本。
