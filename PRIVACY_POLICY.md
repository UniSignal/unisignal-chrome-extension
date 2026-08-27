# UniSignal Telegram Feed 隐私政策 / Privacy Policy

生效日期：2026 年 8 月 27 日

Effective date: August 27, 2026

## 中文

### 适用范围与用途

本政策适用于 UniSignal Telegram Feed Chrome 扩展及其配套 Telegram 机器人和 WebSocket 服务。本扩展的单一用途是在 GMGN 推特监控信息流中按时间展示 UniSignal Telegram 频道消息，并提供 BSC、Ethereum 和 Base 合约地址跳转。

### 处理的数据

- **Access Token**：保存在 Chrome 本地存储中。建立加密 WSS 连接后，扩展会在连接内发送 Access Token 至 UniSignal 服务器进行鉴权。
- **Telegram 用户 ID 和频道成员状态**：服务器在启动时及之后每 6 小时读取指定频道的成员列表，并为其中的非机器人、未删除账号生成或保留 Access Token。这包括尚未在机器人中请求 Token 或尚未使用本扩展的频道成员。
- **频道消息**：指定频道的新消息、编辑后的消息和删除通知会连同频道 ID、消息 ID 实时发送给已授权客户端。扩展使用这两个 ID 更新或删除同一条消息，并生成 Telegram 原消息链接。服务器不将消息写入数据库；扩展在 Chrome 本地存储中保留最近 100 条消息及其上述元数据。
- **GMGN 网站内容和设置**：扩展仅在用户设备本地读取 GMGN 推特监控列表中的消息时间以混排消息，并读取 GMGN 推特监控提示音的类型、开关状态和音量，用于其他频道的本地提示音；这些数据不会上传至服务器。
- **扩展显示与声音偏好**：用户选择的 Unisignal Feed 显示开关、通知声音开关、通知音量和消息字体大小保存在 Chrome 本地存储中，仅用于控制扩展在本机的显示和声音；这些数据不会上传至服务器。
- **运行日志**：服务器日志可能包含连接 IP、连接时间、错误信息和 Telegram 消息 ID，用于服务维护、安全和故障排查。

本扩展不会读取或收集钱包私钥、助记词、交易签名、付款卡信息或 GMGN 账户密码。

### 数据用途与共享

数据仅用于验证访问权限、同步频道成员、推送并展示监控消息，以及维护服务安全和稳定性。我们不会出售用户数据，也不会将数据用于广告、信用评估、贷款或与本扩展单一用途无关的目的。

为运行服务，以下第三方可能在提供其服务所必需的范围内处理数据：

- **Telegram**：承载机器人对话和指定频道，并提供 Telegram 用户 ID、频道成员状态及频道消息。用户点击“Telegram 原消息”按钮时，浏览器会访问 Telegram 对应的消息链接，Telegram 可能按照其政策处理该请求的 IP 和请求元数据。
- **Cloudflare**：为 `wss.unisignal.xyz` 提供反向代理和安全服务，因此可能处理连接 IP、连接元数据及代理的 WSS 流量，包括用于鉴权的 Access Token 和频道消息。
- **GitHub**：通过 GitHub Pages 托管本隐私政策页面，并可能按照 GitHub 的政策处理访问者的 IP 和请求元数据。扩展不会向 GitHub 发送 Access Token、Telegram 数据或 GMGN 页面内容。

除上述服务提供商、法律要求、保护服务安全或完成服务运营所必需的情况外，我们不会向其他第三方披露用户数据。

我们对用户数据的使用遵守 Chrome Web Store User Data Policy，包括 Limited Use 要求。

### 存储与保留

- Access Token 保存在 Chrome 本地存储中，直至用户替换 Token、清除扩展数据或卸载扩展。
- 服务器在 PostgreSQL 中保存 Telegram 用户 ID、Access Token 和创建时间。
- 服务启动时及之后每 6 小时同步频道成员。用户退出频道后，其服务器端 Telegram 用户 ID 和 Access Token 会在下一次成功同步时被删除，现有 WebSocket 连接会被断开；通常不超过 6 小时，但同步失败时可能更久。
- 最近 100 条频道消息及其频道 ID、消息 ID 保存在 Chrome 本地存储中。较旧消息会被自动替换；服务器收到 Telegram 删除通知时，对应消息也会被删除；其余消息保留至用户清除扩展数据或卸载扩展。
- Unisignal Feed 显示开关、通知声音开关、通知音量和消息字体大小保存在 Chrome 本地存储中，直至用户再次调整、清除扩展数据或卸载扩展。
- 运行日志仅在服务运营、安全和故障排查所需期间保留。

### 安全与用户选择

