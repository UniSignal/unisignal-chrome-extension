# UniSignal Telegram Feed 隐私政策 / Privacy Policy

生效日期：2026 年 8 月 21 日  
Effective date: August 21, 2026

## 中文

### 适用范围与用途

本政策适用于 UniSignal Telegram Feed Chrome 扩展及其配套 Telegram 机器人和 WebSocket 服务。本扩展的单一用途是在 GMGN 推特监控信息流中按时间展示 UniSignal Telegram 频道消息，并提供 BSC、Ethereum 和 Base 合约地址跳转。

### 处理的数据

- **Access Token**：保存在 Chrome 本地存储中，并通过加密的 WSS 连接发送至 UniSignal 服务器进行鉴权。
- **Telegram 用户 ID 和频道成员状态**：服务器使用这些信息生成 Access Token，并确认用户是否仍为指定频道成员。
- **频道消息**：指定频道的新消息会实时发送给已授权客户端。服务器不将消息写入数据库；扩展仅在内存中保留最近 20 条消息。
- **GMGN 网站内容**：扩展仅在用户设备本地读取 GMGN 推特监控列表中的消息时间，用于混排消息，不会将 GMGN 页面内容上传至服务器。
- **运行日志**：服务器日志可能包含连接 IP、连接时间、错误信息和 Telegram 消息 ID，用于服务维护、安全和故障排查。

本扩展不会读取或收集钱包私钥、助记词、交易签名、付款卡信息或 GMGN 账户密码。

### 数据用途与共享

数据仅用于验证访问权限、同步频道成员、推送并展示监控消息，以及维护服务安全和稳定性。我们不会出售用户数据，也不会将数据用于广告、信用评估、贷款或与本扩展单一用途无关的目的。

为运行服务，服务器托管、数据库、反向代理或内容分发网络供应商可能在提供基础设施所必需的范围内处理数据。除法律要求、保护服务安全或完成服务运营所必需的情况外，我们不会向其他第三方披露用户数据。

### 存储与保留

- Access Token 保存在 Chrome 本地存储中，直至用户替换 Token、清除扩展数据或卸载扩展。
- 服务器在 PostgreSQL 中保存 Telegram 用户 ID、Access Token 和创建时间。
- 服务启动时及之后每 6 小时同步频道成员。用户退出频道后，其服务器端 Token 会被删除，现有 WebSocket 连接会被断开。
- 最近 20 条频道消息仅保存在扩展后台进程内存中。
- 运行日志仅在服务运营、安全和故障排查所需期间保留。

### 安全与用户选择

本扩展使用 WSS 加密传输 Access Token 和频道消息，并采取合理的访问控制措施。用户可以替换 Token、清除扩展数据、卸载扩展或退出指定频道来停止相关数据处理。

### 联系与变更

如有隐私或数据删除请求，请通过 Telegram 联系 [@uni_signal_bot](https://t.me/uni_signal_bot)。如数据处理方式发生重大变化，我们会更新本政策和 Chrome 应用商店披露。

---

## English

### Scope and Purpose

This policy applies to the UniSignal Telegram Feed Chrome extension and its supporting Telegram bot and WebSocket service. The Extension's single purpose is to display UniSignal Telegram channel messages chronologically in the GMGN X monitoring feed and provide navigation to BSC, Ethereum, and Base contract pages.

### Data We Process

- **Access Token**: Stored in Chrome local storage and sent to the UniSignal server over an encrypted WSS connection for authentication.
- **Telegram user ID and channel membership status**: Used by the server to generate Access Tokens and confirm continued membership in the designated channel.
- **Channel messages**: New messages from the designated channel are delivered in real time to authorized clients. The server does not store messages in its database; the Extension keeps only the 20 most recent messages in memory.
- **GMGN website content**: The Extension locally reads message timestamps from the GMGN X monitoring feed for chronological placement. GMGN page content is not uploaded to the server.
- **Operational logs**: Server logs may contain connection IP addresses, connection times, error details, and Telegram message IDs for maintenance, security, and troubleshooting.

The Extension does not read or collect wallet private keys, seed phrases, transaction signatures, payment card information, or GMGN account passwords.

### Use and Sharing

Data is used only to authenticate access, synchronize channel membership, deliver and display monitoring messages, and maintain service security and reliability. We do not sell user data or use it for advertising, credit assessment, lending, or purposes unrelated to the Extension's single purpose.

Infrastructure providers for hosting, databases, reverse proxies, or content delivery may process data only as necessary to provide those services. We do not otherwise disclose user data except when required by law, necessary to protect service security, or necessary to operate the service.

### Storage and Retention

- The Access Token remains in Chrome local storage until replaced, Extension data is cleared, or the Extension is uninstalled.
- The server stores the Telegram user ID, Access Token, and creation time in PostgreSQL.
- Membership is synchronized at service startup and every six hours. When a user leaves the channel, the server-side Token is deleted and existing WebSocket connections are closed.
- The 20 most recent channel messages are held only in Extension background memory.
- Operational logs are retained only as long as reasonably necessary for service operation, security, and troubleshooting.

### Security and User Choices

The Extension uses encrypted WSS connections for Access Tokens and channel messages and applies reasonable access controls. Users may replace the Token, clear Extension data, uninstall the Extension, or leave the designated channel to stop the related processing.

### Contact and Changes

For privacy questions or data deletion requests, contact [@uni_signal_bot](https://t.me/uni_signal_bot) on Telegram. If data practices change materially, we will update this policy and the Chrome Web Store disclosures.
