# UniSignal Telegram Feed

在 GMGN 推特监控中查看 UniSignal Telegram 频道消息，按时间混排阅读，并直接打开消息中的代币页面。

[从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/unisignal-telegram-feed/hcbiofphajciknflaghdkneniajhjkgg) · [在线使用教程](https://unisignal.gitbook.io/unisignal/) · [获取 Access Token](https://t.me/unisignal_relay_bot?start=token)

## 功能

- 实时接收频道消息，在 GMGN 推特监控中按时间混排，也可切换为悬浮窗口。
- 展示 Telegram 文本格式和链接，支持消息编辑与删除同步。
- 提供 Telegram 原消息入口；识别到支持的合约信息时，可打开 BSC、Ethereum 和 Base 的 GMGN 代币页面。
- 支持可选频道、通知声音和消息字体设置。
- 在浏览器本地保存 Access Token、偏好设置和最近 100 条消息。

## 快速开始

需要桌面版 Chrome 116 或以上版本，以及用于连接 UniSignal 的 Access Token（连接凭证）。

1. 打开 [Chrome 应用商店页面](https://chromewebstore.google.com/detail/unisignal-telegram-feed/hcbiofphajciknflaghdkneniajhjkgg)，点击“添加至 Chrome”并确认安装。
2. 在浏览器工具栏的扩展菜单中固定 UniSignal。
3. 通过 [@unisignal_relay_bot](https://t.me/unisignal_relay_bot?start=token) 获取 Access Token。
4. 切换到非 GMGN 标签页，点击扩展图标，填写 Token 并点击“保存并连接”。
5. 状态变为“已连接”后，打开或刷新 [GMGN](https://gmgn.ai/)，打开推特监控面板，等待频道新消息。

在 GMGN 页面点击扩展图标可切换混排／悬浮模式；在非 GMGN 标签页点击图标可打开设置。连接或重连后自动拉取服务端最近 100 条消息，历史消息不播放提示音。只能补拉服务端启用保存后收到的消息。

## 使用文档

- [安装与更新](docs/installation.md)：通过 Chrome 应用商店安装。
- [获取连接凭证并连接](docs/connection.md)：首次连接步骤和状态说明。
- [在 GMGN 中查看消息](docs/messages.md)：显示模式、原消息和代币入口。
- [频道、声音和字体](docs/settings.md)：调整显示与通知偏好。
- [常见问题](docs/faq.md)：连接、消息显示和声音排查。

## 本地开发

这是一个无构建步骤、无运行时依赖的 Chrome Manifest V3 扩展。打开 `chrome://extensions/`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的本仓库目录。

混排模式在 GMGN 列表组件创建时接入消息数据：原生虚拟列表负责行高和滚动，Telegram 卡片复用扩展的 HTML 白名单清洗与渲染。接入依赖 GMGN 内部组件，网站更新后需复核；不会向 GMGN 的推文消息缓存写入 Telegram 数据。

修改后，在 `chrome://extensions/` 中点击 UniSignal 的重新加载按钮，再刷新 GMGN 页面。列表接入需要在页面脚本运行前初始化。

本地回归测试：`node --test tests/*.test.js`。

## 隐私

参见 [PRIVACY_POLICY.md](PRIVACY_POLICY.md)。
