# 见渊 v0.2.2 — Functional Foundation

这是进入全新 Mobile UI / UX 阶段之前的功能基线版本。

v0.2.2 冻结当前“简单 UI + 完整功能底座”阶段，不代表最终稳定版或 1.0。

## 核心能力

- 本地优先 Record
- Awareness
- Automatic Awareness
- User Reflection
- Understanding
- Exploration
- 四空间 Local Search
- AI Provider configuration
- SecureStore / Keychain
- Export / Restore
- Degraded Mode

## 觉察质量改进

- 没有明显联系时允许 `NO_OBSERVATION`
- 不再因同日、时间接近等弱信号强行生成觉察
- 简体中文输出约束
- Adaptive Awareness：只说真正需要说的内容
- question / explanation / uncertainty 不再强制齐全
- Awareness New / History 生命周期

## Mobile

- Automatic Awareness Inbox
- quiet-window batching
- new-record anchor
- Awareness unread state
- Reflection persistence
- 四空间 Local Search

## Desktop

- M2.2 / M2.3 Awareness Quality 已进入最新 production build
- `NO_OBSERVATION`
- Adaptive Awareness rendering
- Windows console suppression

## Known Limitations

- Mobile 某些 Reflection 提交流程中，数据已经成功持久化时，UI 成功反馈仍可能偶发滞后，出现“保存成功但仍继续显示正在保存”的 presentation-state 问题。这不是数据丢失，但 UI 状态仍需继续观察。
- Exploration 功能已实现，但真实 Persistent Relation 数据不足，本轮没有完成充分的真实设备场景覆盖。
- Desktop 当前没有实现 Mobile 的 Automatic Awareness Inbox / 自动保存后觉察。该能力目前仅属于 Mobile。
- SQLite 数据仍未做完整数据库级加密，at-rest 保护尚未完成。
- Windows installer 当前为未签名的开发/测试构建。
- iOS 产物为 unsigned IPA，不是 App Store 包，普通 iPhone 不能直接安装，需要用户自己的签名或重签环境。

## iOS Unsigned IPA

v0.2.2 的 iOS 资产来自 GitHub Actions 的 `iOS Unsigned Build` workflow：

- `Jianyuan-iOS-unsigned.ipa`
- `Jianyuan-iOS-unsigned.app.zip`

这些文件是未签名开发/测试构建，不是 App Store 包，不包含 Apple notarization 或官方分发签名。

## 下一阶段

v0.3.0 development：

- Mobile UI / UX
- Motion System
- Awareness Bubble / Ripple
- 更完整的空间交互