本扩展使用 WSS 加密传输 Access Token 和频道消息，并采取合理的访问控制措施。用户可以替换 Token、清除扩展数据、卸载扩展或退出指定频道来停止相关数据处理。

### 联系与变更

如有隐私或数据删除请求，请通过 Telegram 联系 [@unisignal_relay_bot](https://t.me/unisignal_relay_bot)。如数据处理方式发生重大变化，我们会更新本政策和 Chrome 应用商店披露。

---

## English

### Scope and Purpose

This policy applies to the UniSignal Telegram Feed Chrome extension and its supporting Telegram bot and WebSocket service. The Extension's single purpose is to display UniSignal Telegram channel messages chronologically in the GMGN X monitoring feed and provide navigation to BSC, Ethereum, and Base contract pages.

### Data We Process

- **Access Token**: Stored in Chrome local storage. After an encrypted WSS connection is established, the Extension sends the Access Token to the UniSignal server within that connection for authentication.
- **Telegram user ID and channel membership status**: At startup and every six hours thereafter, the server reads the designated channel's member list and generates or retains an Access Token for each non-bot, non-deleted account. This includes channel members who have not requested a Token from the bot or used the Extension.
- **Channel messages**: New messages, edited messages, and deletion notices from the designated channel are delivered in real time to authorized clients together with their channel IDs and message IDs. The Extension uses these IDs to update or delete the same message and generate links to the original Telegram messages. The server does not store messages in its database; the Extension keeps only the 100 most recent messages and this metadata in Chrome local storage.
- **GMGN website content and settings**: The Extension locally reads message timestamps from the GMGN X monitoring feed for chronological placement and reads the type, enabled state, and volume of GMGN's X-monitor sound for local notifications from other channels. This data is not uploaded to the server.
- **Extension display and sound preferences**: The Unisignal Feed display toggle, notification-sound toggle, notification volume, and message font size selected by the user are stored in Chrome local storage solely to control the Extension's local display and sound. This data is not uploaded to the server.
- **Operational logs**: Server logs may contain connection IP addresses, connection times, error details, and Telegram message IDs for maintenance, security, and troubleshooting.

The Extension does not read or collect wallet private keys, seed phrases, transaction signatures, payment card information, or GMGN account passwords.

### Use and Sharing

Data is used only to authenticate access, synchronize channel membership, deliver and display monitoring messages, and maintain service security and reliability. We do not sell user data or use it for advertising, credit assessment, lending, or purposes unrelated to the Extension's single purpose.

The following third parties may process data only as necessary to provide their services:

- **Telegram**: Hosts bot conversations and the designated channel and provides Telegram user IDs, channel membership status, and channel messages. When a user clicks the "Original Telegram Message" button, the browser visits the corresponding Telegram message link, and Telegram may process the request's IP address and request metadata under its policies.
- **Cloudflare**: Provides reverse-proxy and security services for `wss.unisignal.xyz` and may therefore process connection IP addresses, connection metadata, and proxied WSS traffic, including the Access Token used for authentication and channel messages.
- **GitHub**: Hosts this privacy policy through GitHub Pages and may process visitors' IP addresses and request metadata under GitHub's policies. The Extension does not send Access Tokens, Telegram data, or GMGN page content to GitHub.

We do not otherwise disclose user data except to the providers listed above, when required by law, when necessary to protect service security, or when necessary to operate the service.

Our use of user data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

### Storage and Retention

- The Access Token remains in Chrome local storage until replaced, Extension data is cleared, or the Extension is uninstalled.
- The server stores the Telegram user ID, Access Token, and creation time in PostgreSQL.
- Membership is synchronized at service startup and every six hours. After a user leaves the channel, the server-side Telegram user ID and Access Token are deleted and existing WebSocket connections are closed at the next successful synchronization. This normally occurs within six hours but may take longer if synchronization fails.
- The 100 most recent channel messages and their channel IDs and message IDs are stored in Chrome local storage. Older messages are automatically replaced, and a corresponding message is also removed when the server receives a Telegram deletion notice. Other stored messages remain until the user clears Extension data or uninstalls the Extension.
- The Unisignal Feed display toggle, notification-sound toggle, notification volume, and message font size remain in Chrome local storage until adjusted again, Extension data is cleared, or the Extension is uninstalled.
- Operational logs are retained only as long as reasonably necessary for service operation, security, and troubleshooting.

### Security and User Choices

The Extension uses encrypted WSS connections for Access Tokens and channel messages and applies reasonable access controls. Users may replace the Token, clear Extension data, uninstall the Extension, or leave the designated channel to stop the related processing.

### Contact and Changes

For privacy questions or data deletion requests, contact [@unisignal_relay_bot](https://t.me/unisignal_relay_bot) on Telegram. If data practices change materially, we will update this policy and the Chrome Web Store disclosures.
