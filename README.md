# 见渊
Personal Awareness

“AI 提出可能性，你决定它对你意味着什么。”

记录 → 觉察 → 理解 → 探索

见渊把你的经历放回你自己手中：你写下原话，AI 只提出临时观察，你的回应和解释成为长期记录。它不替你定义“你是谁”，也不把模式包装成结论。

## 产品状态

- **Early Preview / Alpha**
- 本产品仍在早期开发阶段，功能和界面会继续调整。
- **Local-first**：数据保存在本机。
- **Windows Desktop**：当前提供 Windows 安装包。
- **AI Provider configuration**：AI 可选，由你自行配置。
- **SQLite currently NOT encrypted at rest**：当前数据库未加密。
- **Cloud Sync 未完成**。
- **Mobile 未完成**。

## 核心语义

```text
Record → AI Observation（临时）→ User Reflection → Core Gate → Relation / Evidence
```

- AI 是观察者，不是解释者。
- 只有你的自由文字会进入 Core Gate。
- 你拒绝的观察不会成为长期联系或证据。
- AI 观察始终标记为临时。

## 安装

1. 下载 `见渊_0.2.0-alpha_x64-setup.exe`。
2. 双击安装，按提示完成。
3. 启动见渊。

不需要 Node、Rust 或终端。

## AI 服务

AI 默认关闭。你可以在设置中自行配置 OpenAI-compatible 服务：

- Base URL
- API Key（只写入系统凭据存储）
- 模型标识

如果你不启用 AI，记录功能仍然完整可用。

## 数据与隐私

- 数据保存在本机 SQLite 数据库。
- 当前版本数据库未加密（`NOT encrypted at rest`）。
- 导出内容是明文 JSON，不代表加密备份。
- 不会上传你的记录或自动生成画像。

## 本地开发

```bash
npm install
npm run dev
```

桌面开发：

```bash
cd apps/desktop
npm run dev
```

## 构建

```bash
npm install
npm run build
```

桌面原生构建：

```bash
cd apps/desktop
npm run build
```
