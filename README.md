# UniSignal Telegram Feed

Chrome Manifest V3 扩展，将 UniSignal Telegram 频道消息按时间混排到 GMGN 推特监控信息流中。

## 功能

- 通过 `wss://wss.unisignal.xyz/ws` 接收实时监控消息
- 按消息时间插入 GMGN 推特监控列表
- 展示 Telegram 文本格式和链接
- 识别 BSC 合约地址并通过 GMGN 原生路由打开代币页面
- 在浏览器本地保存 Access Token

## 安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本仓库目录。
4. 私聊 [@uni_signal_bot](https://t.me/uni_signal_bot) 获取 Access Token。
5. 点击扩展图标，填写 Token 并连接。
6. 打开或刷新 [GMGN](https://gmgn.ai/)。

## 隐私

参见 [PRIVACY_POLICY.md](PRIVACY_POLICY.md)。
